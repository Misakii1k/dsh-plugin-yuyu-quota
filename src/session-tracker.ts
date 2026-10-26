import { BalanceSnapshot, TokenUsageTotals, TurnUsageReport } from './types.js';

export interface SessionTrackerHooks {
  getCachedSnapshot: () => BalanceSnapshot | null;
  refreshSnapshot: () => Promise<BalanceSnapshot | null>;
  onReport: (report: TurnUsageReport) => void | Promise<void>;
  logger?: { warn?: (message: string) => void };
}

/**
 * 轮次开始时的账户基线。额度 = 结束时账户状态 − 该基线。
 * 网关只提供“今日累计”，没有逐条流水（已实测 /usage、/log/self 等均无明细），
 * 因此只能做快照差分。
 */
interface TurnBaseline {
  fetchedAt: number;
  todayCost: number;
  todayTokens: number;
  balance: number;
  totalRecharged: number;
}

interface TurnState {
  number: number;
  startedAt: number;
  usage: TokenUsageTotals;
  provider?: string;
  model?: string;
  baseline?: TurnBaseline;
  baselinePending?: Promise<void>;
  /** 该轮是否至少见过一条带 usage 的 assistant/message */
  sawUsage: boolean;
}

interface SessionState {
  id: string;
  title: string;
  firstUserText: string;
  lastEventAt: number;
  turn: TurnState | null;
  sessionTokens: number;
  sessionQuota: number;
  chain: Promise<void>;
}

/** 这些结束原因才值得汇报；aborted / blocked / interrupted 默认静默 */
const REPORTABLE_REASONS = new Set(['completed', 'max-tokens', 'error']);
const SESSION_LIMIT = 100;
/** 基线快照允许的最大“提前量”：轮次开始前 5 分钟内的快照都算新鲜 */
const BASELINE_MAX_AGE_MS = 5 * 60 * 1000;
/** 等待基线刷新的上限 */
const BASELINE_WAIT_MS = 5000;
/** 等待轮次结束快照的上限 */
const AFTER_WAIT_MS = 12_000;

function emptyUsage(): TokenUsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0
  };
}

function nonNegative(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/**
 * 累加一次 assistant/message 的 usage。
 *
 * 口径（依据 DSH 的 TokenUsage 定义）：
 * - inputTokens 是「未命中缓存的输入」，与 cacheRead/cacheWrite 互不重叠；
 * - reasoningTokens 已包含在 outputTokens 内（dsh-token-meter 保证其 ≤ outputTokens），
 *   绝不能再次计入总量，否则输出侧会被重复计费（实测偏高近一倍）；
 * - totalTokens 若适配器给了权威值就用它，否则用四桶之和。
 */
function addUsage(target: TokenUsageTotals, usage: any): boolean {
  if (!usage || typeof usage !== 'object') return false;
  const input = nonNegative(usage.inputTokens);
  const output = nonNegative(usage.outputTokens);
  const cacheRead = nonNegative(usage.cacheReadTokens);
  const cacheWrite = nonNegative(usage.cacheWriteTokens);
  const reasoning = nonNegative(usage.reasoningTokens);
  const bucketTotal = input + output + cacheRead + cacheWrite;
  const declaredTotal = nonNegative(usage.totalTokens);

  target.inputTokens += input;
  target.outputTokens += output;
  target.cacheReadTokens += cacheRead;
  target.cacheWriteTokens += cacheWrite;
  target.reasoningTokens += reasoning;
  target.totalTokens += declaredTotal > 0 ? declaredTotal : bucketTotal;

  return bucketTotal > 0 || declaredTotal > 0;
}

function baselineFrom(snapshot: BalanceSnapshot): TurnBaseline {
  return {
    fetchedAt: Number(snapshot.fetchedAt || snapshot.timestamp || Date.now()),
    todayCost: Number(snapshot.todayCost || 0),
    todayTokens: Number(snapshot.todayTokens || 0),
    balance: Number(snapshot.balance || 0),
    totalRecharged: Number(snapshot.totalRecharged || 0)
  };
}

function cleanTitle(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function textOfMessage(content: any): string {
  if (!Array.isArray(content)) return '';
  const block = content.find((item) => item && item.type === 'text' && typeof item.text === 'string');
  return block ? cleanTitle(block.text) : '';
}

function delay(ms: number): Promise<null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

/** 子智能体会话判定：header.origin 或 delegationDepth，任一命中即视为子会话。 */
function isSubagentSession(session: any): boolean {
  try {
    const header = session?.header;
    if (!header) return false;
    if (header.origin === 'subagent') return true;
    const depth = Number(header.delegationDepth);
    return Number.isFinite(depth) && depth > 0;
  } catch {
    return false;
  }
}

/**
 * 监听 DSH 的 session/event，按「会话 + 轮次」汇总 assistant/message.usage，
 * 在 turn/end 时结合鱼鱼API 的今日消耗 / 余额差额算出本轮额度。
 *
 * 设计取舍：
 * - 只对**主会话**（非子智能体）汇报，避免一次主任务里多个子 Agent 各自弹窗刷屏；
 *   `reportOnSubagent` 打开时也只为它们记账、不弹通知（由上层决定）。
 * - 所有回调都包 catch，异常绝不冒泡到 DSH 的 append feed。
 */
export function createSessionTracker(hooks: SessionTrackerHooks) {
  const sessions = new Map<string, SessionState>();
  let disposed = false;

  const logWarn = (message: string) => {
    try {
      hooks.logger?.warn?.(message);
    } catch {
      // 日志失败不影响跟踪
    }
  };

  function pruneSessions() {
    if (sessions.size <= SESSION_LIMIT) return;
    const sorted = [...sessions.entries()].sort((a, b) => a[1].lastEventAt - b[1].lastEventAt);
    const removeCount = sorted.length - Math.floor(SESSION_LIMIT * 0.8);
    for (let index = 0; index < removeCount; index += 1) {
      const state = sorted[index][1];
      if (!state.turn) sessions.delete(sorted[index][0]);
    }
  }

  function stateOf(session: any): SessionState | null {
    const id = String(session?.id || '').trim();
    if (!id) return null;
    let state = sessions.get(id);
    if (!state) {
      state = {
        id,
        title: '',
        firstUserText: '',
        lastEventAt: Date.now(),
        turn: null,
        sessionTokens: 0,
        sessionQuota: 0,
        chain: Promise.resolve()
      };
      sessions.set(id, state);
      pruneSessions();
    }
    state.lastEventAt = Date.now();
    return state;
  }

  /** 轮次开始时抓基线；有缓存先占位，再异步刷新覆盖。 */
  function startTurn(state: SessionState, turnNumber: number, startedAt: number) {
    const turn: TurnState = {
      number: turnNumber,
      startedAt,
      usage: emptyUsage(),
      sawUsage: false
    };

    const cached = hooks.getCachedSnapshot();
    if (cached?.success && Number(cached.fetchedAt || cached.timestamp || 0) >= startedAt - BASELINE_MAX_AGE_MS) {
      turn.baseline = baselineFrom(cached);
    }

    turn.baselinePending = Promise.resolve()
      .then(() => hooks.refreshSnapshot())
      .then((snapshot) => {
        if (snapshot?.success) {
          // 刷新回来的基线可能比缓存更早（并发刷新），取时间上更贴近轮次开始的那个
          const fresh = baselineFrom(snapshot);
          if (!turn.baseline || fresh.fetchedAt >= turn.baseline.fetchedAt) {
            turn.baseline = fresh;
          }
        }
      })
      .catch(() => {})
      .then(() => {});

    state.turn = turn;
  }

  /**
   * 计算本轮额度。
   *
   * 优先级：
   * 1. 今日消耗增量（最准，是真实扣费口径）；
   * 2. 余额下降量（充值会干扰，故要求 totalRecharged 未变）；
   * 3. 用今日平均单价 × 本轮 Token 估算（标注 estimated）。
   */
  function computeQuota(turn: TurnState, turnEndedAt: number, after: BalanceSnapshot | null) {
    let quota = 0;
    let quotaSource: TurnUsageReport['quotaSource'] = 'unavailable';
    let quotaRatePerMillion: number | undefined;

    const before = turn.baseline;
    const beforeIsFresh = Boolean(
      before
      && before.fetchedAt >= turn.startedAt - BASELINE_MAX_AGE_MS
      && before.fetchedAt <= turnEndedAt + 1000
    );

    if (before && beforeIsFresh && after?.success) {
      const costDelta = Number(after.todayCost || 0) - before.todayCost;
      const rechargeChanged = Math.abs(Number(after.totalRecharged || 0) - before.totalRecharged) > 1e-9;
      const balanceDelta = before.balance - Number(after.balance || 0);

      if (costDelta > 0) {
        quota = costDelta;
        quotaSource = 'actual';
      } else if (!rechargeChanged && balanceDelta > 0) {
        quota = balanceDelta;
        quotaSource = 'actual';
      }
    }

    if (quota <= 0 && turn.usage.totalTokens > 0 && after?.success) {
      const todayTokens = Number(after.todayTokens || 0);
      const todayCost = Number(after.todayCost || 0);
      const rate = todayTokens > 0 ? todayCost / todayTokens : 0;
      if (rate > 0) {
        quota = turn.usage.totalTokens * rate;
        quotaSource = 'estimated';
        quotaRatePerMillion = rate * 1_000_000;
      }
    }

    return { quota, quotaSource, quotaRatePerMillion };
  }

  async function finalizeTurn(
    state: SessionState,
    turn: TurnState,
    completedAt: number,
    reason: string,
    subagent: boolean
  ) {
    if (turn.baselinePending) {
      await Promise.race([turn.baselinePending, delay(BASELINE_WAIT_MS)]);
    }

    const after = (await Promise.race([
      hooks.refreshSnapshot().catch(() => null),
      delay(AFTER_WAIT_MS)
    ])) as BalanceSnapshot | null;

    const quotaInfo = computeQuota(turn, completedAt, after);

    state.sessionTokens += turn.usage.totalTokens;
    state.sessionQuota += quotaInfo.quota;

    const report: TurnUsageReport = {
      id: `${state.id}:${turn.number}`,
      sessionId: state.id,
      sessionTitle: state.title || state.firstUserText || `会话 ${state.id.slice(-6)}`,
      turn: turn.number,
      reason,
      provider: turn.provider,
      model: turn.model,
      tokens: { ...turn.usage },
      quota: Number(quotaInfo.quota.toFixed(6)),
      quotaSource: quotaInfo.quotaSource,
      quotaRatePerMillion: quotaInfo.quotaRatePerMillion,
      balanceBefore: turn.baseline?.balance,
      balanceAfter: after?.success ? Number(after.balance || 0) : undefined,
      todayCostBefore: turn.baseline?.todayCost,
      todayCostAfter: after?.success ? Number(after.todayCost || 0) : undefined,
      sessionTokens: state.sessionTokens,
      sessionQuota: Number(state.sessionQuota.toFixed(6)),
      startedAt: turn.startedAt,
      completedAt,
      isSubagent: subagent
    };

    try {
      await hooks.onReport(report);
    } catch (err: any) {
      logWarn(`[鱼鱼API] 回合汇报回调失败: ${err?.message || String(err)}`);
    }
  }

  function observe(session: any, event: any) {
    if (disposed || !event || typeof event.type !== 'string') return;

    const state = stateOf(session);
    if (!state) return;

    const subagent = isSubagentSession(session);
    const data = event.data || {};
    const eventTime = Number(event.time) > 0 ? Number(event.time) : Date.now();

    switch (event.type) {
      case 'session/title': {
        const title = cleanTitle(data.title);
        if (title) state.title = title;
        break;
      }
      case 'user/message': {
        if (!state.firstUserText && data.source?.kind === 'user') {
          state.firstUserText = textOfMessage(data.content);
        }
        break;
      }
      case 'turn/start': {
        const turnNumber = Number(data.turn);
        if (Number.isFinite(turnNumber) && turnNumber > 0) {
          startTurn(state, turnNumber, eventTime);
        }
        break;
      }
      case 'assistant/message': {
        const turnNumber = Number(data.turn);
        // 缺少 turn/start（例如插件中途加载）时就地补一个轮次状态
        if (!state.turn || (Number.isFinite(turnNumber) && turnNumber !== state.turn.number)) {
          if (state.turn) break;
          if (!Number.isFinite(turnNumber)) break;
          startTurn(state, turnNumber, eventTime);
        }
        const turn = state.turn;
        if (!turn) break;
        if (addUsage(turn.usage, data.usage)) turn.sawUsage = true;
        const source = data.message?.source;
        if (source?.kind === 'model') {
          if (typeof source.provider === 'string') turn.provider = source.provider;
          if (typeof source.model === 'string') turn.model = source.model;
        }
        break;
      }
      case 'turn/end': {
        const turn = state.turn;
        if (!turn) break;
        const turnNumber = Number(data.turn);
        if (Number.isFinite(turnNumber) && turnNumber !== turn.number) break;
        state.turn = null;

        const reason = String(data.reason?.kind || 'completed');
        if (!REPORTABLE_REASONS.has(reason)) break;
        // 没有任何 usage 的空轮次不值得打扰用户
        if (!turn.sawUsage) break;

        const captured = turn;
        state.chain = state.chain
          .then(() => finalizeTurn(state, captured, eventTime, reason, subagent))
          .catch((err) => {
            logWarn(`[鱼鱼API] 会话用量汇报失败: ${err?.message || String(err)}`);
          });
        break;
      }
      default:
        break;
    }
  }

  /** 会话销毁时清掉累计，避免长期运行内存膨胀 */
  function forget(session: any) {
    const id = String(session?.id || '').trim();
    if (id) sessions.delete(id);
  }

  return {
    observe,
    forget,
    dispose() {
      disposed = true;
      sessions.clear();
    }
  };
}

export type SessionTracker = ReturnType<typeof createSessionTracker>;
