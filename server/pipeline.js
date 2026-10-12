/**
 * 监控管道：搜索 → 去重 → AI 真伪判定 → 入库 → 通知
 */
import { db, getSettings, now } from './db.js';
import { searchAll } from './providers/index.js';
import { judgeBatch, NoApiKeyError } from './ai.js';
import { dedupeCandidates, urlHash } from './dedupe.js';
import { broadcast } from './notify/sse.js';
import { sendSignalMail, mailConfigured } from './notify/mail.js';
import { runHotspotScan } from './hotwords.js';

const scanning = new Set(); // keyword_id 防重叠锁

export const isScanning = (id) => scanning.has(id);

export async function runKeywordScan(kw, { fetchImpl = fetch } = {}) {
  if (scanning.has(kw.id)) return { skipped: true, reason: 'already scanning' };
  scanning.add(kw.id);
  const startedAt = now();
  const logId = db.prepare('INSERT INTO scan_log(keyword_id, started_at, status) VALUES(?,?,?)')
    .run(kw.id, startedAt, 'running').lastInsertRowid;

  const finish = (status, extra = {}) => {
    db.prepare('UPDATE scan_log SET ended_at=?, status=?, candidates=?, confirmed=?, error=? WHERE id=?')
      .run(now(), status, extra.candidates ?? 0, extra.confirmed ?? 0, extra.error || '', logId);
    scanning.delete(kw.id);
    return { status, ...extra };
  };

  try {
    const settings = getSettings();
    const sinceUnix = kw.last_scan_at || now() - settings.searchWindowHours * 3600;

    // 1. 多源搜索
    const raw = await searchAll({ keyword: kw.word, sinceUnix, limit: 12 }, {
      fetchImpl,
      onProviderError: (name, msg) => broadcast('provider_error', { provider: name, message: msg, at: now() }),
    });

    // 2. 去重（URL hash + 标题相似，对比该词已入库内容）
    const seenUrls = new Set(
      db.prepare('SELECT url_hash FROM items WHERE keyword_id=?').all(kw.id).map(r => r.url_hash));
    const seenTitles = db.prepare(
      'SELECT title FROM items WHERE keyword_id=? AND found_at>? ORDER BY found_at DESC LIMIT 200'
    ).all(kw.id, now() - 7 * 86400).map(r => r.title);
    const fresh = dedupeCandidates(raw, seenUrls, seenTitles);

    if (!fresh.length) {
      db.prepare('UPDATE keywords SET last_scan_at=? WHERE id=?').run(now(), kw.id);
      return finish('ok', { candidates: 0, confirmed: 0 });
    }

    // 3. AI 真伪判定
    let judged;
    try {
      judged = await judgeBatch(kw.word, fresh, { fetchImpl });
    } catch (err) {
      if (err instanceof NoApiKeyError) {
        broadcast('system_alert', { level: 'error', message: '未配置 OPENROUTER_API_KEY，扫描已暂停（不发未验证通知）', at: now() });
        return finish('error', { candidates: fresh.length, error: err.message });
      }
      throw err;
    }

    // 4. 入库 + 分级处理
    const insert = db.prepare(`INSERT INTO items
      (keyword_id,url_hash,url,title,source,snippet,published_at,found_at,ai_verdict,ai_confidence,ai_summary,ai_reason)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    const confirmedItems = [];
    for (const it of judged) {
      insert.run(kw.id, it.urlHash ?? urlHash(it.url), it.url, it.title, it.source || '',
        it.snippet || '', it.publishedAt ?? null, now(), it.ai_verdict, it.ai_confidence,
        it.ai_summary, it.ai_reason);
      const isConfirmed = it.ai_verdict === 'real' && it.ai_confidence >= settings.confidenceThreshold;
      if (isConfirmed) confirmedItems.push(it);
    }

    // 5. 通知：SSE 实时推 + 邮件（分级：>=threshold 通知；>=suspect 仅存库）
    for (const it of confirmedItems) {
      db.prepare('UPDATE items SET notified=1 WHERE keyword_id=? AND url_hash=?').run(kw.id, it.urlHash);
      const signal = {
        id: db.prepare('SELECT id FROM items WHERE keyword_id=? AND url_hash=?').get(kw.id, it.urlHash)?.id,
        keyword: kw.word, keywordId: kw.id,
        title: it.title, url: it.url, source: it.source || '',
        verdict: it.ai_verdict, confidence: it.ai_confidence,
        summary: it.ai_summary, reason: it.ai_reason,
        publishedAt: it.publishedAt, foundAt: now(),
      };
      broadcast('signal', signal);
      if (mailConfigured()) {
        sendSignalMail({ word: kw.word, ...it }).catch(err =>
          broadcast('system_alert', { level: 'warn', message: `邮件发送失败: ${err.message}`, at: now() }));
      }
    }

    db.prepare('UPDATE keywords SET last_scan_at=? WHERE id=?').run(now(), kw.id);
    return finish('ok', { candidates: judged.length, confirmed: confirmedItems.length });
  } catch (err) {
    return finish('error', { error: err.message });
  }
}

/** 触发某词立即扫描（API 调用），按词类型分派管道，异步执行不阻塞响应 */
export function triggerScan(kw) {
  const run = async () => {
    if (kw.kind === 'domain') {
      await runHotspotScan(kw);
    } else {
      const r = await runKeywordScan(kw);
      const { onScanDone } = await import('./scheduler.js');
      onScanDone(kw.id, r.status);
    }
  };
  run().catch(err => console.error('[triggerScan]', err.message));
  return { triggered: true, scanning: true };
}
