import { YuyuApiClient } from './api.js';
/**
 * 鱼鱼API 的凭据续期。
 *
 * 背景（实测于 sub.anzhiyu.com 线上接口）：
 * - access token（网页 localStorage 里的 `auth_token`）是 JWT，有效期约 24 小时；
 *   过期后所有 /api/v1 请求返回 401 —— 这就是「1~2 天就要重新获取 Token」的原因。
 * - 网页端同时还存了 `refresh_token`（`rt_` + 64 hex）与 `token_expires_at`；
 *   调用 `POST /api/v1/auth/refresh { refresh_token }` 会返回新的
 *   `{ access_token, refresh_token, expires_in }`。
 * - **刷新会轮换 refresh token**：同一枚 refresh token 只能用一次，用第二次返回
 *   `401 REFRESH_TOKEN_INVALID`。因此写回必须是原子的，且必须留住新的 rt_。
 *
 * 本模块做的事：
 * 1. 记住每个账号的 refresh token，临近过期前主动续期；
 * 2. 遇到 401 时被动续期一次再重试；
 * 3. 续期失败则回落到「重新扫描浏览器」，拿到网页端最新写入的凭据；
 * 4. 全程把新 refresh token 持久化，实现尽可能长久的免重新登录。
 */
export interface RefreshCredentials {
    accessToken: string;
    refreshToken: string;
    /** access token 过期时刻（ms），由 expires_in 或 JWT 的 exp 推导 */
    accessTokenExpiresAt?: number;
    /** refresh token 过期时刻（ms），未知则 undefined */
    refreshTokenExpiresAt?: number;
}
export interface RefreshAttemptResult {
    ok: boolean;
    credentials?: RefreshCredentials;
    /** 失败原因分类，供上层决定是否回落浏览器扫描 */
    reason?: 'invalid' | 'network' | 'server' | 'empty';
    message?: string;
}
/** 把 JWT 的 exp 解析成毫秒时间戳 */
export declare function jwtExpiry(token: string): number | undefined;
/** JWT 是否已过期（带 skew 容差，默认提前 60 秒视为过期） */
export declare function isTokenExpired(token: string, skewMs?: number): boolean;
/**
 * 用 refresh token 换一对新凭据。
 *
 * 注意：**不要并发调用**。refresh token 是一次性的，两个并发请求会有一个必定失败，
 * 甚至可能让服务端作废整条会话链。上层（YuyuCredentials）已做串行化。
 */
export declare function refreshWithToken(refreshToken: string, baseUrl?: string, timeoutMs?: number): Promise<RefreshAttemptResult>;
/** 管理器内部读写凭据时用的形状（与 types.ts 的 AccountCredentials 结构一致） */
export interface StoredCredentials {
    email: string;
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    refreshTokenExpiresAt?: number;
}
export interface CredentialManagerHooks {
    /** 读取账号当前凭据 */
    get: (email: string) => StoredCredentials | undefined;
    /** 写回续期后的凭据（必须持久化） */
    set: (credentials: StoredCredentials) => void;
    /** 续期彻底失败时的兜底：重新去浏览器捞一份 */
    recoverFromBrowser?: () => Promise<StoredCredentials | null>;
    logger?: {
        info?: (msg: string) => void;
        warn?: (msg: string) => void;
    };
}
/**
 * 判断一个错误/失败快照是否表示「凭据无效」。
 *
 * 优先看结构化字段（YuyuApiError.status / snapshot.unauthorized），
 * 只有拿不到结构化信息时才回退到文本匹配 —— 依赖错误文案是最脆弱的判断方式。
 */
export declare function isUnauthorizedLike(err: any): boolean;
/**
 * 凭据管理器：把「何时续期、如何串行、失败怎么办」收敛到一处。
 *
 * 为什么需要串行：refresh token 一次性，重复使用会让会话失效。
 * 同一账号同时最多只有一个刷新在飞，其余调用共享同一个 Promise。
 */
export declare function createCredentialManager(hooks: CredentialManagerHooks, baseUrl?: string): {
    ensureFresh: (email: string, force?: boolean) => Promise<string | null>;
    withRetry: <T>(email: string, run: (token: string) => Promise<T>) => Promise<T>;
    warmUp: (emails: string[]) => Promise<void>;
    /** 供测试/诊断：当前是否有刷新在飞 */
    isRefreshing: (email: string) => boolean;
};
export type CredentialManager = ReturnType<typeof createCredentialManager>;
/**
 * 让 YuyuApiClient 在每次请求前自动带最新 token。
 * 不改变 YuyuApiClient 的既有 API，避免影响其他调用点。
 */
export declare function applyTokenToClient(client: YuyuApiClient, token: string): void;
