import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context, Schema } from 'cordis';
import { YuyuApiClient } from './api.js';
import { createYuyuBalanceTool } from './tool.js';
import { renderWidgetHtml, ICONS } from './widget.js';
import { scanRunningBrowsersForToken, launchAndCaptureToken } from './browser-sync.js';
import { PluginConfig, BalanceSnapshot, RefreshInterval } from './types.js';

export const name = 'dsh-plugin-yuyu-quota';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 刷新间隔映射表 (ms)
 */
const INTERVAL_MAP: Record<RefreshInterval, number> = {
  '30s': 30 * 1000,
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
};

/**
 * Cordis 配置 Schema
 */
export const Config: Schema<PluginConfig> = Schema.object({
  token: Schema.string()
    .role('secret')
    .description('鱼鱼API 网页登录 Auth Token (可在 sub.anzhiyu.com 登录后获取，或点击组件面板的一键同步按钮自动读取)')
    .default(''),
  refreshInterval: Schema.union(['30s', '1m', '3m', '5m'])
    .default('3m')
    .description('定时刷新频率预设 (可选：30秒、1分钟、3分钟、5分钟)'),
  alertThreshold: Schema.number()
    .default(2.0)
    .description('低额提醒阈值 (单位: $，低于此金额在胶囊旁显示原生矢量警示徽标)'),
  baseUrl: Schema.string()
    .default('https://sub.anzhiyu.com')
    .description('鱼鱼API 服务端接口地址 (默认 https://sub.anzhiyu.com，支持国内直连)')
});

/**
 * 查找本地持久化配置文件路径
 */
function resolveConfigFilePath(): string {
  const candidates = [
    path.join(process.cwd(), 'yuyu-config.json'),
    path.resolve(__dirname, '..', 'yuyu-config.json')
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return candidates[1];
}

export function apply(ctx: Context, config: PluginConfig) {
  const logger = ctx.logger ? ctx.logger('yuyu-quota') : console;

  // 尝试从本地持久化配置文件恢复（优先工作目录，其次插件包自身目录）
  const localConfigFile = resolveConfigFilePath();
  if (!config.token && fs.existsSync(localConfigFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(localConfigFile, 'utf8'));
      if (saved.token) {
        config.token = saved.token;
        logger.info?.(`[鱼鱼API] 已从 ${localConfigFile} 加载持久化 Token`);
      }
    } catch {}
  }

  const client = new YuyuApiClient(config.token || '', config.baseUrl);
  let latestSnapshot: BalanceSnapshot | null = null;
  let timer: NodeJS.Timeout | null = null;

  // 1. 数据刷新逻辑
  const refreshData = async () => {
    try {
      latestSnapshot = await client.getBalanceSnapshot(config.alertThreshold);
      if (latestSnapshot.success) {
        logger.info?.(`[鱼鱼API] 余额刷新成功: $${latestSnapshot.balance.toFixed(2)} (今日实扣: $${latestSnapshot.todayCost.toFixed(4)})`);
      } else {
        logger.warn?.(`[鱼鱼API] 余额刷新告警: ${latestSnapshot.error}`);
      }
    } catch (e: any) {
      logger.error?.(`[鱼鱼API] 刷新异常: ${e?.message || e}`);
    }
  };

  // 2. 注册 DeepSeek Harness Agent Tool
  const balanceTool = createYuyuBalanceTool(client, config.alertThreshold);

  if ((ctx as any).agent?.registerTool) {
    (ctx as any).agent.registerTool(balanceTool);
  } else if ((ctx as any).tool) {
    (ctx as any).tool(balanceTool);
  }

  // 3. 注册从浏览器一键同步命令与后端处理
  const syncCredentials = async (forceCapture = false) => {
    logger.info?.('[鱼鱼API] 正在智能扫描浏览器登录凭据...');
    let res = await scanRunningBrowsersForToken();
    if (!res.success && forceCapture) {
      logger.info?.('[鱼鱼API] 未检测到活动标签，启动独立窗口引导登录...');
      res = await launchAndCaptureToken();
    }
    if (res.success && res.token) {
      config.token = res.token;
      client.updateToken(res.token);

      // 持久化保存
      try {
        fs.writeFileSync(localConfigFile, JSON.stringify({
          token: res.token,
          refreshInterval: config.refreshInterval || '3m',
          alertThreshold: config.alertThreshold || 2.0,
          baseUrl: config.baseUrl || 'https://sub.anzhiyu.com',
          lastSyncedAt: new Date().toISOString(),
          cachedEmail: res.email,
          cachedBalance: res.balance
        }, null, 2), 'utf8');
      } catch {}

      await refreshData();
    }
    return res;
  };

  if ((ctx as any).command) {
    (ctx as any).command('yuyu.sync', '智能扫描并同步浏览器中的鱼鱼API登录凭据')
      .action(async () => {
        const res = await syncCredentials(false);
        return res.message;
      });
  }

  // 4. 注册 DSH Web 状态栏组件与 API 路由
  if ((ctx as any).web) {
    const web = (ctx as any).web;
    web.addStatusBarItem?.({
      id: 'yuyu-quota-status',
      name: '鱼鱼API 余额',
      render: () => {
        if (!latestSnapshot) {
          return `<div style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:3px 10px;border-radius:12px;background:#f3f4f6;color:#6b7280;">${ICONS.wallet} 鱼鱼: 同步中...</div>`;
        }
        return renderWidgetHtml(latestSnapshot);
      }
    });

    web.get?.('/api/yuyu/snapshot', async (_req: any, res: any) => {
      if (!latestSnapshot) await refreshData();
      res.json(latestSnapshot);
    });

    web.post?.('/api/yuyu/sync', async (_req: any, res: any) => {
      const result = await syncCredentials(true);
      res.json({
        ...result,
        snapshot: latestSnapshot
      });
    });
  }

  // 5. 启动定时轮询
  const intervalMs = INTERVAL_MAP[config.refreshInterval] || 3 * 60 * 1000;
  refreshData();
  timer = setInterval(refreshData, intervalMs);

  // 6. 卸载钩子
  ctx.on('dispose', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    logger.info?.('[鱼鱼API] 插件已卸载');
  });
}

export * from './types.js';
export * from './api.js';
export * from './tool.js';
export * from './widget.js';
export * from './browser-sync.js';
