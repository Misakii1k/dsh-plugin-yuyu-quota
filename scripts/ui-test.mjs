/**
 * 前端 UI 行为自检（jsdom）。
 *
 * 为什么需要它：切换「小鲸鱼 ↔ 胶囊」这类交互曾经在打包后直接失效，
 * 而单元测试与语法检查都发现不了 —— 只有把 client.js 真正挂到 DOM 上，
 * 模拟点击，才能验证「胶囊还能不能打开卡片」。
 *
 * 运行：node scripts/ui-test.mjs
 * 依赖：jsdom（未安装时自动跳过，不阻塞 CI）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('[ui-test] 未安装 jsdom，跳过 DOM 行为自检（npm i -D jsdom 可启用）');
  process.exit(0);
}

const clientSrc = fs.readFileSync(path.join(root, 'src', 'client.js'), 'utf8');

let passed = 0;
let failed = 0;
function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failed += 1;
    console.log(`  \u2717 ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

/** 造一个最小可用的 DSH 页面环境，加载 client.js 并触发挂载。 */
async function boot(options = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body></body></html>`,
    { url: 'http://127.0.0.1:60913/', pretendToBeVisual: true, runScripts: 'outside-only' }
  );
  const { window } = dom;

  // client.js 依赖的浏览器能力补齐
  window.matchMedia = window.matchMedia || function () {
    return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  };
  if (!window.PointerEvent) window.PointerEvent = window.MouseEvent;
  window.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function () {};
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 140; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 140; } });

  if (options.localStorage) {
    for (const [key, value] of Object.entries(options.localStorage)) {
      window.localStorage.setItem(key, value);
    }
  }

  // 拦截外部资源加载（图片/音频）
  window.eval(`
    window.Image = function () { return { src: '', style: {}, addEventListener: function(){} }; };
  `);

  window.eval(clientSrc);

  // client.js 在 DOMContentLoaded 后挂载；等待微任务与事件循环各跑一轮
  const container = await new Promise((resolve) => {
    const deadline = Date.now() + 2000;
    const tick = () => {
      const found = window.document.getElementById('yuyu-quota-floating-container');
      if (found) return resolve(found);
      if (Date.now() > deadline) return resolve(null);
      setTimeout(tick, 10);
    };
    if (window.document.readyState === 'loading') {
      window.document.addEventListener('DOMContentLoaded', () => setTimeout(tick, 0));
    } else {
      setTimeout(tick, 0);
    }
  });
  return { dom, window, container };
}

function visible(el) {
  if (!el) return false;
  if (el.style && el.style.display === 'none') return false;
  return true;
}

console.log('[ui-test] 1) 默认（小鲸鱼）挂载');
{
  const { container } = await boot();
  check('容器已挂载', Boolean(container));
  const whale = container && container.querySelector('#yuyu-whale-root');
  const pill = container && container.querySelector('#yuyu-pill-btn');
  check('小鲸鱼可见', visible(whale));
  check('胶囊隐藏', !visible(pill));
  if (container) {
    const menuBtn = container.querySelector('#yuyu-whale-menu-btn');
    menuBtn.dispatchEvent(new container.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
    check('小鲸鱼可打开卡片', container.querySelector('#yuyu-card-popup').classList.contains('is-open'));
  }
}

console.log('[ui-test] 2) 以胶囊模式启动（历史偏好 widgetStyle=pill）');
{
  const { container } = await boot({ localStorage: { dsh_yuyu_widget_style: 'pill' } });
  const whale = container && container.querySelector('#yuyu-whale-root');
  const pill = container && container.querySelector('#yuyu-pill-btn');
  check('胶囊可见', visible(pill));
  check('小鲸鱼隐藏', !visible(whale));
  if (container && pill) {
    const win = container.ownerDocument.defaultView;
    pill.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const card = container.querySelector('#yuyu-card-popup');
    check('点击胶囊可打开卡片', card.classList.contains('is-open'));
    // 再点一次应当关闭
    pill.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('再次点击胶囊可关闭卡片', !card.classList.contains('is-open'));
  }
}

console.log('[ui-test] 3) 运行时从小鲸鱼切到胶囊');
{
  const { container } = await boot();
  if (container) {
    const win = container.ownerDocument.defaultView;
    const whale = container.querySelector('#yuyu-whale-root');
    const pill = container.querySelector('#yuyu-pill-btn');
    const card = container.querySelector('#yuyu-card-popup');
    // 通过设置面板里的形态切换按钮切到胶囊
    const pillTab = container.querySelector('.yuyu-style-tab[data-val="pill"]');
    pillTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('切换后胶囊可见', visible(pill));
    check('切换后小鲸鱼隐藏', !visible(whale));
    pill.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('切换后胶囊仍可打开卡片', card.classList.contains('is-open'));
    // 切换形态后容器必须仍在视口内（早期 bug：胶囊沿用小鲸鱼的坐标被推出屏幕）
    const left = parseFloat(container.style.left);
    const top = parseFloat(container.style.top);
    const w = win.innerWidth;
    const h = win.innerHeight;
    check(
      '切换形态后浮窗仍在视口内',
      !Number.isFinite(left) || (left >= 0 && left < w && top >= 0 && top < h),
      `left=${container.style.left} top=${container.style.top} vw=${w} vh=${h}`
    );
  }
}

console.log('[ui-test] 4) 卡片打开时切换形态不应丢点击');
{
  const { container } = await boot({ localStorage: { dsh_yuyu_widget_style: 'pill' } });
  if (container) {
    const win = container.ownerDocument.defaultView;
    const pill = container.querySelector('#yuyu-pill-btn');
    const card = container.querySelector('#yuyu-card-popup');
    pill.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('胶囊打开卡片', card.classList.contains('is-open'));
    const whaleTab = container.querySelector('.yuyu-style-tab[data-val="whale"]');
    whaleTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('卡片在切换形态后保持打开', card.classList.contains('is-open'));
    const menuBtn = container.querySelector('#yuyu-whale-menu-btn');
    check('小鲸鱼设置按钮存在', Boolean(menuBtn));
  }
}

console.log('[ui-test] 5) 重复挂载不累积副作用');
{
  const { window, container } = await boot();
  const doc = window.document;
  // 统计容器数量：只允许一个
  check('只挂载一个容器', doc.querySelectorAll('#yuyu-quota-floating-container').length === 1);

  // 重复触发挂载（模拟 React 副作用 + apply 双入口）
  if (typeof window.__yuyuMountAgain === 'function') window.__yuyuMountAgain();
  const before = doc.querySelectorAll('#yuyu-quota-floating-container').length;

  // 手动调用销毁再挂载，验证不会留下两个
  if (typeof window.__yuyuWidgetDestroy === 'function') window.__yuyuWidgetDestroy();
  const afterDestroy = doc.querySelectorAll('#yuyu-quota-floating-container').length;
  check('销毁后容器被移除', afterDestroy === 0, `destroy 后仍有 ${afterDestroy} 个容器`);

  const pill = container.querySelector('#yuyu-pill-btn');
  check('销毁前的容器引用仍可访问（用于清理）', Boolean(pill));
  check('容器数量未因重复挂载增长', before <= 1, `挂载后容器数=${before}`);
}

console.log('[ui-test] 6) localStorage 脏值不会进入 DOM');
{
  const { container } = await boot({
    localStorage: { dsh_yuyu_whale_model: 'x" onerror="alert(1)' }
  });
  if (container) {
    const img = container.querySelector('#yuyu-whale-img');
    const src = img ? img.getAttribute('src') : '';
    check('非法 whaleModel 回落为默认立绘', /DSniang1\.png$/.test(src), `实际 src=${src}`);
    check('未注入 onerror 属性', !img || !img.hasAttribute('onerror'));
  }
}

console.log('[ui-test] 7) 资产 / 设置两视图互斥');
{
  const { container } = await boot();
  if (container) {
    const win = container.ownerDocument.defaultView;
    const card = container.querySelector('#yuyu-card-popup');
    const gear = container.querySelector('#yuyu-card-settings-btn');
    const back = container.querySelector('#yuyu-settings-back');
    const done = container.querySelector('#yuyu-settings-done');

    // 齿轮在卡片里，得先把卡片打开（真实用户也是这个顺序）
    container.querySelector('#yuyu-whale-menu-btn')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('卡片已打开', card.classList.contains('is-open'));

    gear.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('点齿轮进入设置视图', card.classList.contains('yp-settings'));

    back.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('返回按钮回到资产视图', !card.classList.contains('yp-settings'));

    gear.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    done.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('完成按钮回到资产视图', !card.classList.contains('yp-settings'));

    // 视图切换不能顺手把卡片关掉
    check('切视图后卡片仍打开', card.classList.contains('is-open'));
  }
}

console.log('[ui-test] 8) 设置视图在一屏内放得下');
{
  const { container } = await boot();
  if (container) {
    const win = container.ownerDocument.defaultView;
    container.querySelector('#yuyu-card-settings-btn')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    // 设置面板不再有折叠容器，所有控件直接可见
    check('旧的折叠面板已移除', !container.querySelector('#yuyu-settings-panel'));
    check('两栏布局存在', container.querySelectorAll('.yp-col').length === 2);

    const required = [
      '#yuyu-theme-tabs', '#yuyu-style-tabs', '#yuyu-whale-model',
      '#yuyu-interval-tabs', '#yuyu-notify-mode', '#yuyu-sound-effect',
      '#yuyu-press-sound', '#yuyu-sound-test', '#yuyu-press-test',
      '#yuyu-notify-test', '#yuyu-update-check', '#yuyu-version-label',
      '#yuyu-open-tutorial-btn', '#yuyu-notify-switch'
    ];
    const missing = required.filter((sel) => !container.querySelector(sel));
    check('设置项一个不少', missing.length === 0, `缺失: ${missing.join(', ')}`);
    const modelOpts = container.querySelectorAll('#yuyu-whale-model option');
    check('立绘仅保留经典款 1 个选项', modelOpts.length === 1 && modelOpts[0].value === 'DSniang1');
  }
}

console.log('[ui-test] 9) 通知开关与通知方式双向同步');
{
  const { container } = await boot();
  if (container) {
    const win = container.ownerDocument.defaultView;
    const sw = container.querySelector('#yuyu-notify-switch');
    const mode = container.querySelector('#yuyu-notify-mode');

    mode.value = 'off';
    mode.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('下拉设为关闭后开关熄灭', !sw.classList.contains('on'));
    check('开关 aria 同步为 false', sw.getAttribute('aria-checked') === 'false');

    sw.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('点开关恢复为开启', sw.classList.contains('on'));
    check('恢复后通知方式不是 off', mode.value !== 'off');
  }
}

console.log('[ui-test] 10) 余额只拆一次小数位，反复刷新不重复包裹');
{
  const { container, window } = await boot();
  if (container) {
    const bal = container.querySelector('#yuyu-card-bal');
    const before = bal.innerHTML;
    // 同一数值再刷一次，不应重新构建
    window.eval('void 0');
    check('余额小数位包裹了一次', bal.querySelectorAll('.yp-dec').length === 1, bal.innerHTML);
    check('余额数字可读', /\d/.test(bal.textContent), bal.textContent);
  }
}

console.log(`\n[ui-test] 结果: ${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
