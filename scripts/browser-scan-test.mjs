/**
 * 浏览器凭据扫描自检（不碰真实浏览器数据）。
 *
 * 在临时目录里伪造 Chrome 与 Edge 的目录结构（含 Edge Beta / WebView2 / Profile 2），
 * 写入合成的 LevelDB 风格文件，验证：
 * 1. Edge 的 Default profile 能被读到（历史 bug：只认 Chrome 或路径拼错就整段失效）
 * 2. Edge Beta / WebView2 等非标准布局也能读到
 * 3. 多 profile 都扫（Default + Profile 2）
 * 4. 过期 token 被过滤，同一账号取 iat 最新的一条
 * 5. refresh token 被一并提取并挂到账号上
 * 6. 没有任何浏览器数据时给出可读的诊断信息
 *
 * 运行：node scripts/browser-scan-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** 造一个形如鱼鱼API 签发的 access token（签名段必须够长，否则不匹配 JWT 正则） */
function fakeAccessToken({ email, iat, exp }) {
  const signature = Buffer.from(`sig-${email}-${iat}`).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    user_id: 1,
    email,
    role: 'user',
    token_version: 123,
    exp,
    iat
  })}.${signature}`;
}

const now = Math.floor(Date.now() / 1000);
const HOUR = 3600;

/**
 * 在给定的 leveldb 目录里写一个「像 leveldb 的」文件。
 * 真实文件是二进制前缀 + 明文值，这里只要保证值以明文出现即可被扫到。
 */
function writeLevelDb(dir, fileName, payloads) {
  fs.mkdirSync(dir, { recursive: true });
  const chunks = [];
  for (const { key, value, site } of payloads) {
    chunks.push(Buffer.from([0x00, 0x01]));
    // 真实 leveldb 记录以 `_https://<host>` 标记 origin；站点归属就靠它判定
    chunks.push(Buffer.from(`_https://${site || 'sub'}.anzhiyu.com`));
    chunks.push(Buffer.from([0x00, 0x01]));
    chunks.push(Buffer.from(key));
    chunks.push(Buffer.from([0x00, 0x01]));
    chunks.push(Buffer.from(value));
  }
  fs.writeFileSync(path.join(dir, fileName), Buffer.concat(chunks));
}

/** Firefox 的 localStorage 存在 storage/<default|permanent>/<origin>/ls/data.sqlite */
function writeFirefoxData(profileDir, origin, { token, refreshToken }) {
  const dir = path.join(profileDir, 'storage', 'default', origin, 'ls');
  fs.mkdirSync(dir, { recursive: true });
  const parts = [];
  if (token) parts.push(Buffer.from(token));
  if (refreshToken) parts.push(Buffer.from(refreshToken));
  fs.writeFileSync(path.join(dir, 'data.sqlite'), Buffer.concat(parts));
}

/**
 * 因为 browser-sync 的候选路径依赖环境变量，测试里通过改写
 * LOCALAPPDATA / APPDATA 再动态 import 来隔离。
 */
async function withFakeBrowsers(setup, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yuyu-scan-'));
  const local = path.join(root, 'Local');
  const roaming = path.join(root, 'Roaming');
  fs.mkdirSync(local, { recursive: true });
  fs.mkdirSync(roaming, { recursive: true });

  const prevLocal = process.env.LOCALAPPDATA;
  const prevRoaming = process.env.APPDATA;
  process.env.LOCALAPPDATA = local;
  process.env.APPDATA = roaming;

  setup({ local, roaming, root });

  try {
    // 每次都用带 cache-busting 的 query 重新加载模块，避免模块级路径被缓存
    const mod = await import(`../lib/browser-sync.js?case=${Date.now()}-${Math.random()}`);
    return await fn(mod);
  } finally {
    if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = prevLocal;
    if (prevRoaming === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = prevRoaming;
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
}

console.log('[browser-scan-test] 1) Edge Default profile 能被读到');
await test('Edge 的 token 被扫描出来', async () => {
  const token = fakeAccessToken({ email: 'edge@example.com', iat: now, exp: now + 24 * HOUR });
  await withFakeBrowsers(
    ({ local }) => {
      const edge = path.join(local, 'Microsoft/Edge/User Data/Default/Local Storage/leveldb');
      writeLevelDb(edge, '000001.log', [{ key: 'auth_token', value: token }]);
    },
    async (mod) => {
      const { latest, all } = mod.scanLocalLevelDBTokens();
      assert.ok(latest, '应当扫到 Edge 的 token');
      assert.equal(latest.email, 'edge@example.com');
      assert.equal(latest.browser, 'Microsoft Edge');
      assert.equal(all.length, 1);
    }
  );
});

console.log('[browser-scan-test] 2) Edge Beta / WebView2 等非标准布局');
await test('Edge Beta 目录被识别', async () => {
  const token = fakeAccessToken({ email: 'beta@example.com', iat: now, exp: now + 24 * HOUR });
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Microsoft/Edge Beta/User Data/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.ldb', [{ key: 'auth_token', value: token }]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 1);
      assert.equal(all[0].browser, 'Microsoft Edge Beta');
    }
  );
});

await test('Edge WebView2 的 EBWebView 嵌套布局被识别', async () => {
  const token = fakeAccessToken({ email: 'wv@example.com', iat: now, exp: now + 24 * HOUR });
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Microsoft/EdgeWebView/User Data/EBWebView/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.ldb', [{ key: 'auth_token', value: token }]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 1, 'WebView2 里的 token 也要能读到');
      assert.equal(all[0].email, 'wv@example.com');
    }
  );
});

await test('Yandex / 360 / Opera / QQ 等 Chromium 发行版路径被识别', async () => {
  const yandex = fakeAccessToken({ email: 'yandex@example.com', iat: now, exp: now + 24 * HOUR });
  const q360 = fakeAccessToken({ email: '360@example.com', iat: now, exp: now + 24 * HOUR });
  const opera = fakeAccessToken({ email: 'opera@example.com', iat: now, exp: now + 24 * HOUR });
  const qq = fakeAccessToken({ email: 'qq@example.com', iat: now, exp: now + 24 * HOUR });
  await withFakeBrowsers(
    ({ local, roaming }) => {
      writeLevelDb(path.join(local, 'Yandex/YandexBrowser/User Data/Default/Local Storage/leveldb'), '000001.log', [{ key: 'auth_token', value: yandex }]);
      writeLevelDb(path.join(local, '360ChromeX/Chrome/User Data/Default/Local Storage/leveldb'), '000001.log', [{ key: 'auth_token', value: q360 }]);
      writeLevelDb(path.join(roaming, 'Opera Software/Opera Stable/Default/Local Storage/leveldb'), '000001.log', [{ key: 'auth_token', value: opera }]);
      writeLevelDb(path.join(roaming, 'Tencent/QQBrowser/User Data/Default/Local Storage/leveldb'), '000001.log', [{ key: 'auth_token', value: qq }]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.deepEqual(
        all.map((a) => `${a.browser}:${a.email}`).sort(),
        ['360 极速浏览器:360@example.com', 'Opera:opera@example.com', 'QQ 浏览器:qq@example.com', 'Yandex Browser:yandex@example.com']
      );
    }
  );
});

await test('Firefox 的 storage/default/<origin>/ls/data.sqlite 被识别', async () => {
  const token = fakeAccessToken({ email: 'firefox@example.com', iat: now, exp: now + 24 * HOUR });
  const rt = `rt_${'a'.repeat(64)}`;
  await withFakeBrowsers(
    ({ roaming }) => {
      const profile = path.join(roaming, 'Mozilla/Firefox/Profiles/test.default-release');
      writeFirefoxData(profile, 'https+++www.anzhiyu.com', { token, refreshToken: rt });
    },
    async (mod) => {
      const { latest, all, diagnostics } = mod.scanLocalLevelDBTokens();
      assert.ok(latest, '应当扫到 Firefox 的 token');
      assert.equal(latest.email, 'firefox@example.com');
      assert.equal(latest.site, 'www');
      assert.equal(latest.browser, 'Mozilla Firefox');
      assert.equal(all.length, 1);
      assert.equal(all[0].refreshToken, rt, 'Firefox 的 refresh token 也要挂到同一账号');
      assert.ok(diagnostics.roots.some((r) => r.startsWith('Mozilla Firefox:')));
    }
  );
});

await test('Firefox origin 目录决定站点，不会把旧站错认成新站', async () => {
  const subToken = fakeAccessToken({ email: 'ff-sub@example.com', iat: now, exp: now + 24 * HOUR });
  const wwwToken = fakeAccessToken({ email: 'ff-www@example.com', iat: now + 1, exp: now + 24 * HOUR });
  await withFakeBrowsers(
    ({ roaming }) => {
      const profile = path.join(roaming, 'Mozilla/Firefox/Profiles/dual.default');
      writeFirefoxData(profile, 'https+++sub.anzhiyu.com', { token: subToken });
      writeFirefoxData(profile, 'https+++www.anzhiyu.com', { token: wwwToken });
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 2);
      assert.deepEqual(all.map((a) => `${a.site}:${a.email}`).sort(), ['sub:ff-sub@example.com', 'www:ff-www@example.com']);
    }
  );
});

console.log('[browser-scan-test] 3) 多 profile 合并');
await test('Default 与 Profile 2 同时扫描', async () => {
  const t1 = fakeAccessToken({ email: 'a@example.com', iat: now, exp: now + 24 * HOUR });
  const t2 = fakeAccessToken({ email: 'b@example.com', iat: now, exp: now + 24 * HOUR });
  await withFakeBrowsers(
    ({ local }) => {
      const base = path.join(local, 'Google/Chrome/User Data');
      writeLevelDb(path.join(base, 'Default/Local Storage/leveldb'), '000001.log', [{ key: 'auth_token', value: t1 }]);
      writeLevelDb(path.join(base, 'Profile 2/Local Storage/leveldb'), '000002.log', [{ key: 'auth_token', value: t2 }]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 2);
      assert.deepEqual(all.map((a) => a.email).sort(), ['a@example.com', 'b@example.com']);
    }
  );
});

console.log('[browser-scan-test] 4) 过期过滤与同账号去重');
await test('过期 token 被丢弃', async () => {
  const expired = fakeAccessToken({ email: 'old@example.com', iat: now - 48 * HOUR, exp: now - 24 * HOUR });
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Microsoft/Edge/User Data/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.log', [{ key: 'auth_token', value: expired }]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 0, '过期 token 不应参与同步');
    }
  );
});

await test('同一账号只保留 iat 最新的一条', async () => {
  const older = fakeAccessToken({ email: 'same@example.com', iat: now - 3600, exp: now + 23 * HOUR });
  const newer = fakeAccessToken({ email: 'same@example.com', iat: now, exp: now + 24 * HOUR });
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Microsoft/Edge/User Data/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.ldb', [{ key: 'auth_token', value: older }]);
      writeLevelDb(dir, '000002.log', [{ key: 'auth_token', value: newer }]);
    },
    async (mod) => {
      const { latest, all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 1);
      assert.equal(latest.iat, now);
    }
  );
});

console.log('[browser-scan-test] 5) refresh token 提取');
await test('rt_ 被提取并挂到账号上', async () => {
  const token = fakeAccessToken({ email: 'rt@example.com', iat: now, exp: now + 24 * HOUR });
  const rt = 'rt_' + 'a1b2c3d4'.repeat(8);
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Microsoft/Edge/User Data/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.log', [
        { key: 'auth_token', value: token },
        { key: 'refresh_token', value: rt }
      ]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 1);
      assert.equal(all[0].refreshToken, rt, 'refresh token 必须一起拿到，否则无法自动续期');
    }
  );
});

console.log('[browser-scan-test] 6) refresh token 不得跨账号串号');
await test('两个账号各用自己的 rt，不会共用同一个', async () => {
  const tA = fakeAccessToken({ email: 'a@example.com', iat: now, exp: now + 24 * HOUR });
  const tB = fakeAccessToken({ email: 'b@example.com', iat: now + 10, exp: now + 24 * HOUR });
  const rtA = 'rt_' + 'a1'.repeat(32);
  const rtB = 'rt_' + 'b2'.repeat(32);
  await withFakeBrowsers(
    ({ local }) => {
      const base = path.join(local, 'Google/Chrome/User Data');
      // 账号 A：profile Default，auth_token 与自己的 rt 相邻
      writeLevelDb(path.join(base, 'Default/Local Storage/leveldb'), '000001.log', [
        { key: 'auth_token', value: tA },
        { key: 'refresh_token', value: rtA }
      ]);
      // 账号 B：profile Profile 1，用另一个 rt
      writeLevelDb(path.join(base, 'Profile 1/Local Storage/leveldb'), '000002.log', [
        { key: 'auth_token', value: tB },
        { key: 'refresh_token', value: rtB }
      ]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 2);
      const byEmail = new Map(all.map((a) => [a.email, a]));
      assert.equal(byEmail.get('a@example.com').refreshToken, rtA, 'A 必须拿到自己的 rt');
      assert.equal(byEmail.get('b@example.com').refreshToken, rtB, 'B 必须拿到自己的 rt');
      assert.notEqual(
        byEmail.get('a@example.com').refreshToken,
        byEmail.get('b@example.com').refreshToken,
        '两个账号绝不能共用同一个一次性 rt'
      );
    }
  );
});

await test('找不到对应 rt 时宁可不给，也不猜', async () => {
  const token = fakeAccessToken({ email: 'solo@example.com', iat: now, exp: now + 24 * HOUR });
  const otherRt = 'rt_' + 'c3'.repeat(32);
  await withFakeBrowsers(
    ({ local }) => {
      const base = path.join(local, 'Microsoft/Edge/User Data');
      // token 在 Default
      writeLevelDb(path.join(base, 'Default/Local Storage/leveldb'), '000001.log', [
        { key: 'auth_token', value: token }
      ]);
      // rt 只在另一个 profile，不能跨 profile 硬塞
      writeLevelDb(path.join(base, 'Profile 2/Local Storage/leveldb'), '000002.log', [
        { key: 'refresh_token', value: otherRt }
      ]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 1);
      assert.equal(all[0].refreshToken, undefined, '跨 profile 的 rt 不应被采用');
    }
  );
});

console.log('[browser-scan-test] 7) 无数据时的诊断信息');
await test('没有任何浏览器时 diagnostics 为空且给出可读提示', async () => {
  await withFakeBrowsers(
    () => {},
    async (mod) => {
      const { latest, all, diagnostics } = mod.scanLocalLevelDBTokens();
      assert.equal(latest, null);
      assert.equal(all.length, 0);
      assert.equal(diagnostics.roots.length, 0);

      const result = await mod.scanRunningBrowsersForToken();
      assert.equal(result.success, false);
      assert.equal(result.needsLogin, true);
      assert.match(result.message, /未找到任何浏览器数据目录|未检测到/);
    }
  );
});

console.log('[browser-scan-test] 8) sub / www 双站点分离');
await test('同一邮箱在两个站点被识别为两个账号', async () => {
  const tSub = fakeAccessToken({ email: 'same@example.com', iat: now, exp: now + 24 * HOUR });
  const tWww = fakeAccessToken({ email: 'same@example.com', iat: now + 5, exp: now + 24 * HOUR });
  const rtSub = 'rt_' + 'c3'.repeat(32);
  const rtWww = 'rt_' + 'd4'.repeat(32);
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Microsoft/Edge/User Data/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.log', [
        { key: 'auth_token', value: tSub, site: 'sub' },
        { key: 'refresh_token', value: rtSub, site: 'sub' },
        { key: 'auth_token', value: tWww, site: 'www' },
        { key: 'refresh_token', value: rtWww, site: 'www' }
      ]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 2, '同一邮箱在两个站点必须各算一个账号');
      const bySite = new Map(all.map((a) => [a.site, a]));
      assert.ok(bySite.get('sub'), '应识别出 sub 站点账号');
      assert.ok(bySite.get('www'), '应识别出 www 站点账号');
      assert.equal(bySite.get('sub').refreshToken, rtSub, 'sub 的 rt 只能配给 sub');
      assert.equal(bySite.get('www').refreshToken, rtWww, 'www 的 rt 只能配给 www');
    }
  );
});

await test('只有 www 登录态时不会误判成 sub', async () => {
  const token = fakeAccessToken({ email: 'wwwonly@example.com', iat: now, exp: now + 24 * HOUR });
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Google/Chrome/User Data/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.log', [{ key: 'auth_token', value: token, site: 'www' }]);
    },
    async (mod) => {
      const { all } = mod.scanLocalLevelDBTokens();
      assert.equal(all.length, 1);
      assert.equal(all[0].site, 'www');
    }
  );
});

console.log('[browser-scan-test] 9) 过期 token 的 refresh token 恢复');
await test('过期 token 仍能与同源 rt 配对并被恢复', async () => {
  const expired = fakeAccessToken({ email: 'expired@example.com', iat: now - 48 * HOUR, exp: now - 24 * HOUR });
  const rt = 'rt_' + 'e5'.repeat(32);
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Microsoft/Edge/User Data/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.log', [
        { key: 'auth_token', value: expired, site: 'www' },
        { key: 'refresh_token', value: rt, site: 'www' }
      ]);
    },
    async (mod) => {
      // 常规同步仍然不暴露过期 token
      assert.equal(mod.scanLocalLevelDBTokens().all.length, 0, '过期 token 不应进入常规同步列表');
      const recoverable = mod.scanExpiredAccountsWithRefreshToken();
      assert.equal(recoverable.length, 1, '带 rt 的过期账号应可恢复');
      assert.equal(recoverable[0].email, 'expired@example.com');
      assert.equal(recoverable[0].site, 'www');
      assert.equal(recoverable[0].refreshToken, rt, '恢复时必须带上同源 rt');
    }
  );
});

await test('过期 token 但没有 rt 时不进入恢复列表', async () => {
  const expired = fakeAccessToken({ email: 'no-rt@example.com', iat: now - 48 * HOUR, exp: now - 24 * HOUR });
  await withFakeBrowsers(
    ({ local }) => {
      const dir = path.join(local, 'Google/Chrome/User Data/Default/Local Storage/leveldb');
      writeLevelDb(dir, '000001.log', [{ key: 'auth_token', value: expired }]);
    },
    async (mod) => {
      assert.equal(mod.scanExpiredAccountsWithRefreshToken().length, 0);
    }
  );
});

console.log('[browser-scan-test] 7) 安全/openExternal 白名单');
await test('非 http(s) 的 URL 被拒绝', async () => {
  await withFakeBrowsers(
    () => {},
    async (mod) => {
      assert.equal(mod.openExternal('file:///C:/Windows/System32/calc.exe'), false);
      assert.equal(mod.openExternal('cmd.exe /c calc'), false);
      assert.equal(mod.openExternal('javascript:alert(1)'), false);
      assert.equal(mod.openExternal(''), false);
    }
  );
});

console.log(`\n[browser-scan-test] 结果: ${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
