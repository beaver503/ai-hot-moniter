/**
 * Firecrawl 搜索 provider —— 用 Firecrawl /v1/search 搜集最近内容。
 * 每次调用消耗 1~2 credits。
 */
export const name = 'firecrawl';

export function isAvailable(settings, cfg) {
  return !!(settings.providerFirecrawl && cfg.firecrawlKey);
}

export async function search({ keyword, limit = 10 }, { cfg, fetchImpl = fetch } = {}) {
  const body = {
    query: keyword,
    limit,
    tbs: 'qdr:w', // 近一周；更精细的时效过滤交给上层（publishedAt）与 AI 判定
    scrapeOptions: { formats: ['markdown'], onlyMainContent: false },
  };
  const res = await fetchImpl(`${'https://api.firecrawl.dev'}/v1/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.firecrawlKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 402) {
      const err = new Error('FIRECRAWL_NO_CREDITS');
      err.code = 'NO_CREDITS';
      throw err;
    }
    throw new Error(`firecrawl search ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const out = [];
  for (const r of data.data || []) {
    const md = (r.markdown || r.description || '').slice(0, 1500);
    out.push({
      title: r.title || r.url,
      url: r.url,
      source: r.source || new URL(r.url).hostname.replace(/^www\./, ''),
      snippet: md,
      publishedAt: r.publishedDate ? Math.floor(new Date(r.publishedDate).getTime() / 1000) : null,
    });
  }
  return out;
}
