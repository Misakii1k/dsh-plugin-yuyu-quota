import { YuyuApiClient } from './lib/api.js';

// 优先从环境变量获取，否则尝试从已登录 Chrome 自动读取
let token = process.env.YUYU_AUTH_TOKEN;

if (!token) {
  try {
    const { puppeteer } = await import('file:///D:/npm-cache/_npx/15c61037b1978c83/node_modules/chrome-devtools-mcp/build/src/third_party/index.js');
    const browser = await puppeteer.connect({ channel: 'chrome' });
    const pages = await browser.pages();
    const targetPage = pages.find(p => p.url().includes('sub.anzhiyu.com'));
    if (targetPage) {
      token = await targetPage.evaluate(() => localStorage.getItem('auth_token'));
      console.log('[OK] 已成功从运行中的 Chrome 自动提取当前登录 Auth Token！');
    }
    await browser.disconnect();
  } catch (err) {
    // 忽略连接错误，提示用户传入
  }
}

if (!token) {
  console.error('[FAIL] 未找到 Token！请在环境变量中设置 YUYU_AUTH_TOKEN，或确保 Chrome 已打开 sub.anzhiyu.com 页面。');
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
