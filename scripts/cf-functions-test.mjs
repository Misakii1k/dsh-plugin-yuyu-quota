/**
 * Cloudflare Pages Functions 的离线自检。
 *
 * 不联网、不需要 wrangler：用 TypeScript 把 functions/*.ts 转译成 JS，
 * 再用 Node 自带的 Request/Response/fetch（与 Workers 同源 API）直接调用
 * handler，把 GitHub API 换成可控的假响应，验证：
 * 1. 未配置 GITHUB_TOKEN 时返回 503 并说明如何配置
 * 2. /version.json 从 Release 资产读取真实 size 与 sha256（digest 解析）
 * 3. /api/releases 把 tgz 资产的下载地址改写成同源代理
 * 4. tag 白名单拦截路径穿越与非法版本号
 * 5. 上游错误脱敏，不回显 GitHub 原文
 * 6. /api/download 流式回传与正确的响应头
 *
 * 运行：node scripts/cf-functions-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, '.tmp-cf-functions');

/**
 * 用 TypeScript 编译器做「只转译、不检查类型」的转换，输出 ESM。
 * 这比手写正则剥离类型可靠得多（正则会被泛型、联合类型、可选属性击穿）。
 */
function transpile(source, fileName) {
  const result = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: false,
      removeComments: false
    }
  });
  return result.outputText;
}

function prepare() {
  fs.rmSync(tmp, { recursive: true, force: true });
  // 保持与 functions/ 相同的目录层级：version.json.ts 在根目录、api/*.ts 在子目录。
  // 这样它们源码里的相对导入（./api/_shared 与 ./_shared）原样有效。
  fs.mkdirSync(path.join(tmp, 'api'), { recursive: true });
  const files = [
    ['api/_shared.ts', 'api/_shared.mjs'],
    ['api/releases.ts', 'api/releases.mjs'],
    ['api/download.ts', 'api/download.mjs'],
    ['version.json.ts', 'version.json.mjs']
  ];
  for (const [from, to] of files) {
    const source = fs.readFileSync(path.join(root, 'functions', from), 'utf8');
    let output = transpile(source, from);
    // 相对导入补上 .mjs 扩展名，Node 才能解析（层级保持原样，只补后缀）
    output = output.replace(/from (['"])(\.\.?\/[^'"]*?)\1/g, (_match, quote, spec) => {
      const withExt = spec.endsWith('.mjs') ? spec : `${spec}.mjs`;
      return `from ${quote}${withExt}${quote}`;
    });
    fs.writeFileSync(path.join(tmp, to), output, 'utf8');
  }
}

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

const fakeRelease = {
  tag_name: 'v1.1.0',
  published_at: '2026-10-26T08:00:00Z',
  body: '本次更新\n\n<!-- versionCode: 999 -->\n\n- 新增任务完成通知\n- 新增云端版本推送',
  assets: [
    {
      id: 4242,
      name: 'dsh-plugin-yuyu-quota-1.1.0.tgz',
      size: 51234,
      digest: 'sha256:' + 'a'.repeat(64),
      browser_download_url: 'https://github.com/secret/asset'
    }
  ]
};

/** 安装一个可控的 fetch 桩，返回给定 release */
function stubFetch(release = fakeRelease) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(release), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
  return {
    restore() {
      globalThis.fetch = original;
    }
  };
}

prepare();

const shared = await import(pathToFileURL(path.join(tmp, 'api', '_shared.mjs')).href);
const versionModule = await import(pathToFileURL(path.join(tmp, 'version.json.mjs')).href);
const releasesModule = await import(pathToFileURL(path.join(tmp, 'api', 'releases.mjs')).href);
const downloadModule = await import(pathToFileURL(path.join(tmp, 'api', 'download.mjs')).href);

console.log('\n[1] 缺少 GITHUB_TOKEN');
await test('version.json 返回 503 并给出配置指引', async () => {
  const res = await versionModule.onRequestGet({
    request: new Request('https://demo.pages.dev/version.json'),
    env: {}
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, 'GITHUB_TOKEN_NOT_CONFIGURED');
  assert.match(body.message, /环境变量/);
});

console.log('\n[2] version.json 元数据');
await test('解析版本、体积与 sha256', async () => {
  const stub = stubFetch();
  try {
    const res = await versionModule.onRequestGet({
      request: new Request('https://demo.pages.dev/version.json'),
      env: { GITHUB_TOKEN: 'x' }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.version, '1.1.0');
    assert.equal(body.fileSize, 51234);
    assert.equal(body.sha256, 'a'.repeat(64));
    assert.equal(body.downloadUrl, '/api/download?tag=v1.1.0');
    assert.equal(body.releaseDate, '2026-10-26');
  } finally {
    stub.restore();
  }
});

await test('发布说明剥离 HTML 注释元数据', async () => {
  const stub = stubFetch();
  try {
    const res = await versionModule.onRequestGet({
      request: new Request('https://demo.pages.dev/version.json'),
      env: { GITHUB_TOKEN: 'x' }
    });
    const body = await res.json();
    assert.ok(!body.releaseNotes.includes('versionCode'), '不应包含注释元数据');
    assert.match(body.releaseNotes, /新增任务完成通知/);
  } finally {
    stub.restore();
  }
});

await test('上游非 200 时脱敏为 UPSTREAM_ERROR', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"Bad credentials"}', { status: 401 });
  try {
    const res = await versionModule.onRequestGet({
      request: new Request('https://demo.pages.dev/version.json'),
      env: { GITHUB_TOKEN: 'x' }
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'UPSTREAM_ERROR');
    assert.ok(!JSON.stringify(body).includes('Bad credentials'), '不应回显 GitHub 原文');
  } finally {
    globalThis.fetch = original;
  }
});

console.log('\n[3] /api/releases 代理');
await test('tgz 资产下载地址被改写为同源代理', async () => {
  const stub = stubFetch();
  try {
    const res = await releasesModule.onRequestGet({
      request: new Request('https://demo.pages.dev/api/releases'),
      env: { GITHUB_TOKEN: 'x' }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.tag_name, 'v1.1.0');
    assert.equal(
      body.assets[0].browser_download_url,
      'https://demo.pages.dev/api/download?tag=v1.1.0'
    );
  } finally {
    stub.restore();
  }
});

console.log('\n[4] tag 白名单');
await test('非法 tag 返回 400', async () => {
  for (const tag of ['../../user', 'not-a-version', 'v1.0', 'v1.0.0.0']) {
    const res = await releasesModule.onRequestGet({
      request: new Request(`https://demo.pages.dev/api/releases?tag=${encodeURIComponent(tag)}`),
      env: { GITHUB_TOKEN: 'x' }
    });
    assert.equal(res.status, 400, `tag=${tag} 应被拒绝`);
  }
});

await test('合法 tag 通过校验', async () => {
  for (const tag of ['v1.1.0', '1.1.0', 'v1.1.0-beta.1']) {
    const parsed = shared.parseReleaseTag(tag);
    assert.equal(parsed.ok, true, `tag=${tag} 应被接受`);
  }
});

await test('releaseApiUrl 断言不能逃出 tags 前缀', async () => {
  assert.throws(() => shared.releaseApiUrl('v1.0.0/../../user'));
});

console.log('\n[5] /api/download 代理');
await test('缺少资产时返回 404', async () => {
  const stub = stubFetch({ tag_name: 'v1.1.0', assets: [] });
  try {
    const res = await downloadModule.onRequestGet({
      request: new Request('https://demo.pages.dev/api/download?tag=v1.1.0'),
      env: { GITHUB_TOKEN: 'x' }
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'ASSET_NOT_FOUND');
  } finally {
    stub.restore();
  }
});

await test('流式回传安装包并带正确响应头', async () => {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify(fakeRelease), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3, 4, 5]), {
      status: 200,
      headers: { 'content-length': '5' }
    });
  };
  try {
    const res = await downloadModule.onRequestGet({
      request: new Request('https://demo.pages.dev/api/download?tag=v1.1.0'),
      env: { GITHUB_TOKEN: 'x' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/gzip');
    assert.match(res.headers.get('content-disposition'), /dsh-plugin-yuyu-quota-1\.1\.0\.tgz/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(bytes.length, 5);
  } finally {
    globalThis.fetch = original;
  }
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`);
process.exit(failed === 0 ? 0 : 1);
