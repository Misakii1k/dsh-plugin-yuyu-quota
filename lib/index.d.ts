import http from 'node:http';
import { YuyuApiClient } from './api.js';
import { PluginConfig, BalanceSnapshot, RefreshInterval } from './types.js';
export declare const name = "dsh-plugin-yuyu-quota";
export declare const inject: string[];
export declare const BRIDGE_PORT = 53788;
export declare const API_PREFIX = "/yuyu-quota/api";
export interface SavedAccount {
    email: string;
    token: string;
    balance: number;
    lastSyncedAt: string;
    snapshot?: BalanceSnapshot;
}
export interface MultiAccountStore {
    activeEmail: string;
    lastBrowserIat: number;
    refreshInterval: RefreshInterval;
    alertThreshold: number;
    baseUrl: string;
    accounts: SavedAccount[];
}
export declare function loadAccountStore(): MultiAccountStore;
export declare function saveAccountStore(store: MultiAccountStore): void;
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
