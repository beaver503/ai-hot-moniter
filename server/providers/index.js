import { getSettings } from '../db.js';
import { config as cfg } from '../config.js';
import * as firecrawl from './firecrawl.js';
import * as hackernews from './hackernews.js';

export const providers = [firecrawl, hackernews];

let creditExhausted = false;
export const isCreditExhausted = () => creditExhausted;

/**
 * 依次调用可用 provider 搜索；Firecrawl 积分耗尽时自动降级跳过。
 * @param {{keyword:string, sinceUnix?:number, limit?:number}} query
 * @param {{fetchImpl?:Function, onProviderError?:(name:string,msg:string)=>void}} opts
 */
export async function searchAll(query, { fetchImpl = fetch, onProviderError } = {}) {
  const settings = getSettings();
  const results = [];
  for (const p of providers) {
    if (!p.isAvailable(settings, cfg)) continue;
    try {
      results.push(...await p.search(query, { cfg, fetchImpl }));
    } catch (err) {
      if (err.code === 'NO_CREDITS') {
        creditExhausted = true;
        onProviderError?.(p.name, 'Firecrawl 积分耗尽，已降级为仅 Hacker News');
        continue;
      }
      onProviderError?.(p.name, err.message);
    }
  }
  return results;
}
