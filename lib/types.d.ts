/**
 * 鱼鱼 API 数据类型定义
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
export type RefreshInterval = '30s' | '1m' | '3m' | '5m';
export interface PluginConfig {
    /** 鱼鱼API 网页登录 Auth Token (JWT) */
    token: string;
    /** 定时刷新频率 (预设：30秒、1分钟、3分钟、5分钟) */
    refreshInterval: RefreshInterval;
    /** 低额警示阈值（单位：$，默认 2.00） */
    alertThreshold: number;
    /** API 基础服务地址，默认 https://sub.anzhiyu.com */
    baseUrl?: string;
}
