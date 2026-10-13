# ai-hot-radar

AI 领域热点发现与关键词监控技能。源码位于 `ai-hot-monitor` 项目的 `skill/ai-hot-radar/`，本目录为安装副本。

## 安装

```bash
# 从项目安装到用户级技能目录（所有项目可用）
cp -r skill/ai-hot-radar ~/.agents/skills/
```

## 凭证

环境变量或向上查找的 `.env`：`OPENROUTER_API_KEY`（必需）、`FIRECRAWL_API_KEY`（可选）。

## 命令

```bash
node scripts/discover.mjs "AI 编程" [--top 8] [--json] [--angle]
node scripts/monitor.mjs list | add <词> | scan <词> | signals [N]
```

详见 SKILL.md。
