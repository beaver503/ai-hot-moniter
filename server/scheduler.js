/**
 * 轻量调度器：为每个 enabled 关键词独立计时（setTimeout 动态重排）。
 * - 监控词: 到点跑 runKeywordScan，间隔 = 词自身 interval_min
 * - 领域词: 到点跑 runHotspotScan，间隔 = 全局 hotspotIntervalMin
 * 服务启动时若无 last_scan_at，安排 30 秒后首轮扫描（尽快出结果）。
 */
import { db, getSettings, now } from './db.js';
import { runKeywordScan } from './pipeline.js';
import { runHotspotScan } from './hotwords.js';
import { broadcast } from './notify/sse.js';

const timers = new Map(); // keyword_id -> { timer, nextAt, kind }
export const MAX_DELAY = 2 ** 31 - 1;

function getKeyword(id) {
  return db.prepare('SELECT * FROM keywords WHERE id=?').get(id);
}

function schedule(id, delayMs) {
  const kw = getKeyword(id);
  if (!kw || !kw.enabled) return;
  cancel(id);
  const clamped = Math.max(1000, Math.min(delayMs, MAX_DELAY));
  const timer = setTimeout(() => fire(id), clamped);
  timers.set(id, { timer, nextAt: now() + Math.round(clamped / 1000), kind: kw.kind });
}

async function fire(id) {
  const kw = getKeyword(id);
  if (!kw || !kw.enabled) { cancel(id); return; }
  let delaySec;
  if (kw.kind === 'domain') {
    await runHotspotScan(kw);
    delaySec = getSettings().hotspotIntervalMin * 60;
  } else {
    await runKeywordScan(kw);
    delaySec = (kw.interval_min || 30) * 60;
  }
  schedule(id, delaySec * 1000);
  broadcast('schedule', { nextSchedules: nextSchedules() });
}

export function cancel(id) {
  const t = timers.get(id);
  if (t) { clearTimeout(t.timer); timers.delete(id); }
}

/** 重排某个词（扫描完成后/手动触发后/设置变更后调用） */
export function onScanDone(id) {
  const kw = getKeyword(id);
  if (!kw || !kw.enabled) return;
  const delaySec = kw.kind === 'domain'
    ? getSettings().hotspotIntervalMin * 60
    : (kw.interval_min || 30) * 60;
  schedule(id, delaySec * 1000);
}

/** 新增/启用词：30 秒内首轮，之后按间隔 */
export function scheduleKeyword(id, { firstDelaySec = 15 } = {}) {
  schedule(id, firstDelaySec * 1000);
}

/** 全量重排（启动/设置变更/删除词后） */
export function rescheduleAll() {
  const settings = getSettings();
  const kws = db.prepare('SELECT * FROM keywords WHERE enabled=1').all();
  const live = new Set();
  for (const kw of kws) {
    live.add(kw.id);
    const intervalSec = kw.kind === 'domain' ? settings.hotspotIntervalMin * 60 : (kw.interval_min || 30) * 60;
    let delaySec;
    if (!kw.last_scan_at) {
      delaySec = 20 + Math.floor(Math.random() * 20); // 首轮 20~40s，错开并发
    } else {
      delaySec = kw.last_scan_at + intervalSec - now();
      if (delaySec < 0) delaySec = 10 + Math.floor(Math.random() * 10);
    }
    schedule(kw.id, delaySec * 1000);
  }
  for (const id of [...timers.keys()]) if (!live.has(id)) cancel(id);
}

export function nextSchedules() {
  return [...timers.entries()].map(([id, t]) => ({
    keywordId: id, kind: t.kind, nextAt: t.nextAt, inSec: Math.max(0, t.nextAt - now()),
  }));
}

export function stopAll() {
  for (const [, t] of timers) clearTimeout(t.timer);
  timers.clear();
}
