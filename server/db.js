import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config, DATA_DIR } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new DatabaseSync(path.join(DATA_DIR, 'radar.db'));

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keywords (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  word       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL DEFAULT 'monitor',   -- monitor=监控词 | domain=热点领域词
  enabled    INTEGER NOT NULL DEFAULT 1,
  interval_min INTEGER NOT NULL DEFAULT 30,
  last_scan_at INTEGER,                          -- unix 秒
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id   INTEGER NOT NULL,
  url_hash     TEXT NOT NULL,
  url          TEXT NOT NULL,
  title        TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT '',
  snippet      TEXT NOT NULL DEFAULT '',
  published_at INTEGER,                          -- unix 秒，可能未知
  found_at     INTEGER NOT NULL,
  ai_verdict   TEXT NOT NULL DEFAULT '',         -- real | fake | irrelevant | suspect | pending
  ai_confidence INTEGER NOT NULL DEFAULT 0,
  ai_summary   TEXT NOT NULL DEFAULT '',
  ai_reason    TEXT NOT NULL DEFAULT '',
  notified     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(keyword_id, url_hash)
);
CREATE INDEX IF NOT EXISTS idx_items_found ON items(found_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_verdict ON items(ai_verdict);

CREATE TABLE IF NOT EXISTS hotspots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id   INTEGER NOT NULL,
  batch_id    INTEGER NOT NULL,                  -- 一次聚合的快照批次
  rank        INTEGER NOT NULL,
  title       TEXT NOT NULL,                     -- AI 生成中文标题
  summary     TEXT NOT NULL DEFAULT '',
  heat        INTEGER NOT NULL DEFAULT 0,        -- 0-100 热度分
  sources     TEXT NOT NULL DEFAULT '[]',        -- JSON [{title,url,source}]
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hotspots_batch ON hotspots(batch_id DESC);

CREATE TABLE IF NOT EXISTS scan_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  status     TEXT NOT NULL DEFAULT 'running',    -- running | ok | error
  candidates INTEGER NOT NULL DEFAULT 0,
  confirmed  INTEGER NOT NULL DEFAULT 0,
  error      TEXT NOT NULL DEFAULT ''
);
`);

// ---------- settings ----------
export function getSettings() {
  const out = { ...config.defaults };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    const key = row.key;
    if (!(key in out)) continue;
    const def = out[key];
    out[key] = typeof def === 'number' ? Number(row.value) : row.value;
  }
  return out;
}

export function setSettings(patch) {
  const cur = getSettings();
  const upd = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  db.exec('BEGIN');
  try {
    for (const [k, v] of Object.entries(patch)) {
      if (k in cur) upd.run(k, String(v));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return getSettings();
}

export const now = () => Math.floor(Date.now() / 1000);
