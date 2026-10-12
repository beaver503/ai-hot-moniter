/**
 * OpenRouter AI 客户端 —— 两个能力：
 *  1. judgeBatch: 批量判定搜索结果真伪（过滤标题党/蹭热度/假冒/旧闻）
 *  2. aggregateHotspots: 把领域搜索结果聚合成热点榜（中文标题+热度分）
 */
import { getSettings } from './db.js';
import { config as cfg } from './config.js';

const API = 'https://openrouter.ai/api/v1/chat/completions';

export class NoApiKeyError extends Error {
  constructor() { super('未配置 OPENROUTER_API_KEY，AI 判定不可用'); this.code = 'NO_KEY'; }
}

/** 从模型输出中稳健提取 JSON（容忍 ```json 围栏、前后杂文） */
export function extractJson(text) {
  if (!text) throw new Error('empty AI response');
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last <= first) throw new Error(`no JSON object in AI output: ${t.slice(0, 120)}`);
  return JSON.parse(t.slice(first, last + 1));
}

async function chat(messages, { temperature = 0.1, maxTokens = 3000, fetchImpl = fetch } = {}) {
  if (!cfg.openrouterKey) throw new NoApiKeyError();
  const settings = getSettings();
  const res = await fetchImpl(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.openrouterKey}`,
      'HTTP-Referer': 'http://localhost',
      'X-Title': 'AI Hot Radar',
    },
    body: JSON.stringify({
      model: settings.aiModel,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter empty content: ${JSON.stringify(data).slice(0, 200)}`);
  return content;
}

// ============ 1. 真伪判定 ============

const JUDGE_SYSTEM = `你是一位严谨的 AI 领域资深编辑，为一位 AI 编程博主筛选真正的热点事件。
你的任务：判断每条搜索结果是否是【与监控词相关的、真实发生的、有新闻价值的新事件】。

判定标准：
- real: 内容来自可信来源，确实报道了与监控词直接相关的真实事件（发布、更新、重大新闻等）
- fake: 假冒/猜测/谣言/标题党/蹭热度（标题提到关键词但内容无关）/旧闻翻炒/无实质信息的 SEO 垃圾
- irrelevant: 内容真实但与监控词无直接关联

注意：
- 官方博客、主流科技媒体、官方 X/公告的可信度高
- "分析师预测""传闻""据称"类内容降权
- 发布时间越新、来源越权威，confidence 越高

严格输出 JSON（不要多余文字）：
{"results":[{"idx":<编号>,"verdict":"real|fake|irrelevant","confidence":<0-100整数>,"summary":"<50字内中文摘要，说明发生了什么>","reason":"<20字内判定理由>"}]}`;

export async function judgeBatch(keyword, candidates, { fetchImpl = fetch } = {}) {
  const list = candidates
    .map((c, i) => {
      const date = c.publishedAt ? new Date(c.publishedAt * 1000).toISOString().slice(0, 10) : '未知日期';
      return `#${i + 1} [${c.source}] (${date}) ${c.title}\n摘要片段: ${(c.snippet || '').slice(0, 400)}`;
    })
    .join('\n\n');

  const content = await chat(
    [
      { role: 'system', content: JUDGE_SYSTEM },
      { role: 'user', content: `监控词: "${keyword}"\n\n以下是搜索到的候选内容：\n\n${list}\n\n请逐条判定。` },
    ],
    { temperature: 0.1, maxTokens: 4000, fetchImpl },
  );

  const parsed = extractJson(content);
  const byIdx = new Map();
  for (const r of parsed.results || []) {
    if (typeof r.idx === 'number') byIdx.set(r.idx - 1, r);
  }
  // 与候选对齐：无判定结果的标 pending
  return candidates.map((c, i) => {
    const r = byIdx.get(i) || {};
    return {
      ...c,
      ai_verdict: ['real', 'fake', 'irrelevant'].includes(r.verdict) ? r.verdict : 'pending',
      ai_confidence: Math.max(0, Math.min(100, Number(r.confidence) || 0)),
      ai_summary: String(r.summary || '').slice(0, 200),
      ai_reason: String(r.reason || '').slice(0, 100),
    };
  });
}

// ============ 2. 热点聚合 ============

const AGG_SYSTEM = `你是一位 AI 资讯主编，负责把某领域的最新搜索结果聚合成热点榜。

要求：
1. 把报道同一事件的不同来源合并为一个热点（按事件聚类，不是按文章）
2. 热度评分 0-100：多来源报道加分、权威来源加分、互动量加分、时效性加分
3. 每个热点输出中文标题（简洁有信息量，不加"震惊"式词）和中文摘要（60字内）
4. 保留该热点对应的原文链接（最多4个）
5. 只保留与领域相关的真实事件，过滤 SEO 垃圾与无实质内容
6. 输出 5~10 个热点，按热度降序

严格输出 JSON（不要多余文字）：
{"hotspots":[{"title":"<中文标题>","summary":"<中文摘要>","heat":<0-100>,"sources":[{"title":"<原标题>","url":"<链接>","source":"<域名>"}]}]}`;

export async function aggregateHotspots(domain, candidates, { fetchImpl = fetch } = {}) {
  const list = candidates
    .slice(0, 40)
    .map((c, i) => {
      const date = c.publishedAt ? new Date(c.publishedAt * 1000).toISOString().slice(0, 10) : '未知日期';
      return `#${i + 1} [${c.source}] (${date}) ${c.title}\n${(c.snippet || '').slice(0, 300)}`;
    })
    .join('\n\n');

  const content = await chat(
    [
      { role: 'system', content: AGG_SYSTEM },
      { role: 'user', content: `领域: "${domain}"\n\n搜索结果：\n\n${list}\n\n请聚合出热点榜。` },
    ],
    { temperature: 0.2, maxTokens: 5000, fetchImpl },
  );

  const parsed = extractJson(content);
  const out = [];
  for (const h of parsed.hotspots || []) {
    if (!h.title) continue;
    out.push({
      title: String(h.title).slice(0, 150),
      summary: String(h.summary || '').slice(0, 300),
      heat: Math.max(0, Math.min(100, Number(h.heat) || 0)),
      sources: Array.isArray(h.sources)
        ? h.sources.filter(s => s && s.url).slice(0, 4).map(s => ({
            title: String(s.title || '').slice(0, 150),
            url: String(s.url),
            source: String(s.source || ''),
          }))
        : [],
    });
  }
  return out.sort((a, b) => b.heat - a.heat);
}
