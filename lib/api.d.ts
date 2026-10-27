import { UserProfile, UsageStats, ApiKeyItem, BalanceSnapshot } from './types.js';
/**
 * 带 HTTP 状态码的 API 错误。
 *
 * 为什么需要它：早期版本把 401 包成普通 Error，而 `getBalanceSnapshot` 又把所有异常
 * catch 成 `{success:false}`，导致「凭据过期」这个最重要的信号在链路里彻底丢失 ——
 * 自动续期永远等不到 401，只能靠「提前 5 分钟」这一个时机。
 * 现在用结构化字段传递状态，续期判断不再依赖中英文消息文本。
 */
export declare class YuyuApiError extends Error {
    readonly status: number;
    readonly code?: number;
    readonly reason?: string;
    constructor(message: string, status?: number, code?: number, reason?: string);
    /** 是否为「凭据无效」类错误（可以尝试 refresh 续期） */
    get isUnauthorized(): boolean;
}
/**
 * 鱼鱼 API 客户端封装
 */
export declare class YuyuApiClient {
    private baseUrl;
    private token;
    constructor(token: string, baseUrl?: string);
    updateToken(token: string): void;
    updateBaseUrl(baseUrl: string): void;
    private request;
    /**
     * 获取用户资料与账户钱包余额
     */
    getProfile(): Promise<UserProfile>;
    /**
     * 获取今日及历史用量统计
     */
    getUsageStats(): Promise<UsageStats>;
    /**
     * 获取名下已创建的 API Key 列表
     */
    getKeys(page?: number, pageSize?: number): Promise<{
        items: ApiKeyItem[];
        total: number;
    }>;
    /**
     * 获取完整余额与用量快照（用于状态栏和 Agent Tool）
     */
    getBalanceSnapshot(alertThreshold?: number): Promise<BalanceSnapshot>;
}
