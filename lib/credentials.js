const DEFAULT_BASE_URL = 'https://sub.anzhiyu.com';
/** 把 JWT 的 exp 解析成毫秒时间戳 */
export function jwtExpiry(token) {
    try {
        const parts = String(token || '').split('.');
        if (parts.length !== 3)
            return undefined;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (typeof payload?.exp !== 'number')
            return undefined;
        return payload.exp * 1000;
    }
    catch {
        return undefined;
    }
}
/** JWT 是否已过期（带 skew 容差，默认提前 60 秒视为过期） */
export function isTokenExpired(token, skewMs = 60_000) {
    const exp = jwtExpiry(token);
    if (!exp)
        return true;
    return exp - skewMs <= Date.now();
}
/**
 * 用 refresh token 换一对新凭据。
 *
 * 注意：**不要并发调用**。refresh token 是一次性的，两个并发请求会有一个必定失败，
 * 甚至可能让服务端作废整条会话链。上层（YuyuCredentials）已做串行化。
 */
export async function refreshWithToken(refreshToken, baseUrl = DEFAULT_BASE_URL, timeoutMs = 12_000) {
    const rt = String(refreshToken || '').trim();
    if (!/^rt_[0-9a-f]{16,}$/i.test(rt)) {
        return { ok: false, reason: 'empty', message: '没有可用的 refresh token' };
    }
    const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${base}/api/v1/auth/refresh`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'DSH-Plugin-Yuyu-Quota/1.2.0'
            },
            body: JSON.stringify({ refresh_token: rt })
        });
        if (response.status === 401 || response.status === 400) {
            return { ok: false, reason: 'invalid', message: 'refresh token 已失效' };
        }
        if (!response.ok) {
            return { ok: false, reason: 'server', message: `刷新接口返回 HTTP ${response.status}` };
        }
        const json = await response.json();
        if (json?.code !== undefined && json.code !== 0) {
            const invalid = /REFRESH_TOKEN_INVALID|invalid refresh token/i.test(String(json.message || ''));
            return {
                ok: false,
                reason: invalid ? 'invalid' : 'server',
                message: json.message || `刷新失败（code=${json.code}）`
            };
        }
        const data = json?.data || json;
        const accessToken = String(data?.access_token || '').trim();
        if (!accessToken) {
            return { ok: false, reason: 'server', message: '刷新响应缺少 access_token' };
        }
        const expiresIn = Number(data?.expires_in);
        const accessTokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
            ? Date.now() + expiresIn * 1000
            : jwtExpiry(accessToken);
        // 服务端通常会轮换 refresh token；没给就继续用旧的
        const nextRefresh = String(data?.refresh_token || '').trim() || rt;
        const refreshExpiresRaw = Number(data?.refresh_token_expires_at);
        const refreshTokenExpiresAt = Number.isFinite(refreshExpiresRaw) && refreshExpiresRaw > 0
            ? (refreshExpiresRaw > 1e12 ? refreshExpiresRaw : refreshExpiresRaw * 1000)
            : undefined;
        return {
            ok: true,
            credentials: {
                accessToken,
                refreshToken: nextRefresh,
                accessTokenExpiresAt,
                refreshTokenExpiresAt
            }
        };
    }
    catch (err) {
        const aborted = err?.name === 'AbortError';
        return {
            ok: false,
            reason: 'network',
            message: aborted ? '刷新请求超时' : (err?.message || String(err))
        };
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * 判断一个错误/失败快照是否表示「凭据无效」。
 *
 * 优先看结构化字段（YuyuApiError.status / snapshot.unauthorized），
 * 只有拿不到结构化信息时才回退到文本匹配 —— 依赖错误文案是最脆弱的判断方式。
 */
export function isUnauthorizedLike(err) {
    if (!err)
        return false;
    // 快照对象（getBalanceSnapshot 的返回值）
    if (err.unauthorized === true)
        return true;
    if (typeof err.errorStatus === 'number' && (err.errorStatus === 401 || err.errorStatus === 403))
        return true;
    // 异常对象（YuyuApiError 或普通 Error）
    if (typeof err.status === 'number' && (err.status === 401 || err.status === 403))
        return true;
    if (err.isUnauthorized === true)
        return true;
    // 兜底：文本匹配（保持与历史行为兼容，但放最后）
    const text = String(err.message || err.error || err || '');
    return /401|403|未授权|已失效|unauthorized/i.test(text);
}
/**
 * 凭据管理器：把「何时续期、如何串行、失败怎么办」收敛到一处。
 *
 * 为什么需要串行：refresh token 一次性，重复使用会让会话失效。
 * 同一账号同时最多只有一个刷新在飞，其余调用共享同一个 Promise。
 */
export function createCredentialManager(hooks, baseUrl = DEFAULT_BASE_URL) {
    const inflight = new Map();
    /** 续期成功但还没来得及验证的时刻，避免短时间反复刷 */
    const lastRefreshAt = new Map();
    const REFRESH_COOLDOWN_MS = 30_000;
    const log = (level, message) => {
        try {
            hooks.logger?.[level]?.(message);
        }
        catch {
            // 日志失败不影响主流程
        }
    };
    /**
     * 在真正需要时才续期。返回可用的 access token；无法续期返回 null。
     */
    async function ensureFresh(email, force = false) {
        const current = hooks.get(email);
        if (!current?.accessToken) {
            return await doRefresh(email, 'missing-token');
        }
        const expiresAt = current.accessTokenExpiresAt || jwtExpiry(current.accessToken);
        const now = Date.now();
        // 提前 5 分钟续期，避免「刚好在请求中途过期」
        const refreshAheadMs = 5 * 60 * 1000;
        if (!force && expiresAt && expiresAt - refreshAheadMs > now) {
            return current.accessToken;
        }
        if (!force && !expiresAt) {
            // 解析不出 exp 的 token 直接尝试用，401 时再被动续期
            return current.accessToken;
        }
        const recent = lastRefreshAt.get(email) || 0;
        if (!force && now - recent < REFRESH_COOLDOWN_MS) {
            // 刚刷过还在冷却期：把当前 token 交出去，让 401 路径兜底
            return current.accessToken;
        }
        return await doRefresh(email, 'expiring');
    }
    async function doRefresh(email, trigger) {
        const existing = inflight.get(email);
        if (existing) {
            const shared = await existing;
            return shared?.accessToken || null;
        }
        const task = (async () => {
            const current = hooks.get(email);
            const rt = current?.refreshToken;
            if (!rt) {
                log('warn', `[鱼鱼API] ${email} 没有 refresh token，尝试从浏览器恢复凭据`);
                return await recover(email);
            }
            const result = await refreshWithToken(rt, baseUrl);
            if (result.ok && result.credentials) {
                const next = {
                    email,
                    accessToken: result.credentials.accessToken,
                    refreshToken: result.credentials.refreshToken,
                    accessTokenExpiresAt: result.credentials.accessTokenExpiresAt,
                    refreshTokenExpiresAt: result.credentials.refreshTokenExpiresAt
                };
                hooks.set(next);
                lastRefreshAt.set(email, Date.now());
                const hours = next.accessTokenExpiresAt
                    ? ((next.accessTokenExpiresAt - Date.now()) / 3_600_000).toFixed(1)
                    : '?';
                log('info', `[鱼鱼API] ${email} 凭据已自动续期（触发=${trigger}，新 token 有效期约 ${hours} 小时）`);
                return next;
            }
            log('warn', `[鱼鱼API] ${email} 续期失败（${result.reason}: ${result.message}），尝试从浏览器恢复`);
            // invalid 表示这条会话链已废，必须换一份；network/server 也顺手试一下浏览器
            return await recover(email);
        })()
            .catch((err) => {
            log('warn', `[鱼鱼API] 续期异常: ${err?.message || String(err)}`);
            return null;
        })
            .finally(() => {
            inflight.delete(email);
        });
        inflight.set(email, task);
        const done = await task;
        return done?.accessToken || null;
    }
    async function recover(email) {
        if (!hooks.recoverFromBrowser)
            return null;
        try {
            const found = await hooks.recoverFromBrowser();
            if (!found || !found.accessToken)
                return null;
            // 只接受同一账号的凭据，避免把 A 账号的 token 写到 B 上
            if (found.email && email && found.email !== email) {
                log('warn', `[鱼鱼API] 浏览器里最新登录的是 ${found.email}，与 ${email} 不一致，未覆盖`);
                return null;
            }
            hooks.set(found);
            lastRefreshAt.set(email, Date.now());
            log('info', `[鱼鱼API] 已从浏览器恢复 ${email} 的凭据`);
            return found;
        }
        catch (err) {
            log('warn', `[鱼鱼API] 浏览器恢复失败: ${err?.message || String(err)}`);
            return null;
        }
    }
    /**
     * 带自动续期的请求包装：401 时强制续期并重试一次。
     *
     * 注意：`run` 返回的可能是「失败的快照对象」而不是抛错
     * （getBalanceSnapshot 就是如此）。所以除了 catch，
     * 还要检查返回值的 unauthorized 标记 —— 否则凭据失效时永远不会续期。
     */
    async function withRetry(email, run) {
        let token = await ensureFresh(email);
        if (!token) {
            const current = hooks.get(email);
            token = current?.accessToken || '';
        }
        if (!token) {
            throw new Error('没有可用的登录凭据，请在浏览器登录 sub.anzhiyu.com 后点击「从浏览器同步」');
        }
        const shouldRefreshAndRetry = (value) => isUnauthorizedLike(value);
        try {
            const result = await run(token);
            // 失败快照：凭据无效时同样要走续期
            if (shouldRefreshAndRetry(result)) {
                log('warn', `[鱼鱼API] ${email} 返回未授权结果，强制续期后重试`);
                const refreshed = await doRefresh(email, 'unauthorized-result');
                if (refreshed)
                    return await run(refreshed);
            }
            return result;
        }
        catch (err) {
            if (!isUnauthorizedLike(err))
                throw err;
            log('warn', `[鱼鱼API] ${email} 收到未授权错误，强制续期后重试`);
            const refreshed = await doRefresh(email, '401');
            if (!refreshed)
                throw err;
            return await run(refreshed);
        }
    }
    /** 主动预热：启动时把所有账号的凭据都续到新鲜状态 */
    async function warmUp(emails) {
        for (const email of emails) {
            try {
                await ensureFresh(email);
            }
            catch {
                // 单个账号失败不影响其他账号
            }
        }
    }
    return {
        ensureFresh,
        withRetry,
        warmUp,
        /** 供测试/诊断：当前是否有刷新在飞 */
        isRefreshing: (email) => inflight.has(email)
    };
}
/**
 * 让 YuyuApiClient 在每次请求前自动带最新 token。
 * 不改变 YuyuApiClient 的既有 API，避免影响其他调用点。
 */
export function applyTokenToClient(client, token) {
    client.updateToken(token);
}
