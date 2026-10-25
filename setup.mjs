import { createYuyuService } from './lib/index.js';

console.log('========================================================');
console.log('    [鱼鱼API - DeepSeek Harness 多账号无感配置向导]    ');
console.log('========================================================\n');

async function main() {
  console.log('[1/2] 正在扫描本地浏览器存储 (Chrome / Edge / Brave，零MCP依赖)...');
  const service = createYuyuService();
  const syncRes = await service.syncFromBrowser(false, undefined, true);

  if (!syncRes.success) {
    console.log(`[提示] ${syncRes.message}`);
    console.log('[2/2] 正在使用默认浏览器打开登录页，请在浏览器中完成登录...');
    await service.syncFromBrowser(true, undefined, true);
  }

  console.log('\n========================================================');
  console.log(` [全部就绪] 已同步共 ${service.store.accounts.length} 个有效账号！`);
  console.log(` 当前活跃账号: ${service.store.activeEmail}`);
  for (const acc of service.store.accounts) {
    const tag = acc.email === service.store.activeEmail ? '● [当前活跃]' : '○ [历史已存]';
    console.log(`   ${tag} ${acc.email} — 余额: $${Number(acc.balance || 0).toFixed(2)}`);
  }
  console.log('========================================================\n');
}

main().catch(err => {
  console.error('\n[错误] 配置过程发生异常:', err);
});
