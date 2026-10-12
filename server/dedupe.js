import crypto from 'node:crypto';

// ---------- URL 规范化 ----------
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'ref', 'ref_src', 'ref_url', 'fbclid', 'gclid', 'spm', 'from',
  'share_source', 'share_medium', 'si', 'vd_source', 'tt_from',
]);

export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.protocol = 'https:';
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of params) u.searchParams.append(k, v);
    // 去尾部斜杠与空 search
    let s = u.toString();
    if (s.endsWith('?')) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

export function urlHash(raw) {
  return crypto.createHash('sha1').update(normalizeUrl(raw)).digest('hex').slice(0, 20);
}

// ---------- 标题相似度（轻量 token 重叠，避免引重库） ----------
const STOP_EN = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'is', 'are', 'new', 'with', 'as', 'at', 'by', 'its', 'this', 'that']);
const STOP_ZH = new Set(['的', '了', '在', '是', '和', '与', '发布', '推出', '上线', '更新', '最新', '新的']);

export function titleTokens(title) {
  const t = (title || '').toLowerCase();
  const en = (t.match(/[a-z0-9][a-z0-9+#.\-]{1,}/g) || []).filter(w => !STOP_EN.has(w));
  // 中文按 2-gram
  const zhStr = t.replace(/[^\u4e00-\u9fff]/g, '');
  const zh = [];
  for (let i = 0; i + 1 < zhStr.length; i++) {
    const g = zhStr.slice(i, i + 2);
    if (!STOP_ZH.has(g)) zh.push(g);
  }
  return [...en, ...zh];
}

/** Dice 相似度 0~1（比 Jaccard 对短文本/包含关系更友好） */
export function titleSimilarity(a, b) {
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

/**
 * 候选去重：URL 规范化 hash 优先，其次标题与已见条目相似度过阈值
 * @param candidates [{url,title,...}]
 * @param seenUrls Set<string> 已见 urlHash
 * @param seenTitles string[] 已见标题（近期的）
 * @param titleThreshold 相似度阈值，默认 0.72
 */
export function dedupeCandidates(candidates, seenUrls, seenTitles, titleThreshold = 0.72) {
  const kept = [];
  const localUrls = new Set();
  const localTitles = [];
  for (const c of candidates) {
    const h = urlHash(c.url);
    if (seenUrls.has(h) || localUrls.has(h)) continue;
    let dupTitle = false;
    for (const t of localTitles.concat(seenTitles)) {
      if (titleSimilarity(c.title, t) >= titleThreshold) { dupTitle = true; break; }
    }
    if (dupTitle) continue;
    localUrls.add(h);
    localTitles.push(c.title);
    kept.push({ ...c, urlHash: h });
  }
  return kept;
}
