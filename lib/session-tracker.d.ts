import { BalanceSnapshot, TurnUsageReport } from './types.js';
export interface SessionTrackerHooks {
    getCachedSnapshot: () => BalanceSnapshot | null;
    refreshSnapshot: () => Promise<BalanceSnapshot | null>;
    onReport: (report: TurnUsageReport) => void | Promise<void>;
    logger?: {
        warn?: (message: string) => void;
    };
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
export declare function createSessionTracker(hooks: SessionTrackerHooks): {
    observe: (session: any, event: any) => void;
    forget: (session: any) => void;
    dispose(): void;
};
export type SessionTracker = ReturnType<typeof createSessionTracker>;
