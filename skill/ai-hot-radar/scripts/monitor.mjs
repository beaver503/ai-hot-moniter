#!/usr/bin/env node
/**
 * 能力② 关键词监控 —— 双模式：
 *   本地雷达站在跑 → 走 API（持久监控：定时扫描 + AI 验真 + SSE/邮件通知）
 *   服务不在        → 降级为一次性独立扫描（直接输出本轮判定结果）
 *
 * 子命令:
 *   list                 查看监控词与最近信号
 *   add <词> [--kind monitor|domain] [--interval 30]   注册监控词（仅 API 模式）
 *   scan <词>            立即扫描：API 模式触发持久管道；独立模式跑一次性判定
 *   signals [N]          查看最近 N 条确认信号（默认 10）
 *   --json               结构化输出
 */
import { loadCredentials, judgeOnce, renderJudgeMarkdown, probeApi, argParse } from "./lib.mjs";

const args = argParse(process.argv);
const [cmd, ...rest] = args._;
const base = await probeApi();

function out(text, data) {
  console.log(args.json ? JSON.stringify(data, null, 2) : text);
}

async function apiGet(p) {
  const res = await fetch(`${base}${p}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

if (cmd === "list" || cmd === "status") {
  if (!base) {
    console.error("○ 本地雷达站未运行（探测 localhost:3742 失败）。");
    console.error("  持久监控需要在项目目录 npm start 启动服务后用 add 注册监控词。");
    console.error("  当前可用：scan <词> 一次性独立扫描。");
    process.exit(2);
  }
  const state = await apiGet("/api/state");
  const lines = [
    `◉ 雷达站运行中（${base}）· AI ${state.system.openrouterReady ? "✓" : "✗"} · 搜索 ${state.system.firecrawlReady ? "✓" : "✗"} · 邮件 ${state.system.mailConfigured ? "✓" : "—"}`,
    "",
    "监控词:",
    ...state.keywords.map((k) =>
      `  ${k.enabled ? "●" : "○"} ${k.word} [${k.kind === "domain" ? "领域热点" : "精准监控"}] 确认 ${k.confirmed_count || 0} · 疑似 ${k.suspect_count || 0} · 每 ${k.kind === "domain" ? "—" : k.interval_min + " 分"}${k.last_scan_at ? ` · 上次扫描 ${new Date(k.last_scan_at * 1000).toLocaleString("zh-CN", { hour12: false })}` : " · 未扫描"}`),
    "",
    `最近确认信号 ${state.signals.length} 条（signals [N] 查看更多）`,
  ];
  out(lines.join("\n"), state);
} else if (cmd === "add") {
  const word = rest[0];
  if (!word) { console.error('用法: add <词> [--kind monitor|domain] [--interval 30]'); process.exit(1); }
  if (!base) {
    console.error("✗ 注册持久监控需要本地雷达站运行：在项目目录执行 npm start，然后重试。");
    console.error("  或者使用 scan <词> 做一次性独立扫描（不注册）。");
    process.exit(2);
  }
  const res = await fetch(`${base}/api/keywords`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, kind: args.kind || "monitor", interval_min: args.interval }),
  });
  const data = await res.json();
  if (!res.ok) { console.error(`✗ ${data.error}`); process.exit(1); }
  out(`◉ 「${word}」已注册，20~40 秒内首轮扫描，之后按间隔自动盯梢（AI 验真后才推送）`, data);
} else if (cmd === "scan") {
  const word = rest[0];
  if (!word) { console.error("用法: scan <词>"); process.exit(1); }
  if (base) {
    // API 模式：找到词则触发持久管道（结果进信号流/通知），否则先注册再扫
    const state = await apiGet("/api/state");
    const kw = state.keywords.find((k) => k.word.toLowerCase() === word.toLowerCase());
    if (kw) {
      await fetch(`${base}/api/keywords/${kw.id}/scan`, { method: "POST" });
      out(`⚡ 已触发「${word}」持久扫描，AI 判定完成后结果进入信号流（用 signals 查看）`, { triggered: true, mode: "api" });
      process.exit(0);
    }
    console.error(`○ 雷达站中尚无「${word}」，请先 add 注册（或服务不在时使用独立扫描）。`);
    process.exit(2);
  }
  // 独立模式：一次性判定
  loadCredentials();
  console.error(`◉ 独立模式扫描「${word}」…（雷达站未运行，结果仅本次输出）`);
  const judged = await judgeOnce(word);
  out(renderJudgeMarkdown(word, judged), judged);
} else if (cmd === "remove") {
  const word = rest[0];
  if (!word) { console.error("用法: remove <词>"); process.exit(1); }
  if (!base) { console.error("✗ 删除监控词需要本地雷达站运行（npm start）。"); process.exit(2); }
  const state = await apiGet("/api/state");
  const kw = state.keywords.find((k) => k.word.toLowerCase() === word.toLowerCase());
  if (!kw) { console.error(`✗ 未找到监控词「${word}」`); process.exit(1); }
  const res = await fetch(`${base}/api/keywords/${kw.id}`, { method: "DELETE" });
  if (!res.ok) { console.error(`✗ 删除失败 API ${res.status}`); process.exit(1); }
  out(`✓ 「${kw.word}」已从雷达移除`, { removed: kw.id });
} else if (cmd === "signals") {
  const n = Number(rest[0]) || 10;
  if (!base) { console.error("✗ 查看信号流需要本地雷达站运行（npm start）。"); process.exit(2); }
  const { signals } = await apiGet(`/api/signals?limit=${n}`);
  if (args.json) { console.log(JSON.stringify(signals, null, 2)); process.exit(0); }
  if (!signals.length) { console.log("暂无确认信号 —— AI 宁可不报，不推垃圾。"); process.exit(0); }
  console.log(signals.map((s) =>
    `◉ [${s.keyword}] ${s.title}\n  ${s.confidence}% · ${s.source || "web"} · ${new Date(s.foundAt * 1000).toLocaleString("zh-CN", { hour12: false })}\n  ${s.summary || ""}\n  ↗ ${s.url}\n`).join("\n"));
} else {
  console.error(`ai-hot-radar monitor —— 关键词监控
用法:
  node monitor.mjs list
  node monitor.mjs add <词> [--kind monitor|domain] [--interval 30]
  node monitor.mjs remove <词>
  node monitor.mjs scan <词>          # 服务在跑=触发持久扫描；否则一次性独立判定
  node monitor.mjs signals [N]
  任意命令 + --json 输出结构化数据`);
  process.exit(1);
}
