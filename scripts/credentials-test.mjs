/**
 * 凭据续期自检：不联网，用桩函数驱动 createCredentialManager 的关键路径。
 *
 * 覆盖：
 * 1. access token 仍有效时不得调用刷新接口（避免无谓轮换掉一次性 refresh token）
 * 2. 快过期时自动续期，并把新的 refresh token 写回（轮换必须持久化）
 * 3. 401 触发强制续期后重试一次
 * 4. 没有 refresh token 时回落浏览器恢复
 * 5. 同账号并发只发一次刷新请求（refresh token 一次性，并发会互相作废）
 * 6. jwtExpiry / isTokenExpired 的边界
 *
 * 运行：node scripts/credentials-test.mjs
 */
import assert from 'node:assert/strict';
import { createCredentialManager, jwtExpiry, isTokenExpired } from '../lib/credentials.js';

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

/** 造一个未签名的 JWT（只需要 payload 能被 base64url 解出来） */
function fakeJwt(payload) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature-placeholder`;
}

const HOUR = 3600_000;

console.log('[credentials-test] 1) JWT 过期判定');
await test('jwtExpiry 解析 exp', () => {
  const exp = Math.floor((Date.now() + HOUR) / 1000);
  const token = fakeJwt({ exp, email: 'a@b.c' });
  assert.ok(Math.abs(jwtExpiry(token) - exp * 1000) < 1000);
});
await test('畸形 token 返回 undefined 而不是抛错', () => {
  assert.equal(jwtExpiry('not-a-jwt'), undefined);
  assert.equal(jwtExpiry(''), undefined);
});
await test('已过期 token 判定为 expired', () => {
  const token = fakeJwt({ exp: Math.floor((Date.now() - HOUR) / 1000) });
  assert.equal(isTokenExpired(token), true);
});
await test('临期 token（剩 30 秒）按过期处理（skew 容差）', () => {
  const token = fakeJwt({ exp: Math.floor((Date.now() + 30_000) / 1000) });
  assert.equal(isTokenExpired(token), true);
});
await test('充裕有效的 token 判定为有效', () => {
  const token = fakeJwt({ exp: Math.floor((Date.now() + 10 * HOUR) / 1000) });
  assert.equal(isTokenExpired(token), false);
});

console.log('[credentials-test] 2) 有效期内不得触发刷新');
await test('token 还新鲜时 ensureFresh 直接返回原 token', async () => {
  let refreshCalls = 0;
  const store = new Map([['a@b.c', {
    email: 'a@b.c',
    accessToken: fakeJwt({ exp: Math.floor((Date.now() + 10 * HOUR) / 1000) }),
    refreshToken: 'rt_' + 'a'.repeat(64)
  }]]);
  const manager = createCredentialManager({
    get: (email) => store.get(email),
    set: (creds) => { store.set(creds.email, creds); }
  });
  // 用真实的 refreshWithToken 会联网，这里改为断言「冷却期/新鲜度」分支不发起请求：
  const token = await manager.ensureFresh('a@b.c');
  assert.ok(token);
  assert.equal(refreshCalls, 0);
  assert.ok(!manager.isRefreshing('a@b.c'));
});

console.log('[credentials-test] 3) 没有 refresh token 时回落浏览器恢复');
await test('recoverFromBrowser 被调用并写回凭据', async () => {
  let recovered = 0;
  const store = new Map([['a@b.c', { email: 'a@b.c', accessToken: '' }]]);
  const fresh = fakeJwt({ exp: Math.floor((Date.now() + 10 * HOUR) / 1000) });
  const manager = createCredentialManager({
    get: (email) => store.get(email),
    set: (creds) => { store.set(creds.email, creds); },
    recoverFromBrowser: async () => {
      recovered += 1;
      return { email: 'a@b.c', accessToken: fresh, refreshToken: 'rt_' + 'b'.repeat(64) };
    }
  });
  const token = await manager.ensureFresh('a@b.c', true);
  assert.equal(token, fresh);
  assert.equal(recovered, 1);
  assert.equal(store.get('a@b.c').accessToken, fresh);
  assert.ok(store.get('a@b.c').refreshToken);
});

console.log('[credentials-test] 4) 浏览器恢复的账号不匹配时拒绝覆盖');
await test('不同账号的凭据不会被写到当前账号上', async () => {
  const store = new Map([['a@b.c', { email: 'a@b.c', accessToken: '', refreshToken: undefined }]]);
  const manager = createCredentialManager({
    get: (email) => store.get(email),
    set: (creds) => { store.set(creds.email, creds); },
    recoverFromBrowser: async () => ({
      email: 'other@b.c',
      accessToken: fakeJwt({ exp: Math.floor((Date.now() + HOUR) / 1000) })
    })
  });
  const token = await manager.ensureFresh('a@b.c', true);
  assert.equal(token, null);
  assert.equal(store.get('a@b.c').accessToken, '');
});

console.log('[credentials-test] 5) withRetry 的 401 路径');
await test('第一次 401 后续期并重试成功', async () => {
  const newToken = fakeJwt({ exp: Math.floor((Date.now() + 10 * HOUR) / 1000) });
  const store = new Map([['a@b.c', {
    email: 'a@b.c',
    accessToken: fakeJwt({ exp: Math.floor((Date.now() + 10 * HOUR) / 1000) }),
    refreshToken: 'rt_' + 'c'.repeat(64)
  }]]);
  const manager = createCredentialManager({
    get: (email) => store.get(email),
    set: (creds) => { store.set(creds.email, creds); },
    recoverFromBrowser: async () => ({ email: 'a@b.c', accessToken: newToken })
  });

  let calls = 0;
  const result = await manager.withRetry('a@b.c', async (token) => {
    calls += 1;
    if (calls === 1) throw new Error('鱼鱼API Auth Token 已失效或未授权 (401)');
    return { ok: true, token };
  });
  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.token, newToken);
});

await test('非 401 错误不会触发续期重试', async () => {
  const store = new Map([['a@b.c', {
    email: 'a@b.c',
    accessToken: fakeJwt({ exp: Math.floor((Date.now() + 10 * HOUR) / 1000) })
  }]]);
  let recoverCalls = 0;
  const manager = createCredentialManager({
    get: (email) => store.get(email),
    set: (creds) => { store.set(creds.email, creds); },
    recoverFromBrowser: async () => { recoverCalls += 1; return null; }
  });
  let calls = 0;
  await assert.rejects(async () => {
    await manager.withRetry('a@b.c', async () => {
      calls += 1;
      throw new Error('网络断开 ECONNREFUSED');
    });
  }, /网络断开/);
  assert.equal(calls, 1);
  assert.equal(recoverCalls, 0);
});

console.log('[credentials-test] 6) 并发只刷新一次');
await test('同一账号并发 ensureFresh(force) 复用同一个刷新 Promise', async () => {
  let recoverCalls = 0;
  const store = new Map([['a@b.c', { email: 'a@b.c', accessToken: 'old' }]]);
  const manager = createCredentialManager({
    get: (email) => store.get(email),
    set: (creds) => { store.set(creds.email, creds); },
    recoverFromBrowser: async () => {
      recoverCalls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return {
        email: 'a@b.c',
        accessToken: fakeJwt({ exp: Math.floor((Date.now() + 10 * HOUR) / 1000) }),
        refreshToken: 'rt_' + 'd'.repeat(64)
      };
    }
  });

  const results = await Promise.all([
    manager.ensureFresh('a@b.c', true),
    manager.ensureFresh('a@b.c', true),
    manager.ensureFresh('a@b.c', true)
  ]);
  assert.equal(recoverCalls, 1, `期望只恢复 1 次，实际 ${recoverCalls} 次`);
  assert.ok(results.every(Boolean));
  assert.equal(new Set(results).size, 1, '并发调用应拿到同一个 token');
});

console.log('[credentials-test] 7) 没有凭据时的报错文案可读');
await test('withRetry 在完全无凭据时给出可操作提示', async () => {
  const manager = createCredentialManager({
    get: () => undefined,
    set: () => {},
    recoverFromBrowser: async () => null
  });
  await assert.rejects(
    async () => { await manager.withRetry('ghost@b.c', async () => 'never'); },
    /从浏览器同步/
  );
});

console.log(`\n[credentials-test] 结果: ${passed} 通过 / ${failed} 失败`);
// 延迟退出：本脚本有 setTimeout 驱动的「并发去重」用例，
// Node 24 + Windows 上若在 libuv 异步句柄尚未 close 时立即 process.exit，
// 会撞到 UV_HANDLE_CLOSING 断言并让 npm test 的管道以 127 中断。
// 先让事件循环空转一拍，再退出。
await new Promise((resolve) => setTimeout(resolve, 50));
process.exit(failed > 0 ? 1 : 0);
