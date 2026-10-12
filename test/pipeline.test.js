/**
 * 管道集成测试：mock 全部外部 HTTP（HN / Firecrawl / OpenRouter），
 * 验证 搜索 → 去重 → AI 判定 → 入库 → 分级处理 的完整闭环。
 * 使用独立临时数据目录，不污染开发库。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 必须在动态 import 之前设置（ESM 静态导入会提升）
process.env.OPENROUTER_API_KEY = 'test-key-xxx';
process.env.FIRECRAWL_API_KEY = 'fc-test-xxx';
process.env.AHM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-test-'));

const { db, getSettings, now } = await import('../server/db.js');
const { runKeywordScan } = await import('../server/pipeline.js');
const { runHotspotScan, latestHotspots } = await import('../server/hotwords.js');
const { dedupeCandidates } = await import('../server/dedupe.js');

const HN_STORY = {
  title: 'OpenAI announces GPT-5.5 with agentic coding',
  url: 'https://openai.com/blog/gpt-5-5',
  created_at_i: now() - 3600,
  points: 350, num_comments: 120,
};
const FC_HITS = [
  { title: 'OpenAI 发布 GPT-5.5：编程能力飞跃', url: 'https://techcrunch.com/openai-gpt-5-5?utm_source=rss', publishedDate: new Date((now() - 7200) * 1000).toISOString(), markdown: 'OpenAI 今日正式发布 GPT-5.5…' },
  { title: '分析师预测 AI 泡沫将破裂', url: 'https://clickbait.example.com/ai-bubble', publishedDate: new Date((now() - 86400) * 1000).toISOString(), markdown: '据称…传闻…' },
  { title: 'OpenAI GPT-5.5 使用技巧汇总', url: 'https://hackernoon.com/gpt-5-5-tips', publishedDate: new Date((now() - 10800) * 1000).toISOString(), markdown: '一些使用心得…' },
  { title: 'Steam 游戏打折促销合集', url: 'https://games.example.com/sale', publishedDate: new Date((now() - 5400) * 1000).toISOString(), markdown: '游戏新闻…' },
];

function mockFetch(url, opts) {
  const u = String(url);
  if (u.includes('hn.algolia.com')) {
    return Promise.resolve(Response.json({ hits: [HN_STORY, { title: 'Ask HN: 无外链贴', url: null, created_at_i: now() - 60 }] }));
  }
  if (u.includes('api.firecrawl.dev')) {
    return Promise.resolve(Response.json({ data: FC_HITS }));
  }
  if (u.includes('openrouter.ai')) {
    const body = JSON.parse(opts.body);
    let content;
    if (body.messages[0].content.includes('AI 资讯主编')) {
      content = JSON.stringify({ hotspots: [
        { title: 'OpenAI 发布 GPT-5.5', summary: '编程与 Agent 能力大幅增强', heat: 92, sources: [{ title: HN_STORY.title, url: HN_STORY.url, source: 'openai.com' }] },
        { title: '多国讨论 AI 监管新规', summary: '监管动向汇总', heat: 61, sources: [] },
      ] });
    } else {
      // 5 条候选：#1 HN 官宣(real 93) #2 TechCrunch(real 88) #3 传闻(fake 15)
      //           #4 技巧文(real 65 → 疑似区间) #5 游戏新闻(irrelevant 40)
      content = JSON.stringify({ results: [
        { idx: 1, verdict: 'real', confidence: 93, summary: 'OpenAI 官宣 GPT-5.5 发布', reason: '官方来源' },
        { idx: 2, verdict: 'real', confidence: 88, summary: 'TechCrunch 报道同一事件', reason: '主流媒体' },
        { idx: 3, verdict: 'fake', confidence: 15, summary: '无依据的猜测文章', reason: '传闻无来源' },
        { idx: 4, verdict: 'real', confidence: 65, summary: '使用技巧汇总帖', reason: '非事件类' },
        { idx: 5, verdict: 'irrelevant', confidence: 40, summary: '与监控词无关', reason: '主题偏离' },
      ] });
    }
    return Promise.resolve(Response.json({ choices: [{ message: { content } }] }));
  }
  return Promise.reject(new Error('unexpected fetch: ' + u));
}

before(() => { /* mkdtempSync 已保证目录全新 */ });
after(() => {
  try { db.close(); } catch { /* 已关闭 */ }
  try { fs.rmSync(process.env.AHM_DATA_DIR, { recursive: true, force: true }); } catch { /* Windows 句柄延迟，留给系统清理 */ }
});

test('监控管道：搜索→去重→AI 判定→分级入库', async () => {
  const kwId = db.prepare('INSERT INTO keywords(word,kind,enabled,interval_min,created_at) VALUES(?,?,1,?,?)')
    .run('GPT-5.5', 'monitor', 30, now()).lastInsertRowid;
  const kw = db.prepare('SELECT * FROM keywords WHERE id=?').get(kwId);

  const r = await runKeywordScan(kw, { fetchImpl: mockFetch });
  assert.equal(r.status, 'ok', `scan failed: ${r.error}`);
  assert.equal(r.candidates, 5);       // HN 1条（无外链被滤）+ FC 4条，去重后 5 条唯一
  assert.equal(r.confirmed, 2);        // #1(93) 与 #2(88) 达到确认阈值 75

  const items = db.prepare('SELECT * FROM items WHERE keyword_id=? ORDER BY ai_confidence DESC').all(kwId);
  assert.equal(items.length, 5);
  assert.equal(items[0].ai_verdict, 'real');
  assert.ok(items[0].ai_confidence >= 90);
  assert.equal(items.find(i => i.ai_confidence === 15).ai_verdict, 'fake');
  assert.equal(items.find(i => i.ai_verdict === 'irrelevant').ai_verdict, 'irrelevant');

  // 65 分的 real：入库但不通知（suspect 区间），notified=0
  const suspect = items.find(i => i.ai_confidence === 65);
  assert.ok(suspect, '疑似区间条目应入库');
  assert.equal(suspect.notified, 0);

  // 达阈值者标记已通知（邮件未配置，但 notified 位仍置 1 表示已走通知流程）
  assert.equal(items.find(i => i.ai_confidence >= 90).notified, 1);

  // scan_log 记录完整
  const log = db.prepare('SELECT * FROM scan_log WHERE keyword_id=? ORDER BY id DESC').get(kwId);
  assert.equal(log.status, 'ok');
  assert.equal(log.candidates, 5);
  assert.equal(log.confirmed, 2);
});

test('监控管道：重复扫描按 URL 去重，不重复入库', async () => {
  const kw = db.prepare('SELECT * FROM keywords WHERE word=?').get('GPT-5.5');
  const beforeCount = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  const r = await runKeywordScan(kw, { fetchImpl: mockFetch });
  assert.equal(r.status, 'ok');
  assert.equal(r.candidates, 0); // 全部已见过
  const afterCount = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  assert.equal(afterCount, beforeCount);
});

test('热点聚合管道：搜索→AI 聚类→快照入库', async () => {
  const kwId = db.prepare('INSERT INTO keywords(word,kind,enabled,interval_min,created_at) VALUES(?,?,1,?,?)')
    .run('AI 编程', 'domain', 60, now()).lastInsertRowid;
  const kw = db.prepare('SELECT * FROM keywords WHERE id=?').get(kwId);
  const r = await runHotspotScan(kw, { fetchImpl: mockFetch });
  assert.equal(r.status, 'ok', `hotspot scan failed: ${r.error}`);
  assert.equal(r.count, 2);

  const areas = latestHotspots();
  assert.equal(areas.length, 1);
  assert.equal(areas[0].domain, 'AI 编程');
  assert.equal(areas[0].items.length, 2);
  assert.ok(areas[0].items[0].heat >= areas[0].items[1].heat, '按热度降序');
  assert.equal(areas[0].items[0].title, 'OpenAI 发布 GPT-5.5');
  assert.ok(Array.isArray(areas[0].items[0].sources));
});

test('dedupeCandidates：Firecrawl 跟踪参数变体与 HN 原链去重', () => {
  const kept = dedupeCandidates(
    [
      { url: HN_STORY.url, title: HN_STORY.title },
      { url: HN_STORY.url + '?utm_source=rss', title: HN_STORY.title + ' - OpenAI' },
    ],
    new Set(), [],
  );
  assert.equal(kept.length, 1);
});

test('无 AI Key 时管道拒绝推进（不发未验证通知）', async () => {
  delete process.env.OPENROUTER_API_KEY;
  // config.js 已缓存 key，直接改内存中的 cfg
  const { config: cfg } = await import('../server/config.js');
  const saved = cfg.openrouterKey;
  cfg.openrouterKey = '';
  const kwId = db.prepare('INSERT INTO keywords(word,kind,enabled,interval_min,created_at) VALUES(?,?,1,?,?)')
    .run('Claude', 'monitor', 30, now()).lastInsertRowid;
  const kw = db.prepare('SELECT * FROM keywords WHERE id=?').get(kwId);
  const r = await runKeywordScan(kw, { fetchImpl: mockFetch });
  assert.equal(r.status, 'error');
  assert.match(r.error, /OPENROUTER_API_KEY/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM items WHERE keyword_id=?').get(kwId).n, 0);
  cfg.openrouterKey = saved;
  process.env.OPENROUTER_API_KEY = saved || 'test-key-xxx';
});

test('getSettings 默认值完整性', () => {
  const s = getSettings();
  assert.equal(s.confidenceThreshold, 75);
  assert.equal(s.suspectThreshold, 60);
  assert.equal(s.aiModel, 'openai/gpt-5-nano');
});
