export interface SyncResult {
    success: boolean;
    browser?: string;
    token?: string;
    email?: string;
    balance?: number;
    message?: string;
    needsLogin?: boolean;
}
/**
 * 寻找本地已安装的浏览器可执行文件
 */
export declare function getAvailableBrowserExecutables(): string[];
/**
 * 智能扫描运行中的所有 Chromium 浏览器活动标签页并提取凭证
 */
export declare function scanRunningBrowsersForToken(): Promise<SyncResult>;
/**
 * 调起独立登录窗口并自动捕获凭据
 */
export declare function launchAndCaptureToken(timeoutMs?: number): Promise<SyncResult>;
