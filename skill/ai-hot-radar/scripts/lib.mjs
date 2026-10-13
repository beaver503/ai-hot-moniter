/**
 * ai-hot-radar 共享层 —— 完全自包含，零 npm 依赖（Node >= 20，内置 fetch）。
 * 凭证来源（按优先级）：环境变量 → 从当前目录向上查找的 .env
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/* ---------- 凭证加载 ---------- */
export function loadCredentials() {
  const need = ["OPENROUTER_API_KEY", "FIRECRAWL_API_KEY"];
  if (!need.every((k) => process.env[k])) {
    let dir = process.cwd();
    for (let i = 0; i < 8; i++) {
      const envFile = path.join(dir, ".env");
      if (fs.existsSync(envFile)) {
        for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
          const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
          if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        }
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`缺少凭证: ${missing.join(", ")} —— 请设置环境变量或在项目 .env 中配置后重试。`);
    process.exit(1);
  }
  return {
    openrouterKey: process.env.OPENROUTER_API_KEY,
    firecrawlKey: process.env.FIRECRAWL_API_KEY,
  };
}

/* ---------- 搜索 ---------- */
export async function searchFirecrawl(keyword, firecrawlKey, limit = 12) {
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${firecrawlKey}` },
    body: JSON.stringify({ query: keyword, limit, tbs: "qdr:w", scrapeOptions: { formats: ["markdown"], onlyMainContent: false } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  return (data.data || []).map((r) => ({
    title: r.title || r.url,
    url: r.url,
    source: new URL(r.url).hostname.replace(/^www\./, ""),
    snippet: (r.markdown || r.description || "").slice(0, 1200),
    publishedAt: r.publishedDate ? Math.floor(new Date(r.publishedDate).getTime() / 1000) : null,
  }));
}

export async function searchHackerNews(keyword, sinceUnix, limit = 15) {
  const params = new URLSearchParams({ query: keyword, tags: "story", hitsPerPage: String(limit) });
  const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${params}`);
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const data = await res.json();
  return (data.hits || [])
    .filter((h) => h.title && h.url)
    .filter((h) => !sinceUnix || !h.created_at_i || h.created_at_i >= sinceUnix)
    .map((h) => ({
      title: h.title,
      url: h.url,
      source: "news.ycombinator.com",
      snippet: `${h.points ?? 0} points / ${h.num_comments ?? 0} comments on HN. ${(h.story_text || "").slice(0, 200)}`.trim(),
      publishedAt: h.created_at_i || null,
    }));
}

export async function searchAll(keyword, { sinceUnix = null, fcLimit = 12, hnLimit = 15 } = {}) {
  const { firecrawlKey } = loadCredentials();
  const results = [];
  const errors = [];
  await Promise.allSettled([
    searchFirecrawl(keyword, firecrawlKey, fcLimit).then((r) => results.push(...r)).catch((e) => errors.push(`firecrawl: ${e.message}`)),
    searchHackerNews(keyword, sinceUnix, hnLimit).then((r) => results.push(...r)).catch((e) => errors.push(`hn: ${e.message}`)),
  ]);
  return { results, errors };
}

/* ---------- 去重（URL 规范化 + 标题 Dice 相似） ---------- */
const TRACKING = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "ref", "ref_src", "fbclid", "gclid", "spm", "si"]);
const STOP_EN = new Set(["the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "is", "are", "new", "with", "as", "at", "by", "its"]);
const STOP_ZH = new Set(["的", "了", "在", "是", "和", "与", "发布", "推出", "上线", "更新", "最新", "新的"]);

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = ""; u.protocol = "https:";
    u.hostname = u.hostname.replace(/^www\./, "").toLowerCase();
    const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.has(k.toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
    u.search = "";
    for (const [k, v] of params) u.searchParams.append(k, v);
    let s = u.toString();
    if (s.endsWith("?")) s = s.slice(0, -1);
    return s;
  } catch { return raw.trim(); }
}
const urlHash = (raw) => crypto.createHash("sha1").update(normalizeUrl(raw)).digest("hex").slice(0, 20);

function titleTokens(title) {
  const t = (title || "").toLowerCase();
  const en = (t.match(/[a-z0-9][a-z0-9+#.\-]{1,}/g) || []).filter((w) => !STOP_EN.has(w));
  const zhStr = t.replace(/[^\u4e00-\u9fff]/g, "");
  const zh = [];
  for (let i = 0; i + 1 < zhStr.length; i++) {
    const g = zhStr.slice(i, i + 2);
    if (!STOP_ZH.has(g)) zh.push(g);
  }
  return [...en, ...zh];
}
function dice(a, b) {
  const ta = new Set(titleTokens(a)), tb = new Set(titleTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

export function dedupe(items, titleThreshold = 0.72) {
  const seen = new Set(), titles = [], kept = [];
  for (const it of items) {
    const h = urlHash(it.url);
    if (seen.has(h)) continue;
    if (titles.some((t) => dice(it.title, t) >= titleThreshold)) continue;
    seen.add(h); titles.push(it.title); kept.push(it);
  }
  return kept;
}

/* ---------- OpenRouter AI ---------- */
async function chat(messages, { temperature = 0.2, maxTokens = 5000 } = {}) {
  const { openrouterKey } = loadCredentials();
  const model = process.env.RADAR_AI_MODEL || "deepseek/deepseek-chat-v3.1";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openrouterKey}` },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, response_format: { type: "json_object" } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export function extractJson(text) {
  let t = (text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{"), last = t.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("AI 输出中未找到 JSON");
  return JSON.parse(t.slice(first, last + 1));
}

/* ---------- 能力① 领域热点聚合 ---------- */
export async function discoverHotspots(domain, { withAngle = false, top = 8 } = {}) {
  const { results, errors } = await searchAll(domain);
  if (!results.length) throw new Error(`搜索无结果${errors.length ? `（${errors.join("; ")}）` : ""}`);
  const uniq = dedupe(results).slice(0, 40);
  const list = uniq.map((c, i) => {
    const date = c.publishedAt ? new Date(c.publishedAt * 1000).toISOString().slice(0, 10) : "未知日期";
    return `#${i + 1} [${c.source}] (${date}) ${c.title}\n${(c.snippet || "").slice(0, 300)}`;
  }).join("\n\n");

  const content = await chat([
    {
      role: "system",
      content: `你是一位 AI 资讯主编，负责把某领域的最新搜索结果聚合成热点榜。
要求：
1. 报道同一事件的不同来源合并为一个热点（按事件聚类，不是按文章）
2. 热度评分 0-100：多来源报道加分、权威来源加分、互动量加分、时效性加分
3. 每个热点输出简洁有信息量的中文标题（不加"震惊"式词）和 60 字内中文摘要
4. 保留原文链接（每个热点最多 4 个）
5. 只保留与领域相关的真实事件，过滤 SEO 垃圾与无实质内容
6. 输出 ${top} 个以内热点，按热度降序
严格输出 JSON：{"hotspots":[{"title":"...","summary":"...","heat":0,"sources":[{"title":"...","url":"...","source":"..."}]}]}`,
    },
    { role: "user", content: `领域: "${domain}"\n\n搜索结果：\n\n${list}\n\n请聚合出热点榜。` },
  ]);
  const parsed = extractJson(content);
  const spots = (parsed.hotspots || [])
    .filter((h) => h.title)
    .map((h) => ({
      title: String(h.title).slice(0, 150),
      summary: String(h.summary || "").slice(0, 300),
      heat: Math.max(0, Math.min(100, Number(h.heat) || 0)),
      sources: Array.isArray(h.sources) ? h.sources.filter((s) => s?.url).slice(0, 4)
        .map((s) => ({ title: String(s.title || "").slice(0, 150), url: String(s.url), source: String(s.source || "") })) : [],
    }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, top);

  if (withAngle && spots.length) {
    const angleContent = await chat([
      { role: "system", content: '你是一位 AI 编程博主的内容策划。为每个热点各给一句「选题角度」建议：博主能从什么独特视角写这个话题（如实测对比、踩坑复盘、行业冷思考）。严格输出 JSON：{"angles":["角度1","角度2",...]}，数组顺序与热点顺序一致。' },
      { role: "user", content: spots.map((h, i) => `${i + 1}. ${h.title}：${h.summary}`).join("\n") },
    ], { temperature: 0.6, maxTokens: 1200 });
    const angles = extractJson(angleContent).angles || [];
    spots.forEach((h, i) => { h.angle = String(angles[i] || "").slice(0, 120); });
  }
  return { domain, hotspots: spots, candidates: uniq.length, providerErrors: errors, fetchedAt: Math.floor(Date.now() / 1000) };
}

/* ---------- 能力② 独立一次性真伪判定（服务不在时的兜底） ---------- */
export async function judgeOnce(keyword, { fcLimit = 10, hnLimit = 12 } = {}) {
  const { results, errors } = await searchAll(keyword, { fcLimit, hnLimit });
  if (!results.length) throw new Error(`搜索无结果${errors.length ? `（${errors.join("; ")}）` : ""}`);
  const uniq = dedupe(results);
  const list = uniq.map((c, i) => {
    const date = c.publishedAt ? new Date(c.publishedAt * 1000).toISOString().slice(0, 10) : "未知日期";
    return `#${i + 1} [${c.source}] (${date}) ${c.title}\n摘要片段: ${(c.snippet || "").slice(0, 300)}`;
  }).join("\n\n");

  const content = await chat([
    {
      role: "system",
      content: `你是一位严谨的 AI 领域资深编辑，判断每条搜索结果是否是【与监控词相关的、真实发生的、有新闻价值的新事件】。
- real: 可信来源，确实报道了与监控词直接相关的真实事件
- fake: 假冒/猜测/谣言/标题党/蹭热度/旧闻翻炒/SEO 垃圾
- irrelevant: 内容真实但与监控词无直接关联
"分析师预测""据称"类内容降权。严格输出 JSON：
{"results":[{"idx":<编号>,"verdict":"real|fake|irrelevant","confidence":<0-100>,"summary":"<50字内中文摘要>","reason":"<20字内理由>"}]}`,
    },
    { role: "user", content: `监控词: "${keyword}"\n\n候选内容：\n\n${list}\n\n请逐条判定。` },
  ], { temperature: 0.1, maxTokens: 3000 });

  const parsed = extractJson(content);
  const byIdx = new Map((parsed.results || []).map((r) => [r.idx - 1, r]));
  return uniq.map((c, i) => {
    const r = byIdx.get(i) || {};
    return {
      ...c,
      verdict: ["real", "fake", "irrelevant"].includes(r.verdict) ? r.verdict : "pending",
      confidence: Math.max(0, Math.min(100, Number(r.confidence) || 0)),
      summary: String(r.summary || "").slice(0, 200),
      reason: String(r.reason || "").slice(0, 100),
    };
  });
}

/* ---------- 输出渲染 ---------- */
export function renderHotspotsMarkdown({ domain, hotspots, candidates, providerErrors, fetchedAt }) {
  const lines = [
    `# ◉ 热点榜 · ${domain}`,
    `> 抓取 ${new Date(fetchedAt * 1000).toLocaleString("zh-CN", { hour12: false })} · 候选 ${candidates} 条 · 按热度降序`,
    "",
  ];
  if (providerErrors?.length) lines.push(`> ⚠ 部分数据源异常: ${providerErrors.join("; ")}`, "");
  hotspots.forEach((h, i) => {
    lines.push(
      `## ${String(i + 1).padStart(2, "0")} · ${h.title}`,
      `热度 ${h.heat}/100${h.angle ? ` ｜ 选题角度：${h.angle}` : ""}`,
      h.summary ? h.summary : "",
      ...(h.sources || []).map((s) => `- ↗ [${s.source || "web"}] ${s.title || s.url} — ${s.url}`),
      "",
    );
  });
  return lines.join("\n");
}

export function renderJudgeMarkdown(keyword, judged) {
  const confirmed = judged.filter((j) => j.verdict === "real" && j.confidence >= 75);
  const suspect = judged.filter((j) => j.verdict === "real" && j.confidence >= 60 && j.confidence < 75);
  const lines = [
    `# ◉ 一次性扫描 · ${keyword}`,
    `> 候选 ${judged.length} 条 · 确认 ${confirmed.length} · 疑似 ${suspect.length}（AI 已过滤假冒/无关内容）`,
    "",
    "## 确认信号（真实度 ≥75）",
    ...(confirmed.length
      ? confirmed.map((j) => `- **${j.title}**（${j.confidence}%）\n  ${j.summary}\n  ↗ ${j.url}`)
      : ["- 本轮无确认信号"]),
    "",
    "## 疑似（60-74，待观察）",
    ...(suspect.length ? suspect.map((j) => `- ${j.title}（${j.confidence}%）— ${j.reason} ↗ ${j.url}`) : ["- 无"]),
    "",
    `<details><summary>被过滤的 ${judged.length - confirmed.length - suspect.length} 条（fake/irrelevant）</summary>`,
    ...judged.filter((j) => !(j.verdict === "real" && j.confidence >= 60))
      .map((j) => `\n- [${j.verdict} ${j.confidence}%] ${j.title} — ${j.reason}`),
    "\n</details>",
  ];
  return lines.join("\n");
}

/* ---------- 本地雷达站 API 探测 ---------- */
export async function probeApi() {
  const base = `http://localhost:${process.env.PORT || 3742}`;
  try {
    const res = await fetch(`${base}/api/state`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return base;
  } catch { /* 服务不在 */ }
  return null;
}

export const argParse = (argv) => {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--angle") args.angle = true;
    else if (a === "--top") args.top = Number(argv[++i]) || 8;
    else if (a === "--kind") args.kind = argv[++i];
    else if (a === "--interval") args.interval = Number(argv[++i]);
    else args._.push(a);
  }
  return args;
};
