/**
 * 鱼鱼 API 数据类型定义 + 本插件的运行期配置 / 汇报类型
 */
export interface UserProfile {
    id: number;
    email: string;
    username: string;
    role: string;
    balance: number;
    frozen_balance: number;
    total_recharged: number;
    status: string;
    concurrency: number;
    rpm_limit: number;
    /** 服务端记录的最后更新时间（余额变化的权威依据） */
    updated_at?: string;
    /** 服务端记录的最后活跃时间 */
    last_active_at?: string;
}
export interface UsageStats {
    total_api_keys: number;
    active_api_keys: number;
    total_requests: number;
    total_tokens: number;
    total_cost: number;
    total_actual_cost: number;
    today_requests: number;
    today_tokens: number;
    today_cost: number;
    today_actual_cost: number;
    today_balance_cost?: number;
    today_input_tokens: number;
    today_output_tokens: number;
    rpm?: number;
    tpm?: number;
}
export interface ApiKeyItem {
    id: number;
    name: string;
    key: string;
    group_id: number;
    status: string;
    quota: number;
    quota_used: number;
    group?: {
        id: number;
        name: string;
        platform: string;
        rate_multiplier: number;
    };
}
export interface BalanceSnapshot {
    success: boolean;
    timestamp: number;
    /** 本次真实请求完成时刻（服务端可用数据的最早时间），用于区分“已同步”与“渲染时刻” */
    fetchedAt?: number;
    /** 服务端 balance.updated_at（每次请求都会被刷新，仅作参考） */
    serverUpdatedAt?: string;
    email: string;
    balance: number;
    frozenBalance: number;
    totalRecharged: number;
    todayCost: number;
    todayRawCost: number;
    todayTokens: number;
    todayRequests: number;
    totalRequests: number;
    totalActualCost: number;
    keysCount: number;
    keysSummary: string[];
    isLowBalance: boolean;
    alertThreshold: number;
    formattedText: string;
    error?: string;
}
export type RefreshInterval = '1s' | '5s' | '30s' | '1m' | '5m';
/** 一轮会话中由 DSH 上报的 Token 明细 */
export interface TokenUsageTotals {
    /** 未命中缓存的输入 Token */
    inputTokens: number;
    /** 输出 Token（DSH 保证 reasoningTokens ⊆ outputTokens） */
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    /** 仅作展示：已包含在 outputTokens 内，不参与总量累加 */
    reasoningTokens: number;
    /** 计费口径总量 = input + output + cacheRead + cacheWrite */
    totalTokens: number;
}
/** 单轮会话完成后的 Token / 额度汇报 */
export interface TurnUsageReport {
    /** `${sessionId}:${turn}`，用于前端去重 */
    id: string;
    sessionId: string;
    sessionTitle: string;
    turn: number;
    /** turn/end 的 reason.kind */
    reason: string;
    provider?: string;
    model?: string;
    tokens: TokenUsageTotals;
    /** 本轮对应额度消耗（鱼鱼API 以 USD 计费） */
    quota: number;
    /**
     * actual    = 由今日消耗/余额差额直接得到
     * estimated = 用今日平均单价按 Token 数估算
     * unavailable = 无法取得（如刷新失败）
     */
    quotaSource: 'actual' | 'estimated' | 'unavailable';
    /** 估算时使用的每百万 Token 单价（$） */
    quotaRatePerMillion?: number;
    balanceBefore?: number;
    balanceAfter?: number;
    todayCostBefore?: number;
    todayCostAfter?: number;
    sessionTokens: number;
    sessionQuota: number;
    startedAt: number;
    completedAt: number;
    /** 是否来自子智能体会话（默认不弹通知） */
    isSubagent?: boolean;
}
/** 浮窗位置（视口坐标 + 吸附边缘） */
export interface WidgetPosition {
    x: number;
    y: number;
    edge: 'left' | 'right' | 'free';
}
/** 用户偏好（持久化在 yuyu-config.json） */
export interface PluginPreferences {
    /** 会话任务完成后弹 Windows 原生通知 */
    notifyOnComplete: boolean;
    /** 通知音：Windows 官方音效名，或 'none' 表示静音 */
    notifySound: string;
    /** 子智能体完成时不提示 */
    notifySubagentMute: boolean;
    /** 失败/中止的轮次也提示 */
    notifyOnFailure: boolean;
    /** 仅当 DSH 窗口不在前台时才提示 */
    notifyOnlyWhenUnfocused: boolean;
    /** 每轮完成后在浮窗里汇报 Token / 额度 */
    reportOnComplete: boolean;
    /** 自动检查插件更新 */
    updateCheck: boolean;
    /** Cloudflare 边缘更新源根地址，如 https://xxx.pages.dev */
    updateFeedUrl: string;
    /** GitHub 仓库 owner/repo */
    githubRepo: string;
    /** 自动检查间隔（小时） */
    updateCheckIntervalHours: number;
    /** 浮窗位置（前端写回，供多窗口/重载后恢复） */
    widgetPosition?: WidgetPosition | null;
}
/** 更新检查结果 */
export interface UpdateInfo {
    available: boolean;
    currentVersion: string;
    latestVersion?: string;
    releaseUrl?: string;
    downloadUrl?: string;
    fileSize?: number;
    sha256?: string;
    notes?: string;
    publishedAt?: string;
    checkedAt: number;
    /** feed = Cloudflare 边缘；github-release / github-tag / github-manifest = GitHub 直连 */
    source?: string;
    error?: string;
}
export interface PluginConfig {
    /** 鱼鱼API 网页登录 Auth Token (JWT) */
    token: string;
    /** 定时刷新频率 (预设：30秒、1分钟、3分钟、5分钟) */
    refreshInterval: RefreshInterval;
    /** 低额警示阈值（单位：$，默认 2.00） */
    alertThreshold: number;
    /** API 基础服务地址，默认 https://sub.anzhiyu.com */
    baseUrl?: string;
    /** 会话任务完成后是否弹 Windows 原生通知 */
    notifyOnComplete?: boolean;
    /** 通知音（Windows 官方音效名 / 'none'） */
    notifySound?: string;
    /** 子智能体完成时不提示 */
    notifySubagentMute?: boolean;
    /** 失败/中止的轮次也提示 */
    notifyOnFailure?: boolean;
    /** 仅当 DSH 未在前台时提示 */
    notifyOnlyWhenUnfocused?: boolean;
    /** 每轮完成后在浮窗里汇报 */
    reportOnComplete?: boolean;
    /** 是否自动检查插件更新 */
    updateCheck?: boolean;
    /** Cloudflare 边缘更新源根地址 */
    updateFeedUrl?: string;
    /** GitHub 仓库 owner/repo */
    githubRepo?: string;
    /** 自动检查间隔（小时） */
    updateCheckIntervalHours?: number;
    /** 浮窗位置（由前端写回，后端转发给其他窗口） */
    widgetPosition?: WidgetPosition | null;
}
