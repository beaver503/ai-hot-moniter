import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.AHM_DATA_DIR || path.join(ROOT, 'data');

export const config = {
  port: Number(process.env.PORT) || 3742,
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  firecrawlKey: process.env.FIRECRAWL_API_KEY || '',

  // 默认设置（用户可在设置页覆盖，存 DB settings 表）
  defaults: {
    aiModel: 'deepseek/deepseek-chat-v3.1', // OpenAI/Gemini 系在部分区域被 403，DeepSeek 无限制
    keywordIntervalMin: 30,      // 监控词扫描间隔（分钟）
    hotspotIntervalMin: 60,      // 热点聚合间隔（分钟）
    confidenceThreshold: 75,     // ≥此值判定为真实并发通知
    suspectThreshold: 60,        // ≥此值存库标"疑似"，不发通知
    providerFirecrawl: 1,       // 数据源开关
    providerHackernews: 1,
    searchWindowHours: 48,      // 初始搜索回溯窗口（小时）
    mailHost: '',
    mailPort: 465,
    mailSecure: 1,
    mailUser: '',
    mailPass: '',
    mailFrom: '',
    mailTo: '',
    mailEnabled: 0,
  },
};
