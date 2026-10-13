# ◉ AI 热点雷达站

> AI 编程博主的私人热点情报站：关键词精准监控 + 领域热点聚合，AI 判别真伪，第一时间通知。

Express + 原生 `node:sqlite` 后端，React 19 + Vite + Tailwind v4 + Aceternity UI 前端，单机零运维部署。

## 一、环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | **≥ 22.5** | 数据库用原生 `node:sqlite`（本机 24.x 验证通过），**无需安装 better-sqlite3** |
| npm | 随 Node 附带 | — |

查看版本：`node -v`

## 二、快速启动（3 步）

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（必填 OpenRouter Key）
cp .env.example .env
#    编辑 .env，填入 OPENROUTER_API_KEY（https://openrouter.ai/keys 免费申请）

# 3. 构建前端并启动
npm run build
npm start
```

启动后打开 **http://localhost:3742**，看到启动横幅和雷达扫描页面即成功：

```
┌─────────────────────────────────────────────┐
│        ◉ AI 热点雷达站 已启动               │
│                                             │
│   地址     http://localhost:3742            │
│   OpenRouter  ✓ 已配置                      │
│   Firecrawl  ✓ 已配置                       │
│   扫描间隔   监控词 30 分钟 / 热点 60 分钟    │
└─────────────────────────────────────────────┘
```

顶栏状态徽章应显示 AI / 搜索 / 邮件三项配置状态。添加一个监控词（如 GPT-5）后 15~40 秒内开始首轮扫描。

## 三、启动方式一览

| 命令 | 用途 | 说明 |
|---|---|---|
| `npm start` | **生产运行** | 后端直接托管 `dist/` 构建产物，访问 :3742 |
| `npm run dev` | 后端开发 | `node --watch` 监听重启，改后端代码自动生效 |
| `npm run dev:web` | 前端开发 | Vite 热更新 :5173，`/api` 自动代理到 :3742（需另开一个终端跑 `npm run dev` 或 `npm start`） |
| `npm run build` | 构建前端 | 产物输出到 `dist/`，`npm start` 优先托管它，无则退回旧版 `public/` |
| `npm test` | 运行测试 | `node --test`，16 个用例（AI 判定 / 去重 / 流水线） |

典型前端开发流程：终端 A 跑 `npm run dev`，终端 B 跑 `npm run dev:web`，浏览器开 http://localhost:5173。

## 四、配置说明

### 环境变量（.env）

| 变量 | 必填 | 说明 |
|---|---|---|
| `OPENROUTER_API_KEY` | **必填** | AI 真伪判定与热点聚合用，[openrouter.ai/keys](https://openrouter.ai/keys) 免费申请。未配置时扫描暂停，页面红色提示，**绝不发未验证通知** |
| `FIRECRAWL_API_KEY` | 可选 | 网页搜索数据源；不配则仅用免费的 Hacker News。积分耗尽自动降级仅 HN |
| `PORT` | 可选 | 服务端口，默认 **3742** |

### 邮件通知（网页内配置）

不在 .env 里配，进入网页「**设置**」页填 SMTP（推荐 QQ 邮箱：`smtp.qq.com` + 授权码），有「发送测试邮件」按钮。邮件失败不影响站内信号流。

## 五、常见问题排查

| 现象 | 原因与处理 |
|---|---|
| 启动报 `node:sqlite` 不存在 | Node 版本 < 22.5，升级 Node |
| 页面打不开 | 端口被占用：换 `PORT=xxxx` 后重启，或释放 3742 |
| 首页白屏 / 样式丢失 | 未执行 `npm run build`（服务回退到了旧版 `public/`），构建后重启 |
| 扫描一直暂停 | 未配置 `OPENROUTER_API_KEY`，按启动横幅提示补填后重启 |
| 想清空全部数据 | 删除 `data/radar.db`（SQLite 单文件，WAL 模式），重启即重置 |

## 六、核心能力

**1. 关键词监控（monitor）**
每 N 分钟搜索（Firecrawl + HN 双源）→ URL/标题双通道去重 → OpenRouter AI 逐条判定真伪（过滤标题党/蹭热度/传闻/旧闻）→ 按置信度分级：
- `≥ 确认阈值(75)`：入库 + 页面信号流实时推送（SSE）+ 邮件通知 + 浏览器通知
- `≥ 疑似阈值(60)`：入库标"疑似"，不发通知（页面勾选后可见）
- 更低：仅入库记录，不打扰

**2. 领域热点榜（domain）**
定时聚合领域词（如"AI 编程"）近 24h 内容 → AI 按事件聚类、打热度分、生成中文标题摘要 → 热点榜快照（保留历史）。

## 七、目录结构

```
server/          后端（Express + node:sqlite）
  ├─ index.js        入口：静态托管 + API + 调度器
  ├─ scheduler.js    监控词/热点定时扫描
  ├─ providers/      搜索数据源（Firecrawl / HN）
  ├─ routes/api.js   REST API
  └─ notify/         邮件（SMTP）+ SSE 实时推送
src/             前端（React 19 + Tailwind v4 + Aceternity UI）
dist/            前端构建产物（npm run build 生成，npm start 托管）
data/            radar.db SQLite 数据文件
skill/           ai-hot-radar Agent Skill 封装
test/            node:test 用例
```

## 八、Agent Skill

`skill/ai-hot-radar` 已封装为 Agent Skill，让任意 AI 助手具备"发现热点 / 注册监控"能力（一次性热点发现 discover + 持久监控 monitor，联动本雷达站服务）。
