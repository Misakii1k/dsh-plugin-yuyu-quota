import { YuyuApiClient } from './lib/api.js';
import { scanRunningBrowsersForToken } from './lib/browser-sync.js';

// 优先从环境变量获取，否则直接从本地浏览器存储无感扫描（不依赖 MCP）
let token = process.env.YUYU_AUTH_TOKEN;

if (!token) {
  const scanRes = await scanRunningBrowsersForToken();
  if (scanRes.success && scanRes.token) {
    token = scanRes.token;
    console.log(`[OK] 已从本地【${scanRes.browser}】存储无感提取当前活跃账号 (${scanRes.email})！`);
    if (scanRes.allDiscovered && scanRes.allDiscovered.length > 1) {
      console.log(`[OK] 同时发现共 ${scanRes.allDiscovered.length} 个已登录账号: ${scanRes.allDiscovered.map(a => a.email).join(', ')}`);
    }
  }
}

if (!token) {
  console.error('[FAIL] 未找到有效 Token！请先在浏览器中登录 https://sub.anzhiyu.com');
  process.exit(1);
}

console.log('[RUN] 开始测试调用鱼鱼API直连查询接口...\n');
const client = new YuyuApiClient(token);
const snapshot = await client.getBalanceSnapshot(2.0);

console.log('-------------------------------------------');
console.log(snapshot.formattedText);
console.log('-------------------------------------------');
console.log('原始数据结构:');
console.log({
  '邮箱': snapshot.email,
  '可用余额': `$${snapshot.balance.toFixed(2)}`,
  '今日实扣花费': `$${snapshot.todayCost.toFixed(4)}`,
  '今日原价花费': `$${snapshot.todayRawCost.toFixed(4)}`,
  '今日Token数': snapshot.todayTokens,
  '关联密钥数': snapshot.keysCount,
  '低额警报状态': snapshot.isLowBalance ? '[触发预警]' : '[正常]',
  '耗时': `${Date.now() - snapshot.timestamp} ms`
});
