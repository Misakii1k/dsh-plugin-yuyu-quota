/**
 * 更新检查回归测试：不联网，用可控 fetch 复现「更新源慢/超时/403」的真实链路。
 *
 * 覆盖：
 * 1. Cloudflare version.json 在 1.5s 之后返回，不应再被 1.5s 熔断误杀；
 * 2. version.json 没给出新版本时，/api/releases 能兜底；
 * 3. version.json 直接 500 时，仍能靠 /api/releases 发现新版本；
 * 4. releaseNotes 能进入 UpdateInfo.notes。
 */
import assert from 'node:assert/strict';
import { checkForUpdate } from '../lib/update.js';

const FEED = 'https://feed.test';
const REPO = 'Misakii1k/dsh-plugin-yuyu-quota';
const NOTES = '## 修复\n- 放宽更新检查超时';

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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function releasePayload(version, notes = NOTES) {
  return {
    tag_name: `v${version}`,
    html_url: `https://github.com/${REPO}/releases/tag/v${version}`,
    body: notes,
    assets: [{
      name: `dsh-plugin-yuyu-quota-${version}.tgz`,
      size: 5_900_000,
      digest: `sha256:${'a'.repeat(64)}`,
      browser_download_url: `/api/download?tag=v${version}`
    }]
  };
}

function versionPayload(version, notes = NOTES) {
  return {
    version,
    downloadUrl: `/api/download?tag=v${version}`,
    fileSize: 5_900_000,
    sha256: 'b'.repeat(64),
    releaseNotes: notes
  };
}

function githubFailure(url) {
  if (url.includes('/releases/latest') || url.includes('/tags')) {
    return new Response('rate limited', { status: 403 });
  }
  if (url.includes('raw.githubusercontent.com')) {
    return new Response('not found', { status: 404 });
  }
  return null;
}

function installMock(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const signal = init?.signal;
    const result = await handler(url, signal);
    if (result) return result;
    const failure = githubFailure(url);
    if (failure) return failure;
    throw new Error(`unexpected fetch: ${url}`);
  };
  return () => { globalThis.fetch = original; };
}

async function run() {
  await test('更新源超过 1.5s 但仍应成功', async () => {
    const restore = installMock(async (url, signal) => {
      if (url.endsWith('/version.json')) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1_700);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
        return jsonResponse(versionPayload('1.4.1'));
      }
      return null;
    });
    try {
      const info = await checkForUpdate({
        currentVersion: '1.3.3',
        preferences: { updateFeedUrl: FEED, githubRepo: REPO }
      });
      assert.equal(info.available, true);
      assert.equal(info.latestVersion, '1.4.1');
      assert.equal(info.source, 'feed');
      assert.match(String(info.notes || ''), /放宽更新检查超时/);
      assert.equal(info.downloadUrl, `${FEED}/api/download?tag=v1.4.1`);
    } finally {
      restore();
    }
  });

  await test('version.json 未给新版本时 /api/releases 兜底', async () => {
    const restore = installMock(async (url) => {
      if (url.endsWith('/version.json')) return jsonResponse(versionPayload('1.3.3', '旧版本'));
      if (url.endsWith('/api/releases')) return jsonResponse(releasePayload('1.4.1'));
      return null;
    });
    try {
      const info = await checkForUpdate({
        currentVersion: '1.3.3',
        preferences: { updateFeedUrl: FEED, githubRepo: REPO }
      });
      assert.equal(info.available, true);
      assert.equal(info.latestVersion, '1.4.1');
      assert.equal(info.source, 'feed-releases');
    } finally {
      restore();
    }
  });

  await test('version.json 500 时仍能靠 /api/releases 找到更新', async () => {
    const restore = installMock(async (url) => {
      if (url.endsWith('/version.json')) return jsonResponse({ message: 'bad gateway' }, 500);
      if (url.endsWith('/api/releases')) return jsonResponse(releasePayload('1.4.1'));
      return null;
    });
    try {
      const info = await checkForUpdate({
        currentVersion: '1.3.3',
        preferences: { updateFeedUrl: FEED, githubRepo: REPO }
      });
      assert.equal(info.available, true);
      assert.equal(info.latestVersion, '1.4.1');
    } finally {
      restore();
    }
  });

  console.log(`\n[update-test] 结果: ${passed} 通过 / ${failed} 失败`);
  if (failed > 0) process.exitCode = 1;
}

await run();
