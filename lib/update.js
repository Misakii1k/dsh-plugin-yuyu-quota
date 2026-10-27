import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FETCH_TIMEOUT_MS = 8000;
const FAST_FEED_TIMEOUT_MS = 1500;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_GITHUB_REPO = 'Misakii1k/dsh-plugin-yuyu-quota';
function parseVersion(value) {
    if (typeof value !== 'string')
        return null;
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
    if (!match)
        return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] || ''
    };
}
export function cleanVersion(value) {
    if (typeof value !== 'string')
        return '';
    const match = /v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(value.trim());
    return match ? match[1] : '';
}
export function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b)
        return 0;
    if (a.major !== b.major)
        return a.major > b.major ? 1 : -1;
    if (a.minor !== b.minor)
        return a.minor > b.minor ? 1 : -1;
    if (a.patch !== b.patch)
        return a.patch > b.patch ? 1 : -1;
    if (a.prerelease === b.prerelease)
        return 0;
    // 有预发布标记的版本低于同号正式版
    if (!a.prerelease)
        return 1;
    if (!b.prerelease)
        return -1;
    return a.prerelease > b.prerelease ? 1 : -1;
}
export function getPluginVersion() {
    const candidates = [
        path.resolve(__dirname, '../package.json'),
        path.resolve(__dirname, './package.json'),
        path.join(process.cwd(), 'package.json')
    ];
    for (const file of candidates) {
        try {
            const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
            const version = cleanVersion(pkg?.version);
            if (version)
                return version;
        }
        catch {
            // 尝试下一个候选路径
        }
    }
    return '0.0.0';
}
function normalizeRepo(repo) {
    const cleaned = String(repo || '')
        .trim()
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/^\/+|\/+$/g, '');
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleaned) ? cleaned : '';
}
/** 去掉末尾斜杠；不是 http(s) 时返回空串 */
export function normalizeFeedUrl(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            return '';
        return url.toString().replace(/\/+$/, '');
    }
    catch {
        return '';
    }
}
async function fetchJson(url, currentVersion, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'Accept': 'application/vnd.github+json, application/json',
                'User-Agent': `DSH-Plugin-Yuyu-Quota/${currentVersion}`
            }
        });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        return await response.json();
    }
    finally {
        clearTimeout(timer);
    }
}
const SHA256_RE = /^[a-f0-9]{64}$/i;
function pickReleaseAsset(assets) {
    if (!Array.isArray(assets))
        return '';
    const preferred = assets.find((asset) => /\.tgz$/i.test(String(asset?.name || '')))
        || assets.find((asset) => /\.tar\.gz$/i.test(String(asset?.name || '')))
        || assets.find((asset) => /latest\.json$/i.test(String(asset?.name || '')));
    return preferred && typeof preferred.browser_download_url === 'string' ? preferred.browser_download_url : '';
}
/** 从 release 资产里挑出 tgz 体积与 sha256（GitHub 的 digest 字段形如 `sha256:...`）。 */
function tgzAssetFacts(assets) {
    if (!Array.isArray(assets))
        return {};
    const asset = assets.find((item) => /\.tgz$/i.test(String(item?.name || '')))
        || assets.find((item) => /\.tar\.gz$/i.test(String(item?.name || '')));
    if (!asset)
        return {};
    const facts = {};
    if (typeof asset.size === 'number' && asset.size > 0)
        facts.size = asset.size;
    const digest = typeof asset.digest === 'string' ? asset.digest : '';
    if (digest.startsWith('sha256:') && SHA256_RE.test(digest.slice(7))) {
        facts.sha256 = digest.slice(7).toLowerCase();
    }
    return facts;
}
/** 把同源的 `/api/download?...` 相对地址补成绝对地址。 */
export function resolveDownloadUrl(value, feedUrl) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (/^https?:\/\//i.test(raw))
        return raw;
    if (!feedUrl)
        return '';
    try {
        return new URL(raw, feedUrl.endsWith('/') ? feedUrl : `${feedUrl}/`).toString();
    }
    catch {
        return '';
    }
}
function normalizeRelease(data, currentVersion, repo, source, feedUrl = '') {
    if (!data || typeof data !== 'object')
        return null;
    if (Array.isArray(data))
        return null;
    const version = cleanVersion(data.version || data.latestVersion || data.tag_name || data.tag || data.name);
    if (!version)
        return null;
    const releaseUrl = String(data.releaseUrl || data.html_url || data.htmlUrl || data.pageUrl
        || (repo ? `https://github.com/${repo}/releases` : ''));
    // 下载地址优先级：显式配置 > **插件 tgz 资产** > 其它。
    // 不能把 tarball / tarball_url 放在资产前面：GitHub Release JSON 一定含
    // tarball_url（源码包），那样会下载到源码 tar 而不是插件 tgz，
    // 且 size/sha256 取的是 release asset 的，必然校验失败。
    const assetUrl = pickReleaseAsset(data.assets);
    const rawDownload = data.downloadUrl || assetUrl || data.tarball || data.tarball_url || '';
    const downloadUrl = resolveDownloadUrl(rawDownload, feedUrl) || String(rawDownload || '');
    const notes = String(data.notes || data.body || data.changelog || '').slice(0, 1500);
    const publishedAt = data.publishedAt || data.published_at || data.created_at || '';
    const assetFacts = tgzAssetFacts(data.assets);
    const fileSize = typeof data.fileSize === 'number' && data.fileSize > 0
        ? data.fileSize
        : (typeof data.size === 'number' && data.size > 0 ? data.size : assetFacts.size);
    const declaredSha = String(data.sha256 || '').trim().toLowerCase();
    const sha256 = SHA256_RE.test(declaredSha) ? declaredSha : assetFacts.sha256;
    return {
        available: compareVersions(version, currentVersion) > 0,
        currentVersion,
        latestVersion: version,
        releaseUrl: releaseUrl || undefined,
        downloadUrl: downloadUrl || undefined,
        fileSize,
        sha256,
        notes: notes || undefined,
        publishedAt: typeof publishedAt === 'string' ? publishedAt : undefined,
        checkedAt: Date.now(),
        source
    };
}
function pickHighest(candidates) {
    const valid = candidates.filter((item) => item && item.latestVersion);
    if (valid.length === 0)
        return null;
    return valid.reduce((best, item) => compareVersions(String(item.latestVersion), String(best.latestVersion)) > 0 ? item : best);
}
/** 合并两条同版本结果，用信息更全的一方补齐体积与哈希。 */
function mergeSameVersion(primary, secondary) {
    return {
        ...primary,
        downloadUrl: primary.downloadUrl || secondary.downloadUrl,
        fileSize: primary.fileSize ?? secondary.fileSize,
        sha256: primary.sha256 ?? secondary.sha256,
        notes: primary.notes || secondary.notes,
        releaseUrl: primary.releaseUrl || secondary.releaseUrl
    };
}
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
export async function checkForUpdate(options) {
    const currentVersion = cleanVersion(options.currentVersion) || getPluginVersion();
    const feedUrl = normalizeFeedUrl(options.preferences.updateFeedUrl);
    const repo = normalizeRepo(options.preferences.githubRepo) || DEFAULT_GITHUB_REPO;
    const errors = [];
    const sources = [];
    if (feedUrl) {
        sources.push({ url: `${feedUrl}/version.json`, source: 'feed', timeout: FAST_FEED_TIMEOUT_MS });
    }
    sources.push({ url: `https://api.github.com/repos/${repo}/releases/latest`, source: 'github-release' });
    sources.push({
        url: `https://api.github.com/repos/${repo}/tags?per_page=20`,
        source: 'github-tag',
        transform: (tags) => {
            if (!Array.isArray(tags))
                return null;
            const versions = tags
                .map((tag) => cleanVersion(tag?.name))
                .filter(Boolean)
                .sort((a, b) => compareVersions(b, a));
            return versions[0] ? { version: versions[0], html_url: `https://github.com/${repo}/releases` } : null;
        }
    });
    sources.push({ url: `https://raw.githubusercontent.com/${repo}/main/latest.json`, source: 'github-manifest' });
    const candidates = [];
    // 极速通道先跑，命中新版本就不用等 GitHub 的 3 个请求
    const feedCandidate = sources.find((item) => item.source === 'feed');
    if (feedCandidate) {
        try {
            const raw = await fetchJson(feedCandidate.url, currentVersion, feedCandidate.timeout);
            const normalized = normalizeRelease(raw, currentVersion, repo, 'feed', feedUrl);
            if (normalized) {
                candidates.push(normalized);
                if (normalized.available) {
                    return normalized;
                }
            }
        }
        catch (err) {
            errors.push(`feed: ${err?.message || String(err)}`);
        }
    }
    const rest = sources.filter((item) => item.source !== 'feed');
    const results = await Promise.allSettled(rest.map(async (source) => {
        const raw = await fetchJson(source.url, currentVersion);
        const data = source.transform ? source.transform(raw) : raw;
        const normalized = normalizeRelease(data, currentVersion, repo, source.source, feedUrl);
        if (!normalized)
            throw new Error('empty manifest');
        return normalized;
    }));
    for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        if (result.status === 'fulfilled') {
            candidates.push(result.value);
        }
        else {
            errors.push(`${rest[index].source}: ${result.reason?.message || String(result.reason)}`);
        }
    }
    const best = pickHighest(candidates);
    if (best) {
        const sameVersion = candidates.find((item) => item !== best && item.latestVersion === best.latestVersion);
        const merged = sameVersion ? mergeSameVersion(best, sameVersion) : best;
        merged.available = merged.available || candidates.some((item) => item.available);
        return merged;
    }
    return {
        available: false,
        currentVersion,
        checkedAt: Date.now(),
        source: feedUrl ? 'feed' : 'github',
        error: errors.length > 0 ? errors.join('; ').slice(0, 400) : undefined
    };
}
function sha256OfFile(file) {
    const hash = createHash('sha256');
    hash.update(fs.readFileSync(file));
    return hash.digest('hex');
}
/**
 * 下载更新包到临时目录，并（在提供了哈希/体积时）校验完整性。
 *
 * 安全约束：只接受 http(s) 地址；校验失败会删除临时文件，绝不返回半成品路径。
 */
export async function downloadUpdate(info, options = {}) {
    const url = String(info.downloadUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) {
        return { ok: false, error: '更新地址无效' };
    }
    const version = cleanVersion(info.latestVersion) || 'latest';
    const dir = options.targetDir || path.join(os.tmpdir(), 'dsh-yuyu-update');
    const file = path.join(dir, `dsh-plugin-yuyu-quota-${version}.tgz`);
    try {
        fs.mkdirSync(dir, { recursive: true });
    }
    catch (err) {
        return { ok: false, error: `无法创建下载目录: ${err?.message || err}` };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': `DSH-Plugin-Yuyu-Quota/${info.currentVersion || '0.0.0'}` }
        });
        if (!response.ok) {
            return { ok: false, error: `下载失败: HTTP ${response.status}` };
        }
        const totalBytes = Number(response.headers.get('content-length')) || (typeof info.fileSize === 'number' ? info.fileSize : 0);
        const chunks = [];
        let loadedBytes = 0;
        if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                if (value) {
                    chunks.push(value);
                    loadedBytes += value.length;
                    options.onProgress?.(loadedBytes, totalBytes > 0 ? totalBytes : loadedBytes);
                }
            }
        }
        else {
            const arr = await response.arrayBuffer();
            chunks.push(new Uint8Array(arr));
            loadedBytes = arr.byteLength;
            options.onProgress?.(loadedBytes, totalBytes > 0 ? totalBytes : loadedBytes);
        }
        const buffer = Buffer.concat(chunks);
        if (typeof info.fileSize === 'number' && info.fileSize > 0 && buffer.length !== info.fileSize) {
            return {
                ok: false,
                error: `体积校验失败：期望 ${info.fileSize} 字节，实际 ${buffer.length} 字节`
            };
        }
        fs.writeFileSync(file, buffer);
        const actual = sha256OfFile(file);
        if (info.sha256 && SHA256_RE.test(info.sha256) && actual.toLowerCase() !== info.sha256.toLowerCase()) {
            try {
                fs.unlinkSync(file);
            }
            catch { }
            return { ok: false, error: 'sha256 校验失败，已删除下载的安装包' };
        }
        return { ok: true, file, bytes: buffer.length, sha256: actual };
    }
    catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
    finally {
        clearTimeout(timer);
    }
}
/** 列出 tgz 里的条目名（tar -tzf），用于在解压前做安全校验 */
function listArchiveEntries(tgzFilePath) {
    return new Promise((resolve, reject) => {
        execFile('tar.exe', ['-tzf', tgzFilePath], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
            if (err)
                reject(err);
            else
                resolve(String(stdout || '').split(/\r?\n/).filter(Boolean));
        });
    });
}
/**
 * 校验压缩包里的路径全部安全。
 *
 * 为什么必须校验：安装流程会把远端下载的 tgz 解压到插件目录，
 * 若包里带 `../../` 或绝对路径，就能写到任意位置（Zip-Slip）。
 * 即使包来自我们自己的发布流程，也要按不可信输入处理。
 */
export function isSafeArchivePath(entry) {
    if (!entry)
        return false;
    // 去掉 tar 的 ./ 前缀后判断
    const normalized = entry.replace(/^\.\//, '');
    if (!normalized)
        return true; // 目录条目 "./" 无害
    if (normalized.startsWith('/') || normalized.startsWith('\\'))
        return false;
    if (/^[A-Za-z]:/.test(normalized))
        return false;
    const segments = normalized.split(/[\\/]/);
    if (segments.some((seg) => seg === '..'))
        return false;
    // 拒绝软链接常见的目标写法里带协议（如 http://）这类异常条目
    if (/^[a-z]+:\/\//i.test(normalized))
        return false;
    return true;
}
/**
 * 自动解压并安装新版本到 DSH 本地插件目录。
 */
export async function installUpdate(tgzFilePath) {
    const { execFile: execFileCb } = await import('node:child_process');
    // 0) 先确认压缩包在预期目录内，避免被诱导解压任意文件
    const expectedDir = path.join(os.tmpdir(), 'dsh-yuyu-update');
    const resolvedFile = path.resolve(tgzFilePath);
    if (!resolvedFile.toLowerCase().startsWith(path.resolve(expectedDir).toLowerCase() + path.sep)) {
        return { ok: false, error: '安装包路径不在允许的下载目录内，已拒绝安装' };
    }
    if (!fs.existsSync(resolvedFile)) {
        return { ok: false, error: '安装包不存在' };
    }
    // 1) 解压前做 Zip-Slip 校验
    let entries = [];
    try {
        entries = await listArchiveEntries(resolvedFile);
    }
    catch (err) {
        return { ok: false, error: `读取安装包清单失败: ${err?.message || err}` };
    }
    if (entries.length === 0) {
        return { ok: false, error: '安装包为空' };
    }
    const unsafe = entries.filter((entry) => !isSafeArchivePath(entry));
    if (unsafe.length > 0) {
        return { ok: false, error: `安装包包含非法路径，已拒绝安装: ${unsafe.slice(0, 3).join(', ')}` };
    }
    if (!entries.some((entry) => /(^|\/)package\.json$/.test(entry.replace(/^\.\//, '')))) {
        return { ok: false, error: '安装包缺少 package.json，无法确认是插件包' };
    }
    try {
        const targetDir = path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-plugin-yuyu-quota');
        fs.mkdirSync(targetDir, { recursive: true });
        await new Promise((resolve, reject) => {
            execFileCb('tar.exe', ['-xzf', resolvedFile, '-C', targetDir, '--strip-components', '1'], (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        // dsh CLI 注册（失败不致命：文件已经落地，重启后仍会被加载）
        try {
            await new Promise((resolve) => {
                execFileCb('dsh', ['plugin', '--profile', 'desktop', 'add', resolvedFile], () => resolve());
            });
        }
        catch { }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err?.message || String(err) };
    }
}
export { DEFAULT_GITHUB_REPO };
