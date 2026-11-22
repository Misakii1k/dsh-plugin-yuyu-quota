import { DEFAULT_SITE, siteBaseUrl, siteInfo, normalizeSiteId } from './sites.js';
const DEFAULT_BASE_URL = siteBaseUrl(DEFAULT_SITE);
/**
 * 带 HTTP 状态码的 API 错误。
 *
 * 为什么需要它：早期版本把 401 包成普通 Error，而 `getBalanceSnapshot` 又把所有异常
 * catch 成 `{success:false}`，导致「凭据过期」这个最重要的信号在链路里彻底丢失 ——
 * 自动续期永远等不到 401，只能靠「提前 5 分钟」这一个时机。
 * 现在用结构化字段传递状态，续期判断不再依赖中英文消息文本。
 */
export class YuyuApiError extends Error {
    status;
    code;
    reason;
    constructor(message, status = 0, code, reason) {
        super(message);
        this.name = 'YuyuApiError';
        this.status = status;
        this.code = code;
        this.reason = reason;
    }
    /** 是否为「凭据无效」类错误（可以尝试 refresh 续期） */
    get isUnauthorized() {
        return this.status === 401
            || this.status === 403
            || this.reason === 'REFRESH_TOKEN_INVALID'
            || this.code === 401;
    }
}
/**
 * 把接口里的时间字段统一成毫秒时间戳。
 * 兼容 ISO 字符串、秒级数字和毫秒级数字；无法解析时返回 undefined。
 */
function parseTimeMs(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === 'string' && value.trim()) {
        const numeric = Number(value);
        if (Number.isFinite(numeric))
            return numeric < 1e12 ? numeric * 1000 : numeric;
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
/**
 * 鱼鱼 API 客户端封装
 */
export class YuyuApiClient {
    baseUrl;
    token;
    /** 账号所属站点（仅用于展示；请求地址仍以 baseUrl 为准） */
    site;
    /**
     * 汇率请求缓存。余额默认 30 秒刷新一次，汇率报价通常变化更慢；
     * 缓存 60 秒既能跟上报价，又不会给公开端点增加一倍请求量。
     */
    currencyRateCache = null;
    constructor(token, baseUrl = DEFAULT_BASE_URL, site) {
        this.token = token.trim();
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.site = normalizeSiteId(site) || DEFAULT_SITE;
    }
    updateToken(token) {
        this.token = token.trim();
    }
    updateBaseUrl(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }
    updateSite(site) {
        this.site = normalizeSiteId(site) || DEFAULT_SITE;
    }
    async request(endpoint, options = {}) {
        if (!this.token) {
            throw new YuyuApiError('未配置鱼鱼API Auth Token，请在插件配置中填入', 401, undefined, 'NO_TOKEN');
        }
        const url = `${this.baseUrl}/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'User-Agent': 'DSH-Plugin-Yuyu-Quota/1.2.0',
            ...(options.headers || {})
        };
        const res = await fetch(url, {
            ...options,
            cache: 'no-store',
            headers
        });
        if (res.status === 401 || res.status === 403) {
            throw new YuyuApiError('鱼鱼API Auth Token 已失效或未授权，请检查凭证', res.status, 401, 'UNAUTHORIZED');
        }
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new YuyuApiError(`请求接口失败 (${res.status}): ${errText || res.statusText}`, res.status);
        }
        const json = await res.json();
        if (json.code !== undefined && json.code !== 0) {
            throw new YuyuApiError(json.message || `接口返回业务错误码: ${json.code}`, json.code === 401 ? 401 : 200, json.code, json.reason);
        }
        return (json.data !== undefined ? json.data : json);
    }
    /**
     * 获取用户资料与账户钱包余额
     */
    async getProfile() {
        return this.request('/user/profile');
    }
    /**
     * 获取今日及历史用量统计
     */
    async getUsageStats() {
        return this.request('/usage/dashboard/stats');
    }
    /**
     * 获取名下已创建的 API Key 列表
     */
    async getKeys(page = 1, pageSize = 50) {
        return this.request(`/keys?page=${page}&page_size=${pageSize}`);
    }
    /**
     * 获取新站的人民币展示汇率（1 USD = N CNY）。
     *
     * 旧站没有这个端点（实测 404）；非新站直接返回 null，不发出请求。
     * 汇率只是展示口径，请求失败绝不能连累余额快照。
     */
    async getCurrencyRate(force = false) {
        if (this.site !== 'www')
            return null;
        const cached = this.currencyRateCache;
        if (!force && cached) {
            const ttl = cached.value ? 60_000 : 30_000;
            if (Date.now() - cached.checkedAt < ttl)
                return cached.value;
        }
        try {
            const data = await this.request('/currency/rates');
            const rate = Number(data?.rate);
            if (!Number.isFinite(rate) || rate <= 0) {
                throw new YuyuApiError('汇率接口返回了无效的 rate', 200, undefined, 'INVALID_RATE');
            }
            const base = String(data?.base || '').toUpperCase();
            const quote = String(data?.quote || '').toUpperCase();
            if (base !== 'USD' || quote !== 'CNY') {
                throw new YuyuApiError(`汇率接口币种不符: ${base || '?'}→${quote || '?'}`, 200, undefined, 'UNSUPPORTED_RATE');
            }
            const value = {
                base: 'USD',
                quote: 'CNY',
                rate,
                quoteId: data?.quote_id === undefined ? undefined : String(data.quote_id),
                source: typeof data?.source === 'string' ? data.source : undefined,
                rateKind: typeof data?.rate_kind === 'string' ? data.rate_kind : undefined,
                fetchedAt: parseTimeMs(data?.fetched_at),
                refreshAfterMs: parseTimeMs(data?.refresh_after),
                validUntil: parseTimeMs(data?.valid_until),
                status: String(data?.status || '').toLowerCase() === 'stale' ? 'stale' : 'fresh'
            };
            this.currencyRateCache = { value, checkedAt: Date.now() };
            return value;
        }
        catch {
            // 缓存失败结果，避免每 30 秒对同一个故障端点重试；下一次余额刷新仍会重试
            this.currencyRateCache = { value: null, checkedAt: Date.now() };
            return null;
        }
    }
    /**
     * 获取完整余额与用量快照（用于状态栏和 Agent Tool）
     */
    async getBalanceSnapshot(alertThreshold = 2.0) {
        try {
            const [profile, stats, keysRes, rateRes] = await Promise.allSettled([
                this.getProfile(),
                this.getUsageStats(),
                this.getKeys(),
                this.getCurrencyRate()
            ]);
            const fetchedAt = Date.now();
            if (profile.status === 'rejected') {
                throw profile.reason;
            }
            const p = profile.value;
            const s = stats.status === 'fulfilled' ? stats.value : null;
            const k = keysRes.status === 'fulfilled' ? keysRes.value : null;
            const exchangeRate = rateRes.status === 'fulfilled' ? rateRes.value : null;
            const currencyError = this.site === 'www' && !exchangeRate ? '人民币汇率暂时不可用，已按美元展示' : undefined;
            const balance = Number(p.balance || 0);
            const isLowBalance = balance <= alertThreshold;
            const totalRecharged = Number(p.total_recharged || 0);
            // 注意：服务端 updated_at / last_active_at 会在每次 profile 请求时被刷新，
            // 无法用于判断“余额字段是否新鲜”，因此不据此推断 stale。
            const serverUpdatedAt = p.updated_at;
            const todayActualCost = Number(s?.today_actual_cost ?? s?.today_cost ?? 0);
            const todayRawCost = Number(s?.today_cost || 0);
            const todayTokens = Number(s?.today_tokens || 0);
            const todayRequests = Number(s?.today_requests || 0);
            const totalRequests = Number(s?.total_requests || 0);
            const totalActualCost = Number(s?.total_actual_cost || 0);
            const keysCount = Number(s?.active_api_keys || k?.items?.length || 0);
            const keysSummary = (k?.items || []).map(item => {
                const groupName = item.group?.name || '默认组';
                const platform = item.group?.platform || '通用';
                return `• [${item.name}] 绑定分组: ${groupName} (${platform}) - 状态: ${item.status === 'active' ? '正常' : '禁用'}`;
            });
            // 生成友好中文摘要（不使用 Emoji，使用原生徽标/文本标签）
            const statusTag = isLowBalance ? '[预警]' : '[正常]';
            const balanceWarning = isLowBalance ? ` (提示: 已低于设定的 $${alertThreshold.toFixed(2)} 预警阈值)` : '';
            const site = siteInfo(this.site);
            const lines = [
                `${statusTag} 鱼鱼API 账户状态`,
                `- 站点: ${site.name}`,
                `- 账号邮箱: ${p.email}`,
                `- 当前可用余额: $${balance.toFixed(2)}${balanceWarning}`,
                `- 冻结金额: $${Number(p.frozen_balance || 0).toFixed(2)}`,
                `- 累计充值: $${totalRecharged.toFixed(2)}`,
                `- 今日实扣消耗: $${todayActualCost.toFixed(4)} (原价 $${todayRawCost.toFixed(4)}，共消耗 ${todayTokens.toLocaleString()} Tokens，请求 ${todayRequests} 次)`,
                `- 近30天累计: 请求 ${totalRequests.toLocaleString()} 次，实扣 $${totalActualCost.toFixed(4)}`,
            ];
            if (keysSummary.length > 0) {
                lines.push(`- 关联密钥 (${keysSummary.length}个):`);
                lines.push(...keysSummary);
            }
            if (exchangeRate) {
                const cnyBalance = balance * exchangeRate.rate;
                const rateNote = exchangeRate.status === 'stale' ? '汇率略旧' : '实时汇率';
                lines.push(`- 人民币参考(展示口径): ¥${cnyBalance.toFixed(2)}（1 USD = ${exchangeRate.rate.toFixed(4)} CNY，${rateNote}）`);
            }
            else if (currencyError) {
                lines.push(`- 人民币参考: ${currencyError}`);
            }
            return {
                success: true,
                timestamp: fetchedAt,
                fetchedAt,
                serverUpdatedAt,
                site: this.site,
                email: p.email,
                balance,
                frozenBalance: Number(p.frozen_balance || 0),
                totalRecharged,
                todayCost: todayActualCost,
                todayRawCost,
                todayTokens,
                todayRequests,
                totalRequests,
                totalActualCost,
                keysCount,
                keysSummary,
                isLowBalance,
                alertThreshold,
                exchangeRate,
                currencyError,
                formattedText: lines.join('\n')
            };
        }
        catch (err) {
            const unauthorized = err instanceof YuyuApiError ? err.isUnauthorized : false;
            return {
                success: false,
                timestamp: Date.now(),
                email: '',
                balance: 0,
                frozenBalance: 0,
                totalRecharged: 0,
                todayCost: 0,
                todayRawCost: 0,
                todayTokens: 0,
                todayRequests: 0,
                totalRequests: 0,
                totalActualCost: 0,
                keysCount: 0,
                keysSummary: [],
                isLowBalance: true,
                alertThreshold,
                exchangeRate: null,
                formattedText: `[错误] 查询鱼鱼API余额失败: ${err?.message || err}`,
                error: err?.message || String(err),
                // 结构化标记：上层据此决定是否走 refresh 续期，而不是猜错误文本
                unauthorized,
                errorStatus: err instanceof YuyuApiError ? err.status : undefined
            };
        }
    }
}
