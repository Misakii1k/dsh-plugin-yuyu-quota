export interface DiscoveredToken {
    email: string;
    token: string;
    iat: number;
    exp: number;
    browser: string;
}
export interface SyncResult {
    success: boolean;
    browser?: string;
    token?: string;
    email?: string;
    balance?: number;
    iat?: number;
    allDiscovered?: DiscoveredToken[];
    message?: string;
    needsLogin?: boolean;
}
/**
 * 直接从本地浏览器 Local Storage LevelDB 文件中无感扫描所有鱼鱼API 登录 Token
 * 特点：
 * 1. 默认不采用 MCP，不依赖 Puppeteer，不需要开启 Chrome 远程调试端口
 * 2. 根据 JWT 的 iat (签发时间戳) 精准判断用户最后一次切换登录的账号
 * 3. 同时发现所有历史登录且未过期的账号，支持多账号秒切
 */
export declare function scanLocalLevelDBTokens(): {
    latest: DiscoveredToken | null;
    all: DiscoveredToken[];
};
/**
 * 智能扫描本地浏览器登录凭据并向鱼鱼API 验证最新活跃账号
 */
export declare function scanRunningBrowsersForToken(): Promise<SyncResult>;
/**
 * 使用系统默认浏览器打开鱼鱼API 登录页，并轮询本地 LevelDB 捕获新登录的 Token（无 MCP 依赖）
 */
export declare function launchAndCaptureToken(timeoutMs?: number): Promise<SyncResult>;
