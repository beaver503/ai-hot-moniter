import { Router } from 'express';
import { db, getSettings, setSettings, now } from '../db.js';
import { config as cfg } from '../config.js';
import { triggerScan } from '../pipeline.js';
import { latestHotspots } from '../hotwords.js';
import { sendTestMail } from '../notify/mail.js';
import { sseHandler, clientCount } from '../notify/sse.js';
import { isCreditExhausted } from '../providers/index.js';
import { rescheduleAll, nextSchedules, scheduleKeyword, cancel } from '../scheduler.js';

export const api = Router();

// ---------- 系统状态 + 首屏聚合 ----------
api.get('/state', (req, res) => {
  const settings = getSettings();
  const keywords = db.prepare(`
    SELECT k.*,
      (SELECT COUNT(*) FROM items i WHERE i.keyword_id=k.id AND i.ai_verdict='real') AS confirmed_count,
      (SELECT COUNT(*) FROM items i WHERE i.keyword_id=k.id AND i.ai_verdict='suspect') AS suspect_count
    FROM keywords k ORDER BY k.created_at`).all();
  res.json({
    keywords,
    signals: recentSignals(30),
    hotspots: latestHotspots(),
    schedule: nextSchedules(),
    system: {
      time: now(),
      openrouterReady: !!cfg.openrouterKey,
      firecrawlReady: !!cfg.firecrawlKey && !isCreditExhausted(),
      firecrawlCreditExhausted: isCreditExhausted(),
      mailConfigured: !!(settings.mailHost && settings.mailUser && settings.mailPass && settings.mailFrom && settings.mailTo && settings.mailEnabled),
      sseClients: clientCount(),
    },
  });
});

// ---------- 关键词 ----------
api.post('/keywords', (req, res) => {
  const { word, kind = 'monitor', interval_min } = req.body || {};
  const w = String(word || '').trim().slice(0, 50);
  if (!w) return res.status(400).json({ error: '关键词不能为空' });
  if (!['monitor', 'domain'].includes(kind)) return res.status(400).json({ error: 'kind 必须是 monitor 或 domain' });
  const settings = getSettings();
  const interval = Math.max(5, Math.min(1440, Number(interval_min) || (kind === 'domain' ? settings.hotspotIntervalMin : settings.keywordIntervalMin)));
  try {
    const id = db.prepare('INSERT INTO keywords(word,kind,enabled,interval_min,created_at) VALUES(?,?,1,?,?)')
      .run(w, kind, interval, now()).lastInsertRowid;
    scheduleKeyword(id);
    res.json({ ok: true, id });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: '关键词已存在' });
    throw e;
  }
});

api.patch('/keywords/:id', (req, res) => {
  const kw = db.prepare('SELECT * FROM keywords WHERE id=?').get(req.params.id);
  if (!kw) return res.status(404).json({ error: 'not found' });
  const { enabled, interval_min, word } = req.body || {};
  const newEnabled = enabled === undefined ? kw.enabled : (enabled ? 1 : 0);
  const newInterval = interval_min === undefined ? kw.interval_min : Math.max(5, Math.min(1440, Number(interval_min) || kw.interval_min));
  const newWord = word === undefined ? kw.word : String(word).trim().slice(0, 50) || kw.word;
  db.prepare('UPDATE keywords SET enabled=?, interval_min=?, word=? WHERE id=?').run(newEnabled, newInterval, newWord, kw.id);
  if (newEnabled && !kw.enabled) scheduleKeyword(kw.id);
  else if (!newEnabled && kw.enabled) cancel(kw.id);
  else if (newInterval !== kw.interval_min) rescheduleAll();
  res.json({ ok: true });
});

api.delete('/keywords/:id', (req, res) => {
  cancel(Number(req.params.id));
  db.prepare('DELETE FROM keywords WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

api.post('/keywords/:id/scan', (req, res) => {
  const kw = db.prepare('SELECT * FROM keywords WHERE id=?').get(req.params.id);
  if (!kw) return res.status(404).json({ error: 'not found' });
  res.json(triggerScan(kw));
});

// ---------- 信号流 ----------
function recentSignals(limit = 30, offset = 0) {
  const rows = db.prepare(`
    SELECT i.*, k.word AS keyword FROM items i JOIN keywords k ON k.id=i.keyword_id
    WHERE i.ai_verdict IN ('real','pending') AND i.ai_confidence >= ?
    ORDER BY i.found_at DESC, i.id DESC LIMIT ? OFFSET ?
  `).all(getSettings().suspectThreshold, limit, offset);
  return rows.map(r => ({
    id: r.id, keywordId: r.keyword_id, keyword: r.keyword,
    title: r.title, url: r.url, source: r.source,
    verdict: r.ai_verdict, confidence: r.ai_confidence,
    summary: r.ai_summary, reason: r.ai_reason,
    publishedAt: r.published_at, foundAt: r.found_at, notified: !!r.notified,
  }));
}

api.get('/signals', (req, res) => {
  res.json({ signals: recentSignals(Number(req.query.limit) || 30, Number(req.query.offset) || 0) });
});

// ---------- 热点榜 ----------
api.get('/hotspots', (req, res) => {
  res.json({ hotspots: latestHotspots() });
});

api.get('/hotspots/history', (req, res) => {
  const batches = db.prepare(`
    SELECT batch_id, domain_id, COUNT(*) AS n FROM hotspots GROUP BY batch_id, domain_id
    ORDER BY batch_id DESC LIMIT 50`).all();
  res.json({ batches });
});

// ---------- 设置 ----------
const SENSITIVE = ['mailPass'];

api.get('/settings', (req, res) => {
  const s = getSettings();
  for (const k of SENSITIVE) if (s[k]) s[k] = '********';
  res.json({ settings: s, openrouterKeySet: !!cfg.openrouterKey });
});

api.put('/settings', (req, res) => {
  const patch = { ...req.body };
  // 脱敏占位不覆盖真实密码
  for (const k of SENSITIVE) if (patch[k] === '********') delete patch[k];
  // 数值字段类型校正
  const numeric = ['keywordIntervalMin', 'hotspotIntervalMin', 'confidenceThreshold', 'suspectThreshold',
    'providerFirecrawl', 'providerHackernews', 'searchWindowHours', 'mailPort', 'mailSecure', 'mailEnabled'];
  for (const k of numeric) if (k in patch) patch[k] = Number(patch[k]) || 0;
  const s = setSettings(patch);
  rescheduleAll();
  for (const k of SENSITIVE) if (s[k]) s[k] = '********';
  res.json({ ok: true, settings: s });
});

api.post('/settings/test-mail', async (req, res) => {
  try {
    const override = req.body && req.body.mailHost ? req.body : null; // 支持用未保存的表单值直接测
    const r = await sendTestMail(override);
    res.json(r);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- SSE ----------
api.get('/events', sseHandler);
