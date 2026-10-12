import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../server/ai.js';

test('extractJson 解析纯 JSON', () => {
  const r = extractJson('{"results":[{"idx":1,"verdict":"real"}]}');
  assert.equal(r.results[0].verdict, 'real');
});

test('extractJson 容忍 markdown 围栏', () => {
  const r = extractJson('好的，以下是判定结果：\n```json\n{"results":[{"idx":1,"verdict":"fake","confidence":88}]}\n```\n以上。');
  assert.equal(r.results[0].verdict, 'fake');
  assert.equal(r.results[0].confidence, 88);
});

test('extractJson 容忍前后杂文（取首尾大括号）', () => {
  const r = extractJson('说明文字 {"results":[{"idx":1}]} 结尾说明');
  assert.equal(r.results.length, 1);
});

test('extractJson 拒绝无 JSON 输出', () => {
  assert.throws(() => extractJson('抱歉我无法完成'), /no JSON/);
  assert.throws(() => extractJson(''), /empty/);
});
