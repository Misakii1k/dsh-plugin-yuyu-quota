/**
 * 真实浏览器性能测量（Chrome + CDP，不依赖 jsdom）。
 *
 * jsdom 量得到的是 JS 执行时间，量不到布局、绘制和合成。
 * 这里在真实 Chromium 里跑三组测量：
 *   1. 挂载后的 LayoutCount / RecalcStyleCount（样式与布局代价）；
 *   2. 卡片呼出动画期间的帧间隔（有没有掉帧）；
 *   3. 长时间轮询（模拟 60 次刷新）后的堆增长。
 *
 * 运行：node scripts/perf-browser.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const harness = path.join(root, '.oil-ui', 'quota-card-redesign', 'explore', 'harness.html');
const clientArg = process.argv.find((a) => a.startsWith('--client='));
const clientPath = clientArg ? path.resolve(root, clientArg.split('=')[1]) : path.join(root, 'src', 'client.js');

if (!fs.existsSync(harness)) {
  console.log('[perf-browser] 缺少 harness，跳过（.oil-ui 是本地工作区，不入库）');
  process.exit(0);
}

// 浏览器启动器来自本机安装的 oil-ui skill；没有就跳过这组测量。
// 它只负责起一个临时 Chrome 并给出 CDP 地址，不参与产品逻辑。
async function loadChromeHelper() {
  const candidates = [
    process.env.OIL_SKILL_DIR && path.join(process.env.OIL_SKILL_DIR, 'scripts', 'chrome.mjs'),
    path.join(os.homedir(), '.dsh', 'skills', 'oil-ui', 'scripts', 'chrome.mjs')
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return await import(pathToFileURL(c).href);
  }
  return null;
}

const chromeMod = await loadChromeHelper();
if (!chromeMod) {
  console.log('[perf-browser] 未找到浏览器启动器（oil-ui skill），跳过真实浏览器测量');
  process.exit(0);
}
const { createChrome } = chromeMod;

const PORT = 5391;
const URL_BASE = `http://127.0.0.1:${PORT}`;

// 极简静态服务
const server = (await import('node:http')).createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  // 用 --client 指定的文件顶替页面里的 ../../../src/client.js
  if (rel.endsWith('/src/client.js') && clientPath) {
    const ext = path.extname(clientPath);
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    fs.createReadStream(clientPath).pipe(res);
    return;
  }
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  const ext = path.extname(file);
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type + '; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = createChrome({ label: 'perf' });
let ws;
try {
  // launch() 返回 WebSocket 地址，不是连接对象
  const wsUrl = await browser.launch();
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
} catch (err) {
  server.close();
  console.log('[perf-browser] 无法启动浏览器，跳过：' + err.message);
  process.exit(0);
}

let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(method + ' 超时'));
      }
    }, 20000);
  });
}

const evaluate = async (expr) => {
  const r = await sessionSend('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description));
  return r.result.value;
};

// 根连接是 browser target，Page/Runtime 必须挂在具体的页面 target 上
const { targetInfos } = await send('Target.getTargets');
const pageTarget = targetInfos.find((t) => t.type === 'page');
const { sessionId } = await send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });

const sessionSend = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(method + ' 超时'));
      }
    }, 20000);
  });
};

await sessionSend('Page.enable');
await sessionSend('Runtime.enable');
await sessionSend('Performance.enable');

const results = [];
function ok(name, value, budget, unit) {
  const pass = value <= budget;
  results.push(pass);
  console.log(`  ${pass ? '\u2713' : '\u2717'} ${name}: ${typeof value === 'number' ? value.toFixed(1) : value}${unit || ''}（预算 ${budget}${unit || ''}）`);
}

console.log(`[perf-browser] 被测文件: ${path.relative(root, clientPath)}`);
console.log('[perf-browser] 1) 挂载的样式与布局代价');
await sessionSend('Page.navigate', { url: URL_BASE + '/.oil-ui/quota-card-redesign/explore/harness.html' });
await new Promise((r) => setTimeout(r, 1800));

const metrics = async () => {
  const m = await sessionSend('Performance.getMetrics');
  const map = {};
  for (const it of m.metrics) map[it.name] = it.value;
  return map;
};

const m1 = await metrics();
// 预算按实测校准：旧版（把所有设置塞进同一张卡）挂载时样式重算 225 次，
// 当前版本 61 次。定 90 留出余量，同时能把「又退回到 200+」这种回归拦住。
ok('挂载期间样式重算次数', m1.RecalcStyleCount, 90, ' 次');
ok('挂载期间布局次数', m1.LayoutCount, 25, ' 次');

console.log('[perf-browser] 2) 卡片呼出动画的帧间隔');
const frames = await evaluate(`
  (async () => {
    const gaps = [];
    let last = performance.now();
    let running = true;
    const tick = (t) => {
      gaps.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.getElementById('yuyu-whale-menu-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    running = false;
    await new Promise(r => setTimeout(r, 50));
    const body = gaps.slice(1);
    const sorted = body.slice().sort((a,b) => a-b);
    return {
      count: body.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      max: Math.max(...body)
    };
  })()
`);
console.log(`   ${frames.count} 帧，p50 ${frames.p50.toFixed(1)}ms，p95 ${frames.p95.toFixed(1)}ms，最长 ${frames.max.toFixed(1)}ms`);
ok('动画 p95 帧间隔', frames.p95, 34, 'ms');

console.log('[perf-browser] 3) 持续轮询后的堆增长');
const heap = await evaluate(`
  (async () => {
    const update = window.__yuyuUpdateUIForPerf;
    if (!update) return { error: 'missing hook' };
    if (window.gc) window.gc();
    const before = performance.memory ? performance.memory.usedJSHeapSize : 0;
    for (let i = 0; i < 300; i += 1) update();
    await new Promise(r => setTimeout(r, 120));
    if (window.gc) window.gc();
    const after = performance.memory ? performance.memory.usedJSHeapSize : 0;
    return { before, after, deltaKB: (after - before) / 1024 };
  })()
`);
if (heap.error) {
  console.log('  - 无法读取堆信息，跳过');
} else {
  ok('300 次刷新后堆增长', heap.deltaKB, 600, ' KB');
}

const m2 = await metrics();
console.log('[perf-browser] 4) 交互期间的布局抖动');
// 同上：旧版一次交互 41 次布局，当前 2 次
ok('本轮交互新增布局次数', m2.LayoutCount - m1.LayoutCount, 15, ' 次');

server.close();
try { await browser.stop(ws); } catch {}

const failed = results.filter((r) => !r).length;
console.log(`\n[perf-browser] 结果: ${failed === 0 ? '全部在预算内' : failed + ' 项超出预算'}`);
process.exit(failed > 0 ? 1 : 0);
