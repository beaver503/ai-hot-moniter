/**
 * 热点聚合管道：搜索领域词近 24h 内容 → AI 聚类打分 → 热点榜快照
 */
import { db, getSettings, now } from './db.js';
import { searchAll } from './providers/index.js';
import { aggregateHotspots, NoApiKeyError } from './ai.js';
import { urlHash } from './dedupe.js';
import { broadcast } from './notify/sse.js';

const running = new Set();
export const isAggregating = (id) => running.has(id);

export async function runHotspotScan(kw, { fetchImpl = fetch } = {}) {
  if (running.has(kw.id)) return { skipped: true };
  running.add(kw.id);
  const logId = db.prepare('INSERT INTO scan_log(keyword_id, started_at, status) VALUES(?,?,?)')
    .run(kw.id, now(), 'running').lastInsertRowid;
  try {
    const settings = getSettings();
    const sinceUnix = now() - 24 * 3600;
    const raw = await searchAll({ keyword: kw.word, sinceUnix, limit: 15 }, {
      fetchImpl,
      onProviderError: (name, msg) => broadcast('provider_error', { provider: name, message: msg, at: now() }),
    });

    // 轻去重（仅 URL）
    const seen = new Set();
    const uniq = raw.filter(c => {
      const h = urlHash(c.url);
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    });

    let spots = [];
    if (uniq.length) {
      try {
        spots = await aggregateHotspots(kw.word, uniq, { fetchImpl });
      } catch (err) {
        if (err instanceof NoApiKeyError) {
          broadcast('system_alert', { level: 'error', message: '未配置 OPENROUTER_API_KEY，热点聚合已暂停', at: now() });
          return { status: 'error', error: err.message };
        }
        throw err;
      }
    }

    const batchId = now();
    const insert = db.prepare(`INSERT INTO hotspots(domain_id,batch_id,rank,title,summary,heat,sources,created_at)
      VALUES(?,?,?,?,?,?,?,?)`);
    db.exec('BEGIN');
    try {
      for (let i = 0; i < spots.length; i++) {
        insert.run(kw.id, batchId, i + 1, spots[i].title, spots[i].summary, spots[i].heat,
          JSON.stringify(spots[i].sources), batchId);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    db.prepare('UPDATE keywords SET last_scan_at=? WHERE id=?').run(batchId, kw.id);
    db.prepare('UPDATE scan_log SET ended_at=?, status=?, candidates=?, confirmed=? WHERE id=?')
      .run(now(), 'ok', uniq.length, spots.length, logId);
    broadcast('hotspots', { domainId: kw.id, domain: kw.word, batchId, count: spots.length, at: batchId });
    return { status: 'ok', count: spots.length, batchId };
  } catch (err) {
    db.prepare('UPDATE scan_log SET ended_at=?, status=?, error=? WHERE id=?')
      .run(now(), 'error', err.message.slice(0, 300), logId);
    broadcast('system_alert', { level: 'error', message: `热点聚合失败 [${kw.word}]: ${err.message}`, at: now() });
    return { status: 'error', error: err.message };
  } finally {
    running.delete(kw.id);
  }
}

/** 当前热点榜（每个领域最新批次） */
export function latestHotspots() {
  const domains = db.prepare("SELECT k.id, k.word FROM keywords k WHERE k.kind='domain' ORDER BY k.id").all();
  const q = db.prepare('SELECT * FROM hotspots WHERE domain_id=? AND batch_id=(SELECT MAX(batch_id) FROM hotspots WHERE domain_id=?) ORDER BY rank');
  return domains.map(d => ({
    domainId: d.id,
    domain: d.word,
    updatedAt: db.prepare('SELECT MAX(batch_id) AS t FROM hotspots WHERE domain_id=?').get(d.id)?.t || null,
    items: q.all(d.id, d.id).map(row => ({ ...row, sources: JSON.parse(row.sources || '[]') })),
  }));
}
