#!/usr/bin/env node
/**
 * 能力① 领域热点发现（独立模式，不依赖雷达站服务）
 * 用法: node discover.mjs "AI 编程" [--top 8] [--json] [--angle]
 *   --top N    返回前 N 个热点（默认 8）
 *   --json     输出结构化 JSON（供 AI/程序进一步处理）
 *   --angle    为每个热点附「博主选题角度」建议（多一次 AI 调用）
 */
import { loadCredentials, discoverHotspots, renderHotspotsMarkdown } from "./lib.mjs";

const args = (() => {
  const a = { _: [], top: 8, json: false, angle: false };
  for (let i = 2; i < process.argv.length; i++) {
    const t = process.argv[i];
    if (t === "--json") a.json = true;
    else if (t === "--angle") a.angle = true;
    else if (t === "--top") a.top = Number(process.argv[++i]) || 8;
    else a._.push(t);
  }
  return a;
})();

const domain = args._[0];
if (!domain) {
  console.error('用法: node discover.mjs "AI 编程" [--top 8] [--json] [--angle]');
  process.exit(1);
}

loadCredentials();
console.error(`◉ 正在扫描领域「${domain}」…（双源搜索 → 去重 → AI 聚类${args.angle ? " + 选题角度" : ""}）`) ;

try {
  const result = await discoverHotspots(domain, { withAngle: args.angle, top: args.top });
  if (!result.hotspots.length) {
    console.error("本轮未发现热点（候选可能均为 SEO 噪音或与领域无关）。");
    process.exit(2);
  }
  console.error(`✓ 聚类出 ${result.hotspots.length} 个热点`);
  console.log(args.json ? JSON.stringify(result, null, 2) : renderHotspotsMarkdown(result));
} catch (err) {
  console.error(`✗ 扫描失败: ${err.message}`);
  process.exit(1);
}
