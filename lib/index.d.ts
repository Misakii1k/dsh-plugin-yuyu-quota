import http from 'node:http';
import { YuyuApiClient } from './api.js';
import { PluginConfig, BalanceSnapshot, RefreshInterval, PluginPreferences, TurnUsageReport, UpdateInfo, WidgetPosition, CredentialHealth } from './types.js';
export declare const name = "dsh-plugin-yuyu-quota";
/**
 * Cordis 的服务必须先在 inject 中声明，才能以属性形式访问（ctx.webServer /
 * ctx.tools）。未声明的属性访问会抛 `cannot get property "x" without inject`。
 * 这里对齐官方 bundle 插件（dsh-experimental-inspector、dsh-whale-widget）的写法，
 * 声明两个可选依赖；apply() 内部对每个服务仍做能力探测与 try/catch，
 * 单个能力缺失不会拖垮余额主链路。
 *
 * 注意：曾尝试写成 inject: [] 以求“绝不挂起”，结果反而使 webServer 与 tools
 * 双双不可解析（同源路由 404 + Agent 工具不出现），因此必须在此声明。
 */
export declare const inject: string[];
export declare const BRIDGE_PORT = 53788;
export declare const API_PREFIX = "/yuyu-quota/api";
export interface SavedAccount {
    email: string;
    token: string;
    balance: number;
    lastSyncedAt: string;
    snapshot?: BalanceSnapshot;
    /** 最近一次观察到“余额发生变化”的时刻（ISO） */
    balanceChangedAt?: string;
    /** 上一次观察到的 total_recharged，用于识别充值到账 */
    lastTotalRecharged?: number;
    /** refresh token（rt_xxx），用于 access token 过期后自动续期 */
    refreshToken?: string;
    /** access token 过期时刻（ms） */
    accessTokenExpiresAt?: number;
    /** refresh token 过期时刻（ms） */
    refreshTokenExpiresAt?: number;
    /** 最近一次成功续期的时刻（ms） */
    refreshedAt?: number;
}
export interface MultiAccountStore {
    activeEmail: string;
    lastBrowserIat: number;
    refreshInterval: RefreshInterval;
    alertThreshold: number;
    baseUrl: string;
    accounts: SavedAccount[];
    /** 通知 / 汇报 / 更新 / 浮窗等用户偏好 */
    preferences: PluginPreferences;
    /** 是否需要提示用户「凭据无法自动续期」 */
    credentialsDegraded?: boolean;
}
/** 用户偏好的出厂默认值 */
export declare function defaultPreferences(): PluginPreferences;
/** 解析音效名称对应的本地音频文件绝对路径 */
export declare function resolveSoundFilePath(soundKey?: string): string | undefined;
/**
 * 把任意外部输入收敛成合法偏好。
 * 只接受已知键，避免通过 HTTP 把任意字段写进配置文件。
 */
export declare function sanitizePreferences(input: any, base: PluginPreferences): PluginPreferences;
export declare function loadAccountStore(): MultiAccountStore;
export declare function saveAccountStore(store: MultiAccountStore): void;
/**
 * 收敛前端上报的浮窗位置。
 * 只接受有限数值与三种吸附状态，避免脏数据把浮窗推到屏幕外。
 */
export declare function normalizeWidgetPosition(input: any): WidgetPosition | null;
/**
 * 判断一个 Origin 是否允许访问本地桥接服务。
 *
 * 为什么不能继续用 `*`：桥接端口开在 127.0.0.1:53788 且允许任意 Origin 后，
 * 用户打开的**任意网页**都能 `fetch` 到这里修改偏好、触发更新下载安装 ——
 * 等于把本机文件写入能力暴露给了所有网站。
 *
 * 放行的来源：
 * - 无 Origin（同源请求、curl、DSH 自身的服务端渲染）；
 * - 本机回环地址（HTTP/HTTPS 任意端口，DSH Web GUI 就是其中之一）；
 * - dsh:// 自定义协议（桌面端唤起的页面）。
 */
export declare function isAllowedOrigin(origin: string | undefined): boolean;
/**
 * 创建多账号管理与 API 路由服务控制器
 */
export declare function createYuyuService(initialConfig?: Partial<PluginConfig>, logger?: any): {
    store: MultiAccountStore;
    client: YuyuApiClient;
    credentialManager: {
        ensureFresh: (email: string, force?: boolean) => Promise<string | null>;
        withRetry: <T>(email: string, run: (token: string) => Promise<T>) => Promise<T>;
        warmUp: (emails: string[]) => Promise<void>;
        isRefreshing: (email: string) => boolean;
    };
    refreshAccount: (targetEmail?: string, options?: {
        others?: boolean;
    }) => Promise<BalanceSnapshot | null>;
    syncFromBrowser: (forceCapture?: boolean, manualToken?: string, forceSwitch?: boolean) => Promise<{
        success: boolean;
        message: string;
        browser?: undefined;
        email?: undefined;
        balance?: undefined;
        snapshot?: undefined;
    } | {
        success: boolean;
        browser: string | undefined;
        email: string;
        balance: number;
        snapshot: BalanceSnapshot;
        message: string;
    } | {
        success: boolean;
        browser: string;
        email: string | undefined;
        balance: number | undefined;
        snapshot: BalanceSnapshot | null;
        message: string;
    }>;
    handleHttpRequest: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
    getActiveAccount: () => SavedAccount | undefined;
    buildCredentialHealth: () => CredentialHealth | null;
    setRefreshIntervalApplier: (fn: () => void) => void;
    /** 启动时预热所有账号凭据（失败的账号保持原样，不影响其他账号） */
    warmUpCredentials: () => Promise<void>;
    /** 卸载时补写未落盘的变更（节流写入器的收尾） */
    dispose: () => void;
    sessionTracker: {
        observe: (session: any, event: any) => void;
        forget: (session: any) => void;
        isAgentRunning: () => boolean;
        dispose(): void;
    };
    runUpdateCheck: (force?: boolean) => Promise<UpdateInfo>;
    recordTurnReport: (report: TurnUsageReport) => void;
    notifyTurnReport: (report: TurnUsageReport) => Promise<void>;
    getLastReport: () => TurnUsageReport | null;
    getLastReportSeq: () => number;
    getUpdateInfo: () => UpdateInfo | null;
};
/**
 * 启动本地免重启 CORS 桥接守护端口 (127.0.0.1:53788)
 */
export declare function startLocalBridgeServer(service: ReturnType<typeof createYuyuService>, port?: number): Promise<http.Server | null>;
export declare function apply(ctx: any, config?: Partial<PluginConfig>): void;
export * from './types.js';
export * from './api.js';
export * from './tool.js';
export * from './browser-sync.js';
export * from './session-tracker.js';
export * from './notify.js';
export * from './update.js';
export * from './credentials.js';
