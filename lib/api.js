const DEFAULT_BASE_URL = 'https://sub.anzhiyu.com';
/**
 * 鱼鱼 API 客户端封装
 */
export class YuyuApiClient {
    baseUrl;
    token;
    constructor(token, baseUrl = DEFAULT_BASE_URL) {
        this.token = token.trim();
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }
    updateToken(token) {
        this.token = token.trim();
    }
    updateBaseUrl(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }
    async request(endpoint, options = {}) {
        if (!this.token) {
            throw new Error('未配置鱼鱼API Auth Token，请在插件配置中填入');
        }
        const url = `${this.baseUrl}/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'User-Agent': 'DSH-Plugin-Yuyu-Quota/1.0.10',
            ...(options.headers || {})
        };
        const res = await fetch(url, {
            ...options,
            cache: 'no-store',
            headers
        });
        if (res.status === 401) {
            throw new Error('鱼鱼API Auth Token 已失效或未授权，请检查凭证');
        }
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`请求接口失败 (${res.status}): ${errText || res.statusText}`);
        }
        const json = await res.json();
        if (json.code !== undefined && json.code !== 0) {
            throw new Error(json.message || `接口返回业务错误码: ${json.code}`);
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
     * 获取完整余额与用量快照（用于状态栏和 Agent Tool）
     */
    async getBalanceSnapshot(alertThreshold = 2.0) {
        try {
            const [profile, stats, keysRes] = await Promise.allSettled([
                this.getProfile(),
                this.getUsageStats(),
                this.getKeys()
            ]);
            const fetchedAt = Date.now();
            if (profile.status === 'rejected') {
                throw profile.reason;
            }
            const p = profile.value;
            const s = stats.status === 'fulfilled' ? stats.value : null;
            const k = keysRes.status === 'fulfilled' ? keysRes.value : null;
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
            const lines = [
                `${statusTag} 鱼鱼API 账户状态`,
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
            return {
                success: true,
                timestamp: fetchedAt,
                fetchedAt,
                serverUpdatedAt,
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
                formattedText: lines.join('\n')
            };
        }
        catch (err) {
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
                formattedText: `[错误] 查询鱼鱼API余额失败: ${err?.message || err}`,
                error: err?.message || String(err)
            };
        }
    }
}
