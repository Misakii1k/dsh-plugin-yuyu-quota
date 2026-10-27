import { UserProfile, UsageStats, ApiKeyItem, BalanceSnapshot } from './types.js';

const DEFAULT_BASE_URL = 'https://sub.anzhiyu.com';

/**
 * 带 HTTP 状态码的 API 错误。
 *
 * 为什么需要它：早期版本把 401 包成普通 Error，而 `getBalanceSnapshot` 又把所有异常
 * catch 成 `{success:false}`，导致「凭据过期」这个最重要的信号在链路里彻底丢失 ——
 * 自动续期永远等不到 401，只能靠「提前 5 分钟」这一个时机。
 * 现在用结构化字段传递状态，续期判断不再依赖中英文消息文本。
 */
export class YuyuApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly reason?: string;

  constructor(message: string, status = 0, code?: number, reason?: string) {
    super(message);
    this.name = 'YuyuApiError';
    this.status = status;
    this.code = code;
    this.reason = reason;
  }

  /** 是否为「凭据无效」类错误（可以尝试 refresh 续期） */
  get isUnauthorized(): boolean {
    return this.status === 401
      || this.status === 403
      || this.reason === 'REFRESH_TOKEN_INVALID'
      || this.code === 401;
  }
}

/**
 * 鱼鱼 API 客户端封装
 */
export class YuyuApiClient {
  private baseUrl: string;
  private token: string;

  constructor(token: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.token = token.trim();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public updateToken(token: string) {
    this.token = token.trim();
  }

  public updateBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.token) {
      throw new YuyuApiError('未配置鱼鱼API Auth Token，请在插件配置中填入', 401, undefined, 'NO_TOKEN');
    }

    const url = `${this.baseUrl}/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'User-Agent': 'DSH-Plugin-Yuyu-Quota/1.2.0',
      ...(options.headers as Record<string, string> || {})
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

    const json = await res.json() as { code?: number; message?: string; data?: T; reason?: string };
    if (json.code !== undefined && json.code !== 0) {
      throw new YuyuApiError(
        json.message || `接口返回业务错误码: ${json.code}`,
        json.code === 401 ? 401 : 200,
        json.code,
        json.reason
      );
    }

    return (json.data !== undefined ? json.data : json) as T;
  }

  /**
   * 获取用户资料与账户钱包余额
   */
  public async getProfile(): Promise<UserProfile> {
    return this.request<UserProfile>('/user/profile');
  }

  /**
   * 获取今日及历史用量统计
   */
  public async getUsageStats(): Promise<UsageStats> {
    return this.request<UsageStats>('/usage/dashboard/stats');
  }

  /**
   * 获取名下已创建的 API Key 列表
   */
  public async getKeys(page = 1, pageSize = 50): Promise<{ items: ApiKeyItem[]; total: number }> {
    return this.request<{ items: ApiKeyItem[]; total: number }>(`/keys?page=${page}&page_size=${pageSize}`);
  }

  /**
   * 获取完整余额与用量快照（用于状态栏和 Agent Tool）
   */
  public async getBalanceSnapshot(alertThreshold = 2.0): Promise<BalanceSnapshot> {
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
    } catch (err: any) {
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
        formattedText: `[错误] 查询鱼鱼API余额失败: ${err?.message || err}`,
        error: err?.message || String(err),
        // 结构化标记：上层据此决定是否走 refresh 续期，而不是猜错误文本
        unauthorized,
        errorStatus: err instanceof YuyuApiError ? err.status : undefined
      };
    }
  }
}
