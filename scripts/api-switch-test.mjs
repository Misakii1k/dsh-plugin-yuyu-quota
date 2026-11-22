/**
 * 对话 API 一键切换的前端单元自检。
 *
 * 目的：确认插件没有自建第二套供应商配置，而是直接读 DSH 自带模型目录、
 * 调用 DSH 自带 session.selectModel；并验证旧站/新站不会互相误选。
 *
 * 运行：node scripts/api-switch-test.mjs
 * 依赖：jsdom（未安装时自动跳过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('[api-switch-test] 未安装 jsdom，跳过');
  process.exit(0);
}

const clientSrc = fs.readFileSync(path.join(root, 'src', 'client.js'), 'utf8');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:60913/',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});
const { window } = dom;
window.matchMedia = window.matchMedia || function () {
  return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
};
window.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
window.HTMLMediaElement.prototype.pause = function () {};

let loaded = null;
window.__ModuleLoader__ = {
  load(module) {
    loaded = module;
  }
};
window.eval(clientSrc);

if (!loaded || typeof loaded.factory !== 'function') {
  console.error('[api-switch-test] 未捕获到插件模块');
  process.exit(1);
}

const plugin = loaded.factory(function (name) {
  if (name === 'react') {
    return {
      createElement() { return null; },
      useEffect() {},
      useState(value) { return [value, function () {}]; }
    };
  }
  return {};
});
const api = plugin.__dshApiTest;

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

function model(id, options = {}) {
  return {
    id,
    name: options.name || id,
    reasoning: options.reasoning
  };
}

const catalog = {
  default: { provider: 'fish', model: 'deepseek-v4.1-flash', reasoningEffort: 'max' },
  groups: [
    {
      id: 'fish',
      name: '鱼鱼',
      models: [model('deepseek-v4.1-flash', {
        reasoning: { efforts: [{ id: 'high' }, { id: 'max' }], defaultEffort: 'high' }
      })]
    },
    {
      id: 'yuyu',
      name: '鱼鱼new',
      models: [model('deepseek-v4.1-flash', {
        reasoning: { efforts: [{ id: 'high' }, { id: 'max' }], defaultEffort: 'low' }
      })]
    }
  ]
};

console.log('[api-switch-test] 1) 站点 -> DSH 供应商');
check('旧站命中 fish', api.providerGroupForSite(catalog, 'sub').id === 'fish');
check('新站命中 yuyu', api.providerGroupForSite(catalog, 'www').id === 'yuyu');
check(
  '只存在旧站供应商时新站不会误切',
  api.providerGroupForSite({ groups: [catalog.groups[0]] }, 'www') === null
);
check(
  '自定义 provider 名称按「旧/新」兜底',
  api.providerGroupForSite({
    groups: [
      { id: 'custom-old', name: '旧站', models: [model('m1')] },
      { id: 'custom-new', name: '新站', models: [model('m2')] }
    ]
  }, 'www').id === 'custom-new'
);

console.log('[api-switch-test] 2) 推理强度保留');
check(
  '目标模型支持时保留 DSH 当前 max',
  api.pickDshReasoningEffort(catalog.groups[1].models[0], catalog) === 'max'
);
check(
  '目标模型不支持 max 时退回模型默认值',
  api.pickDshReasoningEffort({
    id: 'x',
    reasoning: { efforts: [{ id: 'high' }], defaultEffort: 'high' }
  }, catalog) === 'high'
);
check('模型没有推理档位时不传强度', api.pickDshReasoningEffort({ id: 'x' }, catalog) === undefined);

console.log('[api-switch-test] 3) 切到新站');
{
  let called = null;
  api.setContext({
    remote: {
      session: {
        async modelCatalog() { return catalog; },
        async selectModel(selection) {
          called = selection;
          return { selected: selection };
        }
      }
    }
  });
  api.setSite('www');
  window.__yuyuCurrentSessionId = 'session-new';
  api.switchToCurrentSite();

  await new Promise((resolve) => setTimeout(resolve, 30));
  check('调用了 DSH 自带 selectModel', Boolean(called));
  check('供应商为新站 yuyu', called && called.provider === 'yuyu');
  check('沿用当前模型 id', called && called.model === 'deepseek-v4.1-flash');
  check('保留 max 推理强度', called && called.reasoningEffort === 'max');
  check('sessionId 来自当前对话', called && called.sessionId === 'session-new');
}

console.log('[api-switch-test] 4) 目标供应商不存在时不落任何切换');
{
  let called = null;
  api.setContext({
    remote: {
      session: {
        async modelCatalog() {
          return { default: { model: 'deepseek-v4.1-flash' }, groups: [catalog.groups[0]] };
        },
        async selectModel(selection) {
          called = selection;
          return { selected: selection };
        }
      }
    }
  });
  api.setSite('www');
  window.__yuyuCurrentSessionId = 'session-fail';
  api.switchToCurrentSite();

  await new Promise((resolve) => setTimeout(resolve, 30));
  check('找不到新站供应商时没有调用 selectModel', called === null);
}

console.log(`\n[api-switch-test] 结果: ${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
