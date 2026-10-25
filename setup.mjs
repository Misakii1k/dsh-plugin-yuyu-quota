import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { scanRunningBrowsersForToken, launchAndCaptureToken } from './lib/browser-sync.js';

console.log('========================================================');
console.log('    [鱼鱼API - DeepSeek Harness 插件 一键配置向导]    ');
console.log('========================================================\n');

async function main() {
  console.log('[1/3] 正在智能扫描运行中的浏览器 (Chrome / Edge / Brave)...');
  const scanRes = await scanRunningBrowsersForToken();

  let finalToken = '';
  let userEmail = '';
  let userBalance = 0;

  if (scanRes.success && scanRes.token) {
    console.log(`[OK] 发现来自【${scanRes.browser}】的已登录会话！`);
    console.log(`[OK] 验证成功: 邮箱 ${scanRes.email} | 当前可用余额 ¥${scanRes.balance?.toFixed(2)} 元\n`);
    finalToken = scanRes.token;
    userEmail = scanRes.email || '';
    userBalance = scanRes.balance || 0;
  } else {
    console.log(`[提示] ${scanRes.message}`);
    console.log('[2/3] 正在启动专用登录窗口以自动捕获凭据，请在弹出的窗口中完成登录...');

    const captureRes = await launchAndCaptureToken(120000);
    if (!captureRes.success || !captureRes.token) {
      console.error(`\n[FAIL] 捕获失败: ${captureRes.message}`);
      console.log('您可以稍后重新运行本脚本，或手动复制 Token 填入配置。');
      return;
    }

    console.log(`\n[OK] 登录完成，凭证已成功捕获！`);
    console.log(`[OK] 验证成功: 邮箱 ${captureRes.email} | 当前可用余额 ¥${captureRes.balance?.toFixed(2)} 元\n`);
    finalToken = captureRes.token;
    userEmail = captureRes.email || '';
    userBalance = captureRes.balance || 0;
  }

  // 3. 写入配置文件
  console.log('[3/3] 正在持久化保存配置...');
  const configData = {
    token: finalToken,
    refreshInterval: '3m',
    alertThreshold: 2.0,
    baseUrl: 'https://sub.anzhiyu.com',
    lastSyncedAt: new Date().toISOString(),
    cachedEmail: userEmail,
    cachedBalance: userBalance
  };

  const configFile = path.join(process.cwd(), 'yuyu-config.json');
  fs.writeFileSync(configFile, JSON.stringify(configData, null, 2), 'utf8');

  console.log(`[OK] 配置已成功保存至: ${configFile}`);
  console.log('\n========================================================');
  console.log(' [全部就绪] 鱼鱼API 插件配置已全自动完成！');
  console.log(` 当前可用余额: ¥${userBalance.toFixed(2)} 元`);
  console.log(' 现在您可以直接启动并享受 DeepSeek Harness 实时余额监控了。');
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('\n[错误] 配置过程发生未预期的异常:', err);
});
