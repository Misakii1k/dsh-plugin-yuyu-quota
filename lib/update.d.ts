import { PluginPreferences, UpdateInfo } from './types.js';
declare const DEFAULT_GITHUB_REPO = "Misakii1k/dsh-plugin-yuyu-quota";
export interface UpdateCheckOptions {
    preferences: Pick<PluginPreferences, 'updateFeedUrl' | 'githubRepo'>;
    currentVersion?: string;
}
export declare function cleanVersion(value: unknown): string;
export declare function compareVersions(left: string, right: string): number;
export declare function getPluginVersion(): string;
/** 去掉末尾斜杠；不是 http(s) 时返回空串 */
export declare function normalizeFeedUrl(value: unknown): string;
/** 把同源的 `/api/download?...` 相对地址补成绝对地址。 */
export declare function resolveDownloadUrl(value: unknown, feedUrl: string): string;
/**
 * 检查更新。
 *
 * 探测顺序对齐已验证的参考实现：
 * 1. Cloudflare 边缘 `{feed}/version.json`（约 50~150ms，极速通道，1.5s 熔断）；
 * 2. 若极速通道未给出新版本，则并发查询 GitHub Release / Tag / raw manifest；
 * 3. 所有候选取版本号最高者，同版本时互补 sha256 与体积。
 *
 * 注意：本仓库当前是**私有**的，匿名直连 api.github.com 会 404。
 * 这种情况下只有 Cloudflare 边缘通道可用（它持有 GITHUB_TOKEN 做代理）。
 */
export declare function checkForUpdate(options: UpdateCheckOptions): Promise<UpdateInfo>;
export interface DownloadResult {
    ok: boolean;
    file?: string;
    bytes?: number;
    sha256?: string;
    error?: string;
}
export interface DownloadUpdateOptions {
    targetDir?: string;
    onProgress?: (loaded: number, total: number) => void;
}
/**
 * 下载更新包到临时目录，并（在提供了哈希/体积时）校验完整性。
 *
 * 安全约束：只接受 http(s) 地址；校验失败会删除临时文件，绝不返回半成品路径。
 */
export declare function downloadUpdate(info: UpdateInfo, options?: DownloadUpdateOptions): Promise<DownloadResult>;
/**
 * 自动解压并安装新版本到 DSH 本地插件目录。
 */
export declare function installUpdate(tgzFilePath: string): Promise<{
    ok: boolean;
    error?: string;
}>;
export { DEFAULT_GITHUB_REPO };
