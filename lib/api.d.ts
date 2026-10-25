import { UserProfile, UsageStats, ApiKeyItem, BalanceSnapshot } from './types.js';
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
