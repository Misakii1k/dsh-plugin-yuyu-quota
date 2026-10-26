/**
 * 零依赖自检：直接 import 编译产物 lib/*.js，用合成事件驱动核心逻辑。
 * 运行：node scripts/smoke-test.mjs
 *
 * 覆盖：
 * 1. Token 汇总口径（reasoning 不重复计、cacheWrite 计入、权威 totalTokens 优先）
 * 2. 额度差分（今日消耗增量 / 余额下降 / 充值干扰 / 估算降级 / 刷新失败）
 * 3. 子智能体会话识别与过滤
 * 4. 空轮次不汇报
 * 5. 版本比较与更新清单规整
 * 6. 偏好白名单收敛
 * 7. 浮窗位置收敛
 */
import assert from 'node:assert/strict';
import { createSessionTracker } from '../lib/session-tracker.js';
import { compareVersions, cleanVersion, normalizeFeedUrl, resolveDownloadUrl } from '../lib/update.js';
import { sanitizePreferences, defaultPreferences, normalizeWidgetPosition } from '../lib/index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err?.message || err}`);
  }
}

async function testAsync(name, fn) {
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

function snapshot(overrides = {}) {
  return {
    success: true,
    timestamp: Date.now(),
    fetchedAt: Date.now(),
    email: 'test@example.com',
    balance: 10,
    frozenBalance: 0,
    totalRecharged: 50,
    todayCost: 1,
    todayRawCost: 5,
    todayTokens: 10000,
    todayRequests: 10,
    totalRequests: 100,
    totalActualCost: 10,
    keysCount: 1,
    keysSummary: [],
    isLowBalance: false,
    alertThreshold: 2,
    formattedText: '',
    ...overrides
  };
}

const mainSession = { id: 'sess-main', header: { origin: 'root', delegationDepth: 0 } };
const subSession = { id: 'sess-sub', header: { origin: 'subagent', delegationDepth: 1 } };

/** 建一个受控 tracker：快照序列由测试给出 */
function makeTracker(snapshots, reports) {
  let index = 0;
  const tracker = createSessionTracker({
    getCachedSnapshot: () => null,
    refreshSnapshot: async () => {
      const value = snapshots[Math.min(index, snapshots.length - 1)];
      index += 1;
      return value;
    },
    onReport: (report) => {
      reports.push(report);
    }
  });
  return tracker;
}

function assistantMessage(turn, usage, model = 'deepseek-v4.1-flash') {
  return {
    type: 'assistant/message',
    time: Date.now(),
    data: {
      turn,
      message: { source: { kind: 'model', provider: 'fish', model } },
      usage
    }
  };
}

console.log('\n[1] Token 汇总口径');
await testAsync('reasoning 不重复计入总量', async () => {
  const reports = [];
  const tracker = makeTracker([snapshot(), snapshot({ todayCost: 1.02 })], reports);
  tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn: 1 } });
  tracker.observe(mainSession, assistantMessage(1, {
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheWriteTokens: 50,
    reasoningTokens: 400
  }));
  tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn: 1, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reports.length, 1);
  // 1000 + 500 + 200 + 50 = 1750（reasoning 400 不另加）
  assert.equal(reports[0].tokens.totalTokens, 1750);
  assert.equal(reports[0].tokens.reasoningTokens, 400);
});

await testAsync('权威 totalTokens 优先于四桶之和', async () => {
  const reports = [];
  const tracker = makeTracker([snapshot(), snapshot({ todayCost: 1.01 })], reports);
  tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn: 2 } });
  tracker.observe(mainSession, assistantMessage(2, {
    inputTokens: 100,
    outputTokens: 100,
    totalTokens: 999
  }));
  tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn: 2, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reports[0].tokens.totalTokens, 999);
});

await testAsync('多步同轮累加', async () => {
  const reports = [];
  const tracker = makeTracker([snapshot(), snapshot({ todayCost: 1.01 })], reports);
  tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn: 3 } });
  tracker.observe(mainSession, assistantMessage(3, { inputTokens: 10, outputTokens: 10 }));
  tracker.observe(mainSession, assistantMessage(3, { inputTokens: 20, outputTokens: 20 }));
  tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn: 3, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reports[0].tokens.totalTokens, 60);
});

console.log('\n[2] 额度核算');
await testAsync('今日消耗增量 → actual', async () => {
  const reports = [];
  const tracker = makeTracker([
    snapshot({ todayCost: 1, balance: 10 }),
    snapshot({ todayCost: 1.05, balance: 9.95 })
  ], reports);
  tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn: 10 } });
  tracker.observe(mainSession, assistantMessage(10, { inputTokens: 1000, outputTokens: 1000 }));
  tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn: 10, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reports[0].quotaSource, 'actual');
  assert.ok(Math.abs(reports[0].quota - 0.05) < 1e-9, `quota=${reports[0].quota}`);
});

await testAsync('充值导致余额上升时不用余额差', async () => {
  const reports = [];
  const tracker = makeTracker([
    snapshot({ todayCost: 1, balance: 10, totalRecharged: 50 }),
    snapshot({ todayCost: 1, balance: 60, totalRecharged: 100 })
  ], reports);
  tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn: 11 } });
  tracker.observe(mainSession, assistantMessage(11, { inputTokens: 1000, outputTokens: 1000 }));
  tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn: 11, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 50));
  // 今日消耗未变 + 充值变化 → 既非 actual 也不是余额差；落回估算或 unavailable
  assert.notEqual(reports[0].quotaSource, 'actual');
});

await testAsync('刷新失败 → 不崩，标记额度不可用', async () => {
  const reports = [];
  const tracker = makeTracker([snapshot(), null], reports);
  tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn: 12 } });
  tracker.observe(mainSession, assistantMessage(12, { inputTokens: 500, outputTokens: 500 }));
  tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn: 12, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].quotaSource, 'unavailable');
  assert.equal(reports[0].tokens.totalTokens, 1000);
});

await testAsync('会话累计随轮次增长', async () => {
  const reports = [];
  const tracker = makeTracker(
    [snapshot(), snapshot({ todayCost: 1.01 }), snapshot({ todayCost: 1.02 }), snapshot({ todayCost: 1.03 })],
    reports
  );
  for (const turn of [20, 21]) {
    tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn } });
    tracker.observe(mainSession, assistantMessage(turn, { inputTokens: 100, outputTokens: 100 }));
    tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn, reason: { kind: 'completed' } } });
    await new Promise((r) => setTimeout(r, 40));
  }
  assert.equal(reports.length, 2);
  assert.equal(reports[1].sessionTokens, 400);
});

console.log('\n[3] 子智能体与空轮次');
await testAsync('子智能体会话被标记 isSubagent', async () => {
  const reports = [];
  const tracker = makeTracker([snapshot(), snapshot({ todayCost: 1.01 })], reports);
  tracker.observe(subSession, { type: 'turn/start', time: Date.now(), data: { turn: 1 } });
  tracker.observe(subSession, assistantMessage(1, { inputTokens: 100, outputTokens: 100 }));
  tracker.observe(subSession, { type: 'turn/end', time: Date.now(), data: { turn: 1, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(reports.length, 1);
  assert.equal(reports[0].isSubagent, true);
});

await testAsync('没有 usage 的空轮次不汇报', async () => {
  const reports = [];
  const tracker = makeTracker([snapshot(), snapshot()], reports);
  tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn: 30 } });
  tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn: 30, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(reports.length, 0);
});

await testAsync('aborted / blocked 默认不汇报', async () => {
  const reports = [];
  const tracker = makeTracker([snapshot(), snapshot()], reports);
  for (const [turn, kind] of [[31, 'aborted'], [32, 'blocked']]) {
    tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn } });
    tracker.observe(mainSession, assistantMessage(turn, { inputTokens: 10, outputTokens: 10 }));
    tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn, reason: { kind } } });
  }
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(reports.length, 0);
});

await testAsync('中断异常不冒泡', async () => {
  const reports = [];
  const tracker = createSessionTracker({
    getCachedSnapshot: () => null,
    refreshSnapshot: async () => {
      throw new Error('boom');
    },
    onReport: (report) => {
      reports.push(report);
    }
  });
  tracker.observe(mainSession, { type: 'turn/start', time: Date.now(), data: { turn: 40 } });
  tracker.observe(mainSession, assistantMessage(40, { inputTokens: 10, outputTokens: 10 }));
  tracker.observe(mainSession, { type: 'turn/end', time: Date.now(), data: { turn: 40, reason: { kind: 'completed' } } });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(reports.length, 1);
});

console.log('\n[4] 版本与更新源');
test('compareVersions 语义比较', () => {
  assert.equal(compareVersions('1.1.0', '1.0.10'), 1);
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(compareVersions('1.1.0', '1.1.0'), 0);
  assert.equal(compareVersions('1.1.0-beta', '1.1.0'), -1);
  assert.equal(compareVersions('v1.2.0', '1.1.9'), 1);
});

test('cleanVersion 提取版本号', () => {
  assert.equal(cleanVersion('v1.1.0'), '1.1.0');
  // `-stable` 属于合法 semver 预发布段，应随版本号一起保留
  assert.equal(cleanVersion('release-1.1.0-stable'), '1.1.0-stable');
  assert.equal(cleanVersion('not-a-version'), '');
});

test('normalizeFeedUrl 只保留 http(s)', () => {
  assert.equal(normalizeFeedUrl('https://demo.pages.dev/'), 'https://demo.pages.dev');
  assert.equal(normalizeFeedUrl('javascript:alert(1)'), '');
  assert.equal(normalizeFeedUrl(''), '');
});

test('resolveDownloadUrl 拼出绝对地址', () => {
  assert.equal(
    resolveDownloadUrl('/api/download?tag=v1.1.0', 'https://demo.pages.dev'),
    'https://demo.pages.dev/api/download?tag=v1.1.0'
  );
  assert.equal(resolveDownloadUrl('', 'https://demo.pages.dev'), '');
});

console.log('\n[5] 偏好白名单');
test('未知键被丢弃、非法值被回落', () => {
  const base = defaultPreferences();
  const next = sanitizePreferences({
    notifyOnComplete: false,
    notifySound: 'Notification.Reminder',
    updateFeedUrl: 'https://x.pages.dev/',
    githubRepo: 'https://github.com/a/b.git',
    banned: 'should-not-appear',
    updateCheckIntervalHours: 9999
  }, base);
  assert.equal(next.notifyOnComplete, false);
  assert.equal(next.updateFeedUrl, 'https://x.pages.dev');
  assert.equal(next.githubRepo, 'a/b');
  assert.equal(next.updateCheckIntervalHours, base.updateCheckIntervalHours);
  assert.equal('banned' in next, false);
});

test('非法音效回落为默认值', () => {
  const base = defaultPreferences();
  const next = sanitizePreferences({ notifySound: 'rm -rf /' }, base);
  assert.equal(next.notifySound, base.notifySound);
});

test('注入型 updateFeedUrl 被拒绝', () => {
  const base = defaultPreferences();
  const next = sanitizePreferences({ updateFeedUrl: 'javascript:alert(1)' }, base);
  assert.equal(next.updateFeedUrl, base.updateFeedUrl);
});

console.log('\n[6] 浮窗位置');
test('合法坐标保留并取整', () => {
  const pos = normalizeWidgetPosition({ x: 12.7, y: 99.2, edge: 'left' });
  assert.deepEqual(pos, { x: 13, y: 99, edge: 'left' });
});

test('非法坐标返回 null', () => {
  assert.equal(normalizeWidgetPosition({ x: 'abc', y: 1 }), null);
  assert.equal(normalizeWidgetPosition(null), null);
});

test('越界坐标被钳制', () => {
  const pos = normalizeWidgetPosition({ x: 1e9, y: -1e9, edge: 'free' });
  assert.ok(pos.x <= 20000 && pos.y >= -2000);
});

console.log(`\n结果：${passed} 通过 / ${failed} 失败\n`);
process.exit(failed === 0 ? 0 : 1);
