import { BalanceSnapshot, TurnUsageReport } from './types.js';
export interface UserPromptNotice {
    sessionId: string;
    sessionTitle: string;
    /** 触发弹窗的工具名（approval/asked 时为被审批的工具） */
    toolName: string;
    /** approval = 权限审批；question = 问答选项 / 计划确认 */
    kind: 'approval' | 'question';
    /** 上游给出的原因（如权限审批的 reason） */
    reason?: string;
    /** 同一请求的去重键 */
    requestId: string;
    isSubagent: boolean;
}
export interface SessionTrackerHooks {
    getCachedSnapshot: () => BalanceSnapshot | null;
    refreshSnapshot: () => Promise<BalanceSnapshot | null>;
    onReport: (report: TurnUsageReport) => void | Promise<void>;
    /** 出现「等你选择」的弹窗时回调（权限审批 / ask_user_question / 计划确认） */
    onUserPrompt?: (notice: UserPromptNotice) => void | Promise<void>;
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
    isAgentRunning: () => boolean;
    dispose(): void;
};
export type SessionTracker = ReturnType<typeof createSessionTracker>;
