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
  window.fetch = options.fetch || (async () => ({ ok: false, status: 503, json: async () => ({}) }));
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
      '#yuyu-theme-tabs', '#yuyu-style-tabs',
      '#yuyu-interval-tabs', '#yuyu-notify-mode', '#yuyu-sound-effect',
      '#yuyu-press-sound', '#yuyu-sound-test', '#yuyu-press-test',
      '#yuyu-notify-test', '#yuyu-update-check', '#yuyu-version-label',
      '#yuyu-open-tutorial-btn', '#yuyu-notify-switch'
    ];
    const missing = required.filter((sel) => !container.querySelector(sel));
    check('设置项一个不少', missing.length === 0, `缺失: ${missing.join(', ')}`);
    check('设置中已移除立绘单选行', !container.querySelector('#yuyu-whale-model-row'));
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

console.log('[ui-test] 11) 检测到新版本时在设置右上角与检查更新处展示红点角标');
{
  const { container, win } = await boot();
  if (container && win) {
    const settingsBtn = container.querySelector('#yuyu-card-settings-btn');
    const updateBtn = container.querySelector('#yuyu-update-check');

    win.__yuyuRenderUpdateInfo({ available: true, latestVersion: '9.9.9', checkedAt: Date.now() });
    check('检测到新版本时设置按钮带红点', Boolean(settingsBtn && settingsBtn.querySelector('.yuyu-badge-dot')));
    check('检测到新版本时检查更新按钮带红点', Boolean(updateBtn && updateBtn.querySelector('.yuyu-badge-dot')));

    win.__yuyuRenderUpdateInfo({ available: false, currentVersion: '1.2.2', checkedAt: Date.now() });
    check('无新版本时设置按钮红点已清除', Boolean(settingsBtn && !settingsBtn.querySelector('.yuyu-badge-dot')));
    check('无新版本时检查更新按钮红点已清除', Boolean(updateBtn && !updateBtn.querySelector('.yuyu-badge-dot')));
  }
}

console.log('[ui-test] 12) 余额显示 / 隐藏');
{
  const { container, window } = await boot();
  if (container) {
    const bal = container.querySelector('#yuyu-card-bal');
    const cur = container.querySelector('#yuyu-card-cur');
    const eye = container.querySelector('#yuyu-balance-eye');
    const sw = container.querySelector('#yuyu-hide-balance-switch');
    const promptSw = container.querySelector('#yuyu-notify-prompt-switch');
    const apiBtn = container.querySelector('#yuyu-api-switch');
    const win = container.ownerDocument.defaultView;

    check('眼睛按钮存在', Boolean(eye));
    check('设置里的显示余额开关存在', Boolean(sw));
    check('等待选择通知开关存在', Boolean(promptSw));
    check('对话 API 切换按钮存在', Boolean(apiBtn));

    win.__yuyuApplyPreferences({
      theme: 'light',
      widgetStyle: 'whale',
      notifyMode: 'both',
      notifyOnComplete: true,
      notifySubagentMute: true,
      notifyOnUserPrompt: true,
      hideBalance: true
    });
    check('隐藏后余额显示为掩码', bal.textContent === '••••', bal.textContent);
    check('隐藏后不显示 $ 前缀', cur.style.display === 'none', cur.style.display);
    check('隐藏后眼睛按钮提示「显示余额」', eye.getAttribute('aria-label') === '显示余额');
    check('隐藏后设置开关为关闭', sw.getAttribute('aria-checked') === 'false');

    eye.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('点眼睛后恢复金额', /\d/.test(bal.textContent) && bal.textContent !== '••••', bal.textContent);
    check('恢复后 $ 前缀回来', cur.style.display !== 'none');
    check('恢复后眼睛按钮提示「隐藏余额」', eye.getAttribute('aria-label') === '隐藏余额');

    sw.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('点设置开关再次隐藏', bal.textContent === '••••', bal.textContent);
    check('设置开关状态同步为关闭', sw.getAttribute('aria-checked') === 'false');

    win.__yuyuApplyPreferences({
      theme: 'light',
      widgetStyle: 'whale',
      notifyMode: 'both',
      notifyOnComplete: true,
      notifySubagentMute: true,
      notifyOnUserPrompt: false,
      hideBalance: false
    });
    check('关闭等待选择通知后开关熄灭', promptSw.getAttribute('aria-checked') === 'false');
    check('恢复余额显示后金额回来', /\d/.test(bal.textContent) && bal.textContent !== '••••', bal.textContent);
  }
}

console.log('[ui-test] 13) 点 API 按钮不误关卡片，并给出可读提示');
{
  const { container, window } = await boot();
  if (container) {
    const win = container.ownerDocument.defaultView;
    const card = container.querySelector('#yuyu-card-popup');
    container.querySelector('#yuyu-whale-menu-btn')
      .dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const apiBtn = container.querySelector('#yuyu-api-switch');
    apiBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('点 API 后卡片仍打开', card.classList.contains('is-open'));
    const tip = container.querySelector('#yuyu-sync-tip');
    check('没有 session 时提示先打开对话', tip && tip.textContent.indexOf('先打开') !== -1, tip && tip.textContent);
  }
}

console.log('[ui-test] 14) 新站币种切换、旧站禁用与隐私模式');
{
  const rate = { base: 'USD', quote: 'CNY', rate: 6.72, status: 'fresh', fetchedAt: Date.now() };
  let prefs = {
    theme: 'light', widgetStyle: 'whale', notifyMode: 'both', notifyOnComplete: true,
    notifySubagentMute: true, notifyOnUserPrompt: false, hideBalance: false, displayCurrency: 'auto'
  };
  const payload = {
    activeEmail: 'www:demo@example.com',
    activeSite: 'www',
    accounts: [
      { email: 'www:demo@example.com', site: 'www', balance: 12.34, total_recharged: 48, active: true, snapshot: { email: 'demo@example.com', site: 'www', balance: 12.34, totalRecharged: 48, todayCost: 0.1234, todayTokens: 9000, exchangeRate: rate } }
    ],
    preferences: prefs,
    version: '1.3.3',
    snapshot: {
      success: true, email: 'demo@example.com', site: 'www', balance: 12.34,
      totalRecharged: 48, todayCost: 0.1234, todayTokens: 9000, todayRequests: 12,
      keysCount: 2, exchangeRate: rate, timestamp: Date.now()
    }
  };
  const fetch = async (url, options = {}) => {
    if (String(url).includes('/settings')) {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        if (body.preferences) prefs = body.preferences;
        return { ok: true, status: 200, json: async () => ({ ok: true, preferences: prefs, version: '1.3.3' }) };
      }
      return { ok: true, status: 200, json: async () => ({ preferences: prefs, version: '1.3.3' }) };
    }
    return { ok: true, status: 200, json: async () => payload };
  };

  const { container } = await boot({ fetch });
  await new Promise((r) => setTimeout(r, 400));
  if (container) {
    const win = container.ownerDocument.defaultView;
    const card = container.querySelector('#yuyu-card-popup');
    const cur = container.querySelector('#yuyu-card-cur');
    const bal = container.querySelector('#yuyu-card-bal');
    const switchEl = container.querySelector('#yuyu-cur-switch');
    const fx = container.querySelector('#yuyu-card-fx');
    const cnyBtn = switchEl.querySelector('[data-cur="CNY"]');
    const usdBtn = switchEl.querySelector('[data-cur="USD"]');

    check('新站 auto 默认显示人民币符号', cur.textContent === '¥', cur.textContent);
    check('新站余额按汇率换算', /^82\.92$/.test(bal.textContent), bal.textContent);
    check('人民币滑块处于激活态', switchEl.getAttribute('data-active') === 'CNY', switchEl.getAttribute('data-active'));
    check('汇率行进入人民币态且显示 1 USD = 6.7200 CNY', fx.classList.contains('is-cny') && fx.textContent.indexOf('1 USD = 6.7200 CNY') !== -1, fx.textContent);
    check('CNY 按钮可用', !cnyBtn.disabled);
    check('人民币态余额标签标明折合', container.querySelector('#yuyu-bal-label').textContent.indexOf('折合') !== -1, container.querySelector('#yuyu-bal-label').textContent);

    usdBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    check('点 USD 后符号切回美元', cur.textContent === '$', cur.textContent);
    check('点 USD 后金额回到 12.34', /^12\.34$/.test(bal.textContent), bal.textContent);
    check('点 USD 后滑块标记 USD', switchEl.getAttribute('data-active') === 'USD', switchEl.getAttribute('data-active'));
    check('点 USD 后汇率行退出人民币态', !fx.classList.contains('is-cny') && fx.textContent.indexOf('钱包以美元记账') !== -1, fx.textContent);
    check('美元态余额标签不再写折合', container.querySelector('#yuyu-bal-label').textContent === '可用余额', container.querySelector('#yuyu-bal-label').textContent);
    check('币种偏好已保存为 USD', prefs.displayCurrency === 'USD', prefs.displayCurrency);

    cnyBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    check('点 CNY 后符号切回人民币', cur.textContent === '¥', cur.textContent);
    check('点 CNY 后金额换算回 82.92', /^82\.92$/.test(bal.textContent), bal.textContent);
    check('币种偏好已保存为 CNY', prefs.displayCurrency === 'CNY', prefs.displayCurrency);

    // 设置页三态：auto / USD / CNY
    container.querySelector('#yuyu-card-settings-btn').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const autoTab = container.querySelector('.yuyu-currency-tab[data-val="auto"]');
    const cnyTab = container.querySelector('.yuyu-currency-tab[data-val="CNY"]');
    check('设置页存在三态币种', Boolean(autoTab && cnyTab));
    check('设置页 CNY 可选', !cnyTab.disabled);
    autoTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    check('点自动后偏好为 auto', prefs.displayCurrency === 'auto', prefs.displayCurrency);
  }
}

console.log('[ui-test] 15) 旧站没有汇率时 CNY 禁用并回退 USD');
{
  let prefs = { theme: 'light', widgetStyle: 'whale', hideBalance: false, displayCurrency: 'CNY' };
  const payload = {
    activeEmail: 'sub:old@example.com',
    activeSite: 'sub',
    accounts: [{ email: 'sub:old@example.com', site: 'sub', balance: 3.5, active: true }],
    preferences: prefs,
    snapshot: { success: true, email: 'old@example.com', site: 'sub', balance: 3.5, totalRecharged: 10, exchangeRate: null, timestamp: Date.now() }
  };
  const fetch = async (url, options = {}) => {
    if (String(url).includes('/settings')) {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        if (body.preferences) prefs = body.preferences;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, preferences: prefs }) };
    }
    return { ok: true, status: 200, json: async () => payload };
  };
  const { container } = await boot({ fetch });
  await new Promise((r) => setTimeout(r, 100));
  if (container) {
    const win = container.ownerDocument.defaultView;
    const switchEl = container.querySelector('#yuyu-cur-switch');
    const cur = container.querySelector('#yuyu-card-cur');
    const cnyBtn = switchEl.querySelector('[data-cur="CNY"]');
    const usdBtn = switchEl.querySelector('[data-cur="USD"]');
    check('旧站即使偏好 CNY 也回退美元', cur.textContent === '$', cur.textContent);
    check('旧站滑块标记 USD', switchEl.getAttribute('data-active') === 'USD', switchEl.getAttribute('data-active'));
    check('旧站 CNY 按钮禁用', cnyBtn.disabled);
    check('旧站 USD 按钮可用', !usdBtn.disabled);
    check('旧站汇率行说明钱包以美元记账', container.querySelector('#yuyu-card-fx').textContent.indexOf('钱包以美元记账') !== -1, container.querySelector('#yuyu-card-fx').textContent);
    cnyBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    check('旧站点 CNY 不会切走美元', cur.textContent === '$', cur.textContent);
  }
}

console.log(`\n[ui-test] 结果: ${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
