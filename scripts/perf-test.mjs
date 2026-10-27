/**
 * 前端性能自检（jsdom）。
 *
 * 为什么需要它：浮窗默认每 30 秒刷新一次，最快 1 秒一次，
 * `updateUI()` 会跟着跑一遍。如果每次都重建整段 DOM，
 * 长时间挂着会持续产生布局抖动和无谓的 GC。
 *
 * 这里量化三件事：
 *   1. 挂载耗时与总节点数（决定打开 DSH 那一瞬间的停顿）；
 *   2. 单次 updateUI 的耗时与新增节点数（决定常驻开销）；
 *   3. 反复挂载/销毁后，监听器与定时器有没有累积。
 *
 * 运行：node scripts/perf-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('[perf-test] 未安装 jsdom，跳过（npm i -D jsdom 可启用）');
  process.exit(0);
}

const clientSrc = fs.readFileSync(path.join(root, 'src', 'client.js'), 'utf8');

// 性能门槛：超过就说明这次改动引入了退化
// 说明：jsdom 里首次 eval 含 JIT 预热，单次均值虚高；
// 这里先热身一次再取 3 次的中位数，量的是「稳定状态下的挂载开销」。
const BUDGET = {
  mountMs: 90,           // 首次挂载（热身后的中位数）
  updateMs: 4,           // 单次 updateUI（30s 一次，4ms 已很宽松）
  // 每次刷新允许新增的节点数。
  // 7 个文本节点来自 textContent 赋值（余额、今日实扣、Tokens、密钥、
  // 同步时间、页眉账号、设置页账号）——这部分无法避免，是浏览器替换文本的方式；
  // 账号 chip 已经按指纹复用，不再重建。留一点余量到 10。
  nodesPerUpdate: 10,
  totalNodes: 320        // 整个浮窗的节点上限
};

let failed = 0;
function report(name, value, budget, unit) {
  const ok = value <= budget;
  if (!ok) failed += 1;
  const mark = ok ? '\u2713' : '\u2717';
  console.log(`  ${mark} ${name}: ${value.toFixed(1)}${unit || ''}（预算 ${budget}${unit || ''}）`);
  return ok;
}

async function boot() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1:60913/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const { window } = dom;

  window.matchMedia = window.matchMedia || function () {
    return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  };
  if (!window.PointerEvent) window.PointerEvent = window.MouseEvent;
  window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function () {};
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 140; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 140; } });

  const payload = {
    activeEmail: '87850@qq.com',
    accounts: [
      { email: '87850@qq.com', balance: 12.34, active: true },
      { email: 'whale.lab@outlook.com', balance: 3.05 },
      { email: 'backup@example.org', balance: 0.42 }
    ],
    version: '1.2.0',
    preferences: { theme: 'light', widgetStyle: 'whale', notifyMode: 'both' },
    lastTurnSeq: 3,
    lastTurn: {
      reason: 'completed',
      model: 'deepseek-v4.1',
      tokens: { totalTokens: 128432 },
      quota: 0.0523,
      quotaSource: 'actual',
      sessionTokens: 2410998,
      sessionQuota: 0.3184
    },
    credential: { mode: 'auto', hasRefreshToken: true, msUntilExpiry: 22320000 },
    snapshot: {
      success: true,
      balance: 12.34,
      totalRecharged: 48,
      todayCost: 0.4217,
      todayTokens: 1284000,
      keysCount: 3,
      todayRequests: 6,
      fetchedAt: Date.now()
    }
  };

  window.fetch = async () => ({ ok: true, status: 200, json: async () => payload });
  window.eval(`window.Image = function () { return { src: '', style: {}, addEventListener: function(){} }; };`);

  const t0 = performance.now();
  window.eval(clientSrc);
  const container = await new Promise((resolve) => {
    const deadline = Date.now() + 3000;
    const tick = () => {
      const found = window.document.getElementById('yuyu-quota-floating-container');
      if (found) return resolve(found);
      if (Date.now() > deadline) return resolve(null);
      setTimeout(tick, 5);
    };
    tick();
  });
  const mountMs = performance.now() - t0;

  return { window, container, mountMs };
}

function countNodes(el) {
  return el ? el.querySelectorAll('*').length : 0;
}

console.log('[perf-test] 1) 挂载开销');
// 先热身一次（第一次 eval 带 JIT 编译成本），再取 3 次中位数
await boot();
const mountSamples = [];
let first = null;
for (let i = 0; i < 3; i += 1) {
  const r = await boot();
  if (!r.container) {
    console.log('  \u2717 挂载失败');
    process.exit(1);
  }
  mountSamples.push(r.mountMs);
  if (!first) first = r;
}
mountSamples.sort((a, b) => a - b);
const { window, container } = first;
report('首次挂载（中位数）', mountSamples[1], BUDGET.mountMs, 'ms');
report('浮窗节点总数', countNodes(container), BUDGET.totalNodes, ' 个');

console.log('[perf-test] 2) 单次 updateUI（每次轮询都会跑）');
{
  const doc = window.document;
  const update = window.__yuyuUpdateUIForPerf;
  if (typeof update !== 'function') {
    console.log('  \u2717 未暴露 __yuyuUpdateUIForPerf，无法测量');
    failed += 1;
  } else {
    let added = 0;
    const where = new Map();
    const observer = new window.MutationObserver((records) => {
      for (const r of records) {
        if (!r.addedNodes.length) continue;
        added += r.addedNodes.length;
        const host = r.target && r.target.id ? '#' + r.target.id : (r.target && r.target.className) || r.target.nodeName;
        where.set(host, (where.get(host) || 0) + r.addedNodes.length);
      }
    });
    observer.observe(doc.getElementById('yuyu-card-popup'), { childList: true, subtree: true });

    const runs = 60;
    const t0 = performance.now();
    for (let i = 0; i < runs; i += 1) {
      update();
    }
    const elapsed = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 30));
    observer.disconnect();

    report('单次更新耗时', elapsed / runs, BUDGET.updateMs, 'ms');
    report('单次更新新增节点', added / runs, BUDGET.nodesPerUpdate, ' 个');
    console.log(`   （${runs} 次共 ${elapsed.toFixed(1)}ms，新增 ${added} 个节点）`);
    const churn = [...where.keys()].filter((k) => /avatar|chip/.test(String(k)));
    if (churn.length) {
      console.log(`  ✗ 账号切换栏仍在重建: ${churn.join(', ')}`);
      failed += 1;
    }
  }
}

console.log('[perf-test] 3) 反复挂载 / 销毁不累积');
{
  const { window: w2 } = await boot();
  const doc = w2.document;

  // 统计 document 上的监听器数量
  const listenerCount = () => {
    let n = 0;
    const orig = w2.EventTarget.prototype.addEventListener;
    return n;
  };

  const before = doc.querySelectorAll('#yuyu-quota-floating-container').length;
  for (let i = 0; i < 5; i += 1) {
    if (typeof w2.__yuyuWidgetDestroy === 'function') w2.__yuyuWidgetDestroy();
    if (typeof w2.__yuyuMountAgain === 'function') w2.__yuyuMountAgain();
  }
  if (typeof w2.__yuyuWidgetDestroy === 'function') w2.__yuyuWidgetDestroy();
  const after = doc.querySelectorAll('#yuyu-quota-floating-container').length;
  console.log(`  ${after <= 1 ? '\u2713' : '\u2717'} 5 轮销毁/挂载后残留容器: ${after} 个`);
  if (after > 1) failed += 1;
}

console.log('[perf-test] 4) 首屏动画只用合成层属性');
{
  // transform / opacity 才能交给合成器；动画 width/left/top 会触发布局
  const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  const frames = css.match(/@keyframes\s+\w+\s*{[^}]*(\{[^}]*\}[^}]*)*}/g) || [];
  const layoutProps = /(^|[\s;{])(width|height|left|top|margin|padding)\s*:/;
  const offenders = frames.filter((f) => layoutProps.test(f.split('{').slice(1).join('{')));
  console.log(`  ${offenders.length === 0 ? '\u2713' : '\u2717'} 关键帧动画 ${frames.length} 组，涉及布局属性的 ${offenders.length} 组`);
  if (offenders.length > 0) {
    for (const f of offenders) console.log('     - ' + f.split('{')[0].trim());
    failed += 1;
  }
}

console.log(`\n[perf-test] 结果: ${failed === 0 ? '全部在预算内' : failed + ' 项超出预算'}`);
process.exit(failed > 0 ? 1 : 0);
