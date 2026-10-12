import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, urlHash, titleSimilarity, dedupeCandidates } from '../server/dedupe.js';

test('normalizeUrl 去除跟踪参数与 www', () => {
  const a = normalizeUrl('https://www.Example.com/post/openai-gpt5?utm_source=x&id=42');
  assert.equal(a, 'https://example.com/post/openai-gpt5?id=42');
  // 同一文章带不同跟踪参数 → hash 相同
  const h1 = urlHash('https://openai.com/blog/gpt-5?utm_campaign=launch&fbclid=abc');
  const h2 = urlHash('https://openai.com/blog/gpt-5?utm_source=twitter');
  assert.equal(h1, h2);
});

test('normalizeUrl 处理 hash 与大小写', () => {
  assert.equal(
    normalizeUrl('https://Example.com/A/b#section'),
    normalizeUrl('https://example.com/A/b'),
  );
});

test('titleSimilarity 英文近似标题判重', () => {
  const s = titleSimilarity(
    'OpenAI releases GPT-5.5 with major coding improvements',
    'OpenAI releases GPT-5.5 with major coding upgrades',
  );
  assert.ok(s > 0.7, `expected >0.7, got ${s}`);
  const diff = titleSimilarity(
    'OpenAI releases GPT-5.5 with major coding improvements',
    'Anthropic announces Claude Code pricing changes',
  );
  assert.ok(diff < 0.25);
});

test('titleSimilarity 中文 2-gram', () => {
  // Dice 系数下同事件改写标题应有中高分（判定阈值 0.72 主要针对近乎相同的转载标题，
  // 不同措辞的同事件由 AI 语义判重兜底）
  const s = titleSimilarity('OpenAI 发布 GPT-5.5 编程能力大幅提升', 'OpenAI 发布 GPT-5.5 编程能力显著增强');
  assert.ok(s > 0.5, `expected >0.5, got ${s}`);
  const diff = titleSimilarity('Claude 新模型开放 API', '火锅底料炒制方法大全');
  assert.ok(diff < 0.1, `expected <0.1, got ${diff}`);
});

test('dedupeCandidates URL 与标题双通道去重', () => {
  const candidates = [
    { url: 'https://a.com/x?utm_source=rss', title: 'GPT-5.5 released by OpenAI' },
    { url: 'https://a.com/x', title: '完全不同的标题' },                 // 同 URL（跟踪参数差异）
    { url: 'https://b.com/y', title: 'GPT-5.5 released by OpenAI today' }, // 同标题相似
    { url: 'https://c.com/z', title: 'Anthropic launches Claude 4.6' },   // 保留
  ];
  const kept = dedupeCandidates(candidates, new Set(), []);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].url, 'https://a.com/x?utm_source=rss');
  assert.equal(kept[1].url, 'https://c.com/z');
});

test('dedupeCandidates 对照已见 URL 集合', () => {
  const seen = new Set([urlHash('https://old.com/seen')]);
  const kept = dedupeCandidates([{ url: 'https://old.com/seen', title: '旧闻' }], seen, []);
  assert.equal(kept.length, 0);
});
