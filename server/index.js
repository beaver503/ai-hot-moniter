import express from 'express';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { api } from './routes/api.js';
import { rescheduleAll, stopAll, nextSchedules } from './scheduler.js';
import { broadcast } from './notify/sse.js';
import { getSettings } from './db.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

app.use('/api', api);
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));

// SPA 兜底
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('[api error]', err.message);
  res.status(500).json({ error: err.message });
});

const server = app.listen(config.port, () => {
  const s = getSettings();
  console.log(`
  ┌─────────────────────────────────────────────┐
  │        ◉ AI 热点雷达站 已启动               │
  │                                             │
  │   地址     http://localhost:${String(config.port).padEnd(13)}│
  │   OpenRouter  ${config.openrouterKey ? '✓ 已配置' : '✗ 未配置（AI 判定暂停）'}      │
  │   Firecrawl  ${config.firecrawlKey ? '✓ 已配置' : '✗ 未配置'}      │
  │   扫描间隔   监控词 ${s.keywordIntervalMin} 分钟 / 热点 ${s.hotspotIntervalMin} 分钟       │
  └─────────────────────────────────────────────┘
  `);
  rescheduleAll();
  setTimeout(() => console.log('  调度计划:', JSON.stringify(nextSchedules())), 1000);
});

// 热点间隔设置变更广播（供前端提示）
process.on('SIGINT', () => {
  console.log('\n正在关闭雷达站…');
  stopAll();
  broadcast('system_alert', { level: 'info', message: '服务器关闭', at: Math.floor(Date.now() / 1000) });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
});
