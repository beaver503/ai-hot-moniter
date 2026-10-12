/**
 * Hacker News provider —— Algolia 公开 API，免费无需认证。
 * 按时间倒序搜索故事，天然适合"最近发生了什么"。
 */
export const name = 'hackernews';

export function isAvailable(settings) {
  return !!settings.providerHackernews;
}

export async function search({ keyword, sinceUnix, limit = 15 }, { fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({
    query: keyword,
    tags: 'story',
    hitsPerPage: String(limit),
  });
  const url = `https://hn.algolia.com/api/v1/search_by_date?${params}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`hn search ${res.status}`);
  const data = await res.json();
  const out = [];
  for (const h of data.hits || []) {
    if (!h.title || !h.url) continue; // Ask/Show HN 无外链的跳过
    const created = h.created_at_i || null;
    if (sinceUnix && created && created < sinceUnix) continue;
    out.push({
      title: h.title,
      url: h.url,
      source: 'news.ycombinator.com',
      snippet: `${h.points ?? 0} points, ${h.num_comments ?? 0} comments on Hacker News. ${(h.story_text || '').slice(0, 300)}`.trim(),
      publishedAt: created,
      hnPoints: h.points ?? 0,
      hnComments: h.num_comments ?? 0,
    });
  }
  return out;
}
