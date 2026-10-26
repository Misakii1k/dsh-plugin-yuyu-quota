import http from 'node:http';
import { YuyuApiClient } from './api.js';
import { PluginConfig, BalanceSnapshot, RefreshInterval, PluginPreferences, TurnUsageReport, UpdateInfo, WidgetPosition } from './types.js';
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
}
/** 用户偏好的出厂默认值 */
export declare function defaultPreferences(): PluginPreferences;
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
 * 创建多账号管理与 API 路由服务控制器
 */
export declare function createYuyuService(initialConfig?: Partial<PluginConfig>, logger?: any): {
    store: MultiAccountStore;
    client: YuyuApiClient;
    refreshAccount: (targetEmail?: string) => Promise<BalanceSnapshot | null>;
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
export * from './widget.js';
export * from './browser-sync.js';
export * from './session-tracker.js';
export * from './notify.js';
export * from './update.js';
