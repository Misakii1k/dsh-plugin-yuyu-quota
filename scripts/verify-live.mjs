/**
 * 针对「正在运行的 DSH」的验收脚本。
 *
 * 与 smoke-test / cf-functions-test 不同，这个脚本不模拟任何东西：
 * 它直接请求 DSH 进程里的插件后端（bridge 127.0.0.1:53788，回退同源路由），
 * 确认新版代码是否真的被加载。
 *
 * 用法：先重启 DeepSeek-Harness，再执行
 *   node scripts/verify-live.mjs          # 只检查
 *   node scripts/verify-live.mjs --notify # 另外弹一条真实通知
 */
const BRIDGE = 'http://127.0.0.1:53788/yuyu-quota/api';
const withNotify = process.argv.includes('--notify');

let passed = 0;
let failed = 0;

function pass(name, detail) {
  passed += 1;
  console.log(`  ok   ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(name, detail) {
  failed += 1;
  console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
}

async function getJson(pathname, init) {
  const res = await fetch(BRIDGE + pathname, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

console.log('\n检查运行中的 DSH 插件后端\n');

let reachable = true;
try {
  const res = await fetch(`${BRIDGE}/settings`, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) reachable = false;
} catch {
  reachable = false;
}

if (!reachable) {
  console.log('  FAIL 无法连接插件后端');
  console.log('\n  请确认：');
  console.log('   1. DeepSeek-Harness 正在运行；');
  console.log('   2. 插件已启用（设置 -> 插件里能看到「鱼鱼API 资产」）。');
  console.log('\n  若 DSH 正在运行但仍连不上，说明 bridge 端口被占用，');
  console.log('  此时插件会回退到 DSH 同源路由，本脚本需改走 GUI 端口。\n');
  process.exit(1);
}

// 1) 新路由是否存在 —— 这是判断"新代码是否加载"最直接的证据
const settings = await getJson('/settings');
if (settings.status === 200 && settings.body && settings.body.ok && settings.body.preferences) {
  pass('GET /settings 可用（v1.1.0 新路由）', `version=${settings.body.version}`);
} else {
  fail('GET /settings 不可用', JSON.stringify(settings.body).slice(0, 120));
  console.log('\n  这说明 DSH 仍在运行旧版插件，请彻底退出后重新打开。\n');
  process.exit(1);
}

if (settings.body.version === '1.1.0') {
  pass('版本号为 1.1.0', settings.body.version);
} else {
  fail('版本号不是 1.1.0', String(settings.body.version));
}

const lastTurn = await getJson('/last-turn');
if (lastTurn.status === 200 && lastTurn.body && typeof lastTurn.body.seq === 'number') {
  pass('GET /last-turn 可用', `seq=${lastTurn.body.seq}${lastTurn.body.lastTurn ? `，最近一轮 ${lastTurn.body.lastTurn.tokens.totalTokens} tokens` : '（本会话还没有已完成的轮次）'}`);
} else {
  fail('GET /last-turn 不可用', JSON.stringify(lastTurn.body).slice(0, 120));
}

// 2) 偏好结构完整性
const prefs = settings.body.preferences;
const requiredKeys = [
  'notifyOnComplete',
  'notifySound',
  'notifySubagentMute',
  'notifyOnFailure',
  'reportOnComplete',
  'updateCheck',
  'updateFeedUrl',
  'githubRepo',
  'updateCheckIntervalHours'
];
const missing = requiredKeys.filter((key) => !(key in prefs));
if (missing.length === 0) {
  pass('偏好字段齐全', `notifySound=${prefs.notifySound}`);
} else {
  fail('偏好字段缺失', missing.join(', '));
}

if (!prefs.updateFeedUrl) {
  console.log('  warn  updateFeedUrl 未配置 —— 云端更新检查会因仓库私有而失败（不影响其他功能）');
  console.log('        配置方法见 docs/CLOUDFLARE-部署指南.md');
}

// 3) 更新检查（不阻断）
const update = await getJson('/update?force=1');
if (update.status === 200 && update.body && update.body.update) {
  const info = update.body.update;
  if (info.error) {
    console.log(`  warn  更新检查未成功：${String(info.error).slice(0, 100)}`);
    console.log('        这在 updateFeedUrl 未配置时是预期结果');
  } else if (info.available) {
    pass('发现新版本', `v${info.latestVersion}`);
  } else {
    pass('更新检查可用', `已是最新（来源 ${info.source}）`);
  }
} else {
  fail('GET /update 不可用', JSON.stringify(update.body).slice(0, 120));
}

// 4) 真实通知（可选）
if (withNotify) {
  const notify = await getJson('/notify/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  if (notify.status === 200 && notify.body && notify.body.ok) {
    pass('测试通知已弹出', '请查看系统右上角与操作中心');
  } else {
    fail('测试通知失败', JSON.stringify(notify.body).slice(0, 160));
  }
} else {
  console.log('  info  加 --notify 参数会额外弹一条真实通知');
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`);
process.exit(failed === 0 ? 0 : 1);
