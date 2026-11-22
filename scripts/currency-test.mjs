/**
 * 人民币展示口径自检。
 *
 * 不访问真实鱼鱼 API：用合成的 USD 余额、CNY 汇率和旧站 404 行为，验证：
 * 1. 币种纯函数（auto/USD/CNY、旧站回退、无汇率回退、格式化）
 * 2. 新站快照会带上汇率，并生成人民币参考文本
 * 3. 旧站不发 /currency/rates 请求，也不显示人民币错误
 * 4. 汇率接口失败不连累余额快照
 * 5. 汇率短期缓存与 force 刷新
 * 6. stale 汇率仍可用，但状态要保留
 *
 * 运行：node scripts/currency-test.mjs
 */
import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err?.message || err}`);
  }
}

const {
  DISPLAY_CURRENCIES,
  isDisplayCurrency,
  usableCurrencyRate,
  resolveDisplayCurrency,
  currencySymbol,
  convertUsdAmount,
  formatGroupedNumber,
  formatDisplayAmount
} = await import('../lib/currency.js');
const { YuyuApiClient } = await import('../lib/api.js');

const RATE = {
  base: 'USD',
  quote: 'CNY',
  rate: 6.72,
  quoteId: '2212/2213',
  source: 'coinkiki',
  rateKind: 'okc_c2c_buy_5000',
  status: 'fresh',
  fetchedAt: Date.now(),
  validUntil: Date.now() + 5 * 60_000
};

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    json: async () => ({ code: 0, data }),
    text: async () => JSON.stringify({ code: 0, data })
  };
}

function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    return handler(String(url), options);
  };
  return calls;
}

console.log('[currency-test] 1) 币种纯函数');
await test('DISPLAY_CURRENCIES 只允许 auto / USD / CNY', () => {
  assert.deepEqual(DISPLAY_CURRENCIES, ['auto', 'USD', 'CNY']);
  assert.equal(isDisplayCurrency('auto'), true);
  assert.equal(isDisplayCurrency('CNY'), true);
  assert.equal(isDisplayCurrency('JPY'), false);
});

await test('auto 在新站 + 可用汇率时用 CNY，旧站回退 USD', () => {
  assert.equal(resolveDisplayCurrency('auto', 'www', RATE), 'CNY');
  assert.equal(resolveDisplayCurrency('auto', 'sub', RATE), 'USD');
  assert.equal(resolveDisplayCurrency('auto', 'www', null), 'USD');
  assert.equal(resolveDisplayCurrency('CNY', 'sub', RATE), 'USD');
  assert.equal(resolveDisplayCurrency('USD', 'www', RATE), 'USD');
});

await test('汇率必须为正数才可用；stale 仍可用', () => {
  assert.equal(usableCurrencyRate(null), null);
  assert.equal(usableCurrencyRate({ ...RATE, rate: 0 }), null);
  assert.equal(usableCurrencyRate({ ...RATE, rate: -1 }), null);
  assert.equal(usableCurrencyRate({ ...RATE, status: 'stale' }).status, 'stale');
});

await test('换算与千分位格式正确，不出现 locale 差异', () => {
  assert.equal(currencySymbol('USD'), '$');
  assert.equal(currencySymbol('CNY'), '¥');
  assert.equal(convertUsdAmount(12.34, 'CNY', null), 12.34);
  assert.equal(Number(convertUsdAmount(12.34, 'CNY', RATE).toFixed(4)), 82.9248);
  assert.equal(formatGroupedNumber(1234567.891, 2), '1,234,567.89');
  assert.equal(formatGroupedNumber(-12.3, 2), '-12.30');
  assert.equal(formatDisplayAmount(12.34, { currency: 'CNY', rate: RATE }), '¥82.92');
  assert.equal(formatDisplayAmount(12.34, { currency: 'USD', prefix: '约 ' }), '约 $12.34');
});

console.log('[currency-test] 2) 新站快照带汇率');
await test('新站请求 /currency/rates 并写入 exchangeRate', async () => {
  const calls = installFetch((url) => {
    if (url.includes('/user/profile')) {
      return jsonResponse({
        email: 'demo@example.com',
        balance: 12.34,
        frozen_balance: 0,
        total_recharged: 48,
        updated_at: '2026-11-22T00:00:00Z'
      });
    }
    if (url.includes('/usage/dashboard/stats')) {
      return jsonResponse({
        today_cost: 0.2,
        today_actual_cost: 0.1234,
        today_tokens: 9000,
        today_requests: 12,
        total_requests: 345,
        total_actual_cost: 1.5,
        active_api_keys: 2
      });
    }
    if (url.includes('/keys')) return jsonResponse({ items: [], total: 0 });
    if (url.includes('/currency/rates')) {
      return jsonResponse({
        default_display_currency: 'CNY',
        supported_currencies: ['CNY', 'USD'],
        ...RATE
      });
    }
    return jsonResponse({}, 404);
  });

  const client = new YuyuApiClient('test-token', 'https://www.anzhiyu.com', 'www');
  const snap = await client.getBalanceSnapshot();

  assert.equal(snap.success, true);
  assert.equal(snap.site, 'www');
  assert.equal(snap.balance, 12.34);
  assert.equal(snap.exchangeRate.rate, 6.72);
  assert.equal(snap.exchangeRate.base, 'USD');
  assert.equal(snap.exchangeRate.quote, 'CNY');
  assert.equal(snap.exchangeRate.status, 'fresh');
  assert.match(snap.formattedText, /人民币参考/);
  assert.match(snap.formattedText, /¥82\.92/);
  assert.equal(snap.currencyError, undefined);
  assert.deepEqual(
    calls.map((u) => new URL(u).pathname).sort(),
    ['/api/v1/currency/rates', '/api/v1/keys', '/api/v1/usage/dashboard/stats', '/api/v1/user/profile']
  );
});

await test('stale 汇率仍用于展示，但保留 stale 状态', async () => {
  installFetch((url) => {
    if (url.includes('/currency/rates')) return jsonResponse({ ...RATE, status: 'stale' });
    if (url.includes('/user/profile')) return jsonResponse({ email: 'demo@example.com', balance: 1 });
    if (url.includes('/usage/dashboard/stats')) return jsonResponse({});
    if (url.includes('/keys')) return jsonResponse({ items: [], total: 0 });
    return jsonResponse({}, 404);
  });
  const client = new YuyuApiClient('test-token', 'https://www.anzhiyu.com', 'www');
  const snap = await client.getBalanceSnapshot();
  assert.equal(snap.exchangeRate.status, 'stale');
  assert.match(snap.formattedText, /汇率略旧/);
});

console.log('[currency-test] 3) 旧站不请求汇率');
await test('旧站快照 exchangeRate 为 null 且不发 /currency/rates', async () => {
  const calls = installFetch((url) => {
    if (url.includes('/currency/rates')) return jsonResponse({}, 404);
    if (url.includes('/user/profile')) return jsonResponse({ email: 'sub@example.com', balance: 3 });
    if (url.includes('/usage/dashboard/stats')) return jsonResponse({});
    if (url.includes('/keys')) return jsonResponse({ items: [], total: 0 });
    return jsonResponse({}, 404);
  });
  const client = new YuyuApiClient('test-token', 'https://sub.anzhiyu.com', 'sub');
  const snap = await client.getBalanceSnapshot();
  assert.equal(snap.site, 'sub');
  assert.equal(snap.exchangeRate, null);
  assert.equal(snap.currencyError, undefined);
  assert.ok(!calls.some((u) => u.includes('/currency/rates')), '旧站不应请求不存在的汇率接口');
  assert.ok(!snap.formattedText.includes('人民币参考'));
});

console.log('[currency-test] 4) 汇率失败不连累余额');
await test('汇率 500 时快照仍成功，并给出人民币暂不可用提示', async () => {
  installFetch((url) => {
    if (url.includes('/currency/rates')) return jsonResponse({ message: 'boom' }, 500);
    if (url.includes('/user/profile')) return jsonResponse({ email: 'demo@example.com', balance: 5 });
    if (url.includes('/usage/dashboard/stats')) return jsonResponse({});
    if (url.includes('/keys')) return jsonResponse({ items: [], total: 0 });
    return jsonResponse({}, 404);
  });
  const client = new YuyuApiClient('test-token', 'https://www.anzhiyu.com', 'www');
  const snap = await client.getBalanceSnapshot();
  assert.equal(snap.success, true);
  assert.equal(snap.exchangeRate, null);
  assert.match(snap.currencyError, /人民币汇率暂时不可用/);
  assert.match(snap.formattedText, /人民币参考: 人民币汇率暂时不可用/);
});

console.log('[currency-test] 5) 汇率缓存');
await test('60 秒内复用缓存，force 刷新会再请求一次', async () => {
  const calls = installFetch((url) => {
    if (url.includes('/currency/rates')) return jsonResponse(RATE);
    return jsonResponse({}, 404);
  });
  const client = new YuyuApiClient('test-token', 'https://www.anzhiyu.com', 'www');
  const first = await client.getCurrencyRate();
  const second = await client.getCurrencyRate();
  assert.equal(first.rate, 6.72);
  assert.equal(second.rate, 6.72);
  assert.equal(calls.filter((u) => u.includes('/currency/rates')).length, 1, '60 秒内应复用缓存');
  await client.getCurrencyRate(true);
  assert.equal(calls.filter((u) => u.includes('/currency/rates')).length, 2, 'force 应跳过缓存');
});

console.log(`\n[currency-test] 结果: ${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exitCode = 1;
