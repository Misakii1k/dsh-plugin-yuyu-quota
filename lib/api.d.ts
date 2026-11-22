import { UserProfile, UsageStats, ApiKeyItem, BalanceSnapshot, CurrencyRate } from './types.js';
import { YuyuSiteId } from './sites.js';
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
    /** 账号所属站点（仅用于展示；请求地址仍以 baseUrl 为准） */
    private site;
    /**
     * 汇率请求缓存。余额默认 30 秒刷新一次，汇率报价通常变化更慢；
     * 缓存 60 秒既能跟上报价，又不会给公开端点增加一倍请求量。
     */
    private currencyRateCache;
    constructor(token: string, baseUrl?: string, site?: YuyuSiteId);
    updateToken(token: string): void;
    updateBaseUrl(baseUrl: string): void;
    updateSite(site: YuyuSiteId): void;
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
     * 获取新站的人民币展示汇率（1 USD = N CNY）。
     *
     * 旧站没有这个端点（实测 404）；非新站直接返回 null，不发出请求。
     * 汇率只是展示口径，请求失败绝不能连累余额快照。
     */
    getCurrencyRate(force?: boolean): Promise<CurrencyRate | null>;
    /**
     * 获取完整余额与用量快照（用于状态栏和 Agent Tool）
     */
    getBalanceSnapshot(alertThreshold?: number): Promise<BalanceSnapshot>;
}
