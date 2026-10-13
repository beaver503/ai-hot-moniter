---
name: ai-hot-radar
description: AI 领域热点发现与关键词监控雷达。当用户想了解 AI 大模型、AI 编程、AI 产品领域的最新热点动态，寻找内容选题，监控特定关键词（如 GPT-5、Claude、Cursor、Sora）的真实动态，或需要生成热度榜单时使用——即使用户只是随口问"最近 AI 圈有什么大新闻""帮我看看这个方向有什么值得写的"也应该触发。提供一次性热点发现（discover）与持久关键词监控（monitor，联动本地雷达站服务）两个能力，输出经过 AI 真伪判定的结果，自动过滤标题党、传闻和蹭热度内容。
---

# AI 热点雷达（ai-hot-radar）

为 AI 内容创作者提供两个经过 AI 验真的热点能力。所有结果都经过 AI 真伪判定——假冒内容、猜测传闻、标题党、蹭热度文章已被过滤，因此**结果为空往往意味着"真的没有值得报的事"，这本身是有效结论**，不要为了凑数把被过滤的垃圾内容报给用户。

## 前置条件

脚本零 npm 依赖，只需 Node ≥ 20 和两个凭证（按优先级读取环境变量 → 当前目录向上的 `.env`）：

- `OPENROUTER_API_KEY`（必需，AI 判定/聚合）
- `FIRECRAWL_API_KEY`（可选但推荐，网页搜索；缺失时仅用免费的 Hacker News，覆盖面下降）

## 能力① 领域热点发现（discover）

用户想"看看某个领域最近有什么热点"“找选题"时使用。独立运行，不依赖任何服务。

```bash
node "<skill-path>/scripts/discover.mjs" "AI 编程" --top 8          # Markdown 榜单
node "<skill-path>/scripts/discover.mjs" "AI 大模型" --json        # 结构化输出
node "<skill-path>/scripts/discover.mjs" "AI 编程" --angle         # 附博主选题角度建议
```

- `--top N` 控制数量（默认 8）；`--angle` 会多一次 AI 调用，用户是内容创作者找选题时值得开启。
- stderr 是进度日志，stdout 才是结果。每次消耗约 1-2 个 Firecrawl 积分 + 一次廉价 AI 调用。
- 拿到结果后：向用户转述榜单（标题 + 热度 + 一句摘要 + 关键来源），不要原样粘贴整个 Markdown，除非用户要求。

## 能力② 关键词监控（monitor）

用户想"盯着某个关键词，有动静第一时间告诉我"时使用。脚本会自动探测本地雷达站（localhost:3742）并选择模式：

```bash
node "<skill-path>/scripts/monitor.mjs" list                  # 查看监控词与运行状态
node "<skill-path>/scripts/monitor.mjs" add "GPT-5"           # 注册持久监控（精准盯梢）
node "<skill-path>/scripts/monitor.mjs" add "AI 编程" --kind domain   # 注册领域词（定时聚合热点榜）
node "<skill-path>/scripts/monitor.mjs" scan "GPT-5"          # 立即扫描一轮
node "<skill-path>/scripts/monitor.mjs" remove "GPT-5"        # 移除监控词
node "<skill-path>/scripts/monitor.mjs" signals 10            # 查看最近确认信号
```

**双模式的行为差异（先理解再向用户解释）：**

- **API 模式**（雷达站在运行）：`add` 注册的词由雷达站的调度器持久盯梢——按间隔自动扫描、AI 验真、通过页面信号流和邮件实时推送。这是"第一时间知道"的正确方式，脚本只负责注册和查询。
- **独立模式**（服务未运行）：`scan` 直接做一轮一次性判定并输出结果；`add` 会提示需要先启动服务。此模式没有推送能力，适合快速查一次。

## 输出转述规范

- 榜单/信号按热度或时间排序转述，保留原文链接（用户可能要点进去核实）。
- 明确区分"确认"（真实度 ≥75%）与"疑似"（60-74%）——不要把疑似当确认报。
- 被过滤的 fake/irrelevant 条目默认不展示；如果用户追问"为什么没报 XX"，可以说明判定原因。
- 扫描/聚合需要 20-60 秒（真实网络请求 + AI 调用），向用户预告等待时间。
