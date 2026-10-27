export interface DiscoveredToken {
    email: string;
    token: string;
    iat: number;
    exp: number;
    browser: string;
    /** 同源的 refresh token（rt_xxx）。网页端存它，可用 /auth/refresh 换新 access token */
    refreshToken?: string;
    /** 该 refresh token 的过期时刻（ms），未知则缺省 */
    refreshExpiresAt?: number;
    /** 来源文件与 profile，便于排查 */
    profile?: string;
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
    /** 本次扫描到多少个浏览器 profile / 多少个候选文件，用于诊断 */
    diagnostics?: BrowserScanDiagnostics;
}
export interface BrowserScanDiagnostics {
    /** 扫描过的 User Data 根目录 */
    roots: string[];
    /** 实际存在并可读的 profile 数 */
    profiles: number;
    /** 读过的 leveldb 文件数 */
    files: number;
    /** 因为被占用/权限而读不到的文件数 */
    unreadable: number;
    /** 有效期内的 access token 数 */
    validTokens: number;
    /** 找到的 refresh token 数 */
    refreshTokens: number;
}
interface RawScanHit {
    tokens: DiscoveredToken[];
    refreshTokens: string[];
    files: number;
    unreadable: number;
    profiles: number;
    roots: string[];
}
/** 扫描过程中记录的「原始命中」，带位置信息用于后续配对 */
interface TokenHit {
    payload: any;
    token: string;
    browser: string;
    profileKey: string;
    fileKey: string;
    index: number;
}
interface RefreshHit {
    rt: string;
    profileKey: string;
    fileKey: string;
    index: number;
}
export interface RawScanState extends RawScanHit {
    tokenHits: TokenHit[];
    refreshHits: RefreshHit[];
}
/**
 * 扫描所有浏览器 profile 的 Local Storage，收集 access token 与 refresh token。
 *
 * 与旧实现的差别：
 * - 覆盖 Edge Beta/Dev/Canary/WebView2、Chrome 多通道、Brave、Vivaldi、Opera；
 * - 目录探测递归到 `EBWebView`；
 * - 同时提取 `rt_` refresh token，并记录它在哪个 profile / 文件 / 偏移，
 *   供后续与 access token 做「就近配对」；
 * - 记录诊断信息，便于定位「为什么读不到 Edge」。
 */
export declare function scanAllBrowserTokens(): RawScanState;
/**
 * 收集「已过期但仍在本地留有 refresh token」的账号。
 *
 * 这是「1~2 天就得重新获取 Token」的真正解法之一：
 * access token 24 小时就过期，但浏览器里那份 refresh token 往往还有效。
 * 旧实现把所有过期 token 直接过滤掉，连带着把可用的 rt 一起丢了，
 * 于是用户即使刚在浏览器登录过，插件也认为「没数据」。
 */
export declare function scanExpiredAccountsWithRefreshToken(): DiscoveredToken[];
/**
 * 直接从本地浏览器 Local Storage LevelDB 文件中无感扫描所有鱼鱼API 登录 Token。
 * 默认不采用 MCP、不依赖 Puppeteer、不需要开启远程调试端口。
 */
export declare function scanLocalLevelDBTokens(): {
    latest: DiscoveredToken | null;
    all: DiscoveredToken[];
    diagnostics: BrowserScanDiagnostics;
};
/**
 * 智能扫描本地浏览器登录凭据并向鱼鱼API 验证最新活跃账号
 */
export declare function scanRunningBrowsersForToken(): Promise<SyncResult>;
/**
 * 使用系统默认浏览器打开鱼鱼API 登录页，并轮询本地 LevelDB 捕获新登录的 Token。
 */
export declare function launchAndCaptureToken(timeoutMs?: number): Promise<SyncResult>;
/**
 * 用系统默认程序打开 URL。
 *
 * 安全约束：只接受 http(s)，并且用 spawn 传参数数组而不是拼 shell 字符串 ——
 * 这个函数会被 HTTP 路由间接触达，绝不能把任意文本拼进命令行。
 */
export declare function openExternal(targetUrl: string): boolean;
export {};
