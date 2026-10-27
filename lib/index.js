import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { YuyuApiClient } from './api.js';
import { createYuyuBalanceTool } from './tool.js';
import { scanRunningBrowsersForToken, launchAndCaptureToken, openExternal } from './browser-sync.js';
import { createSessionTracker } from './session-tracker.js';
import { sendDesktopNotification, playSystemAlertSound } from './notify.js';
import { checkForUpdate, downloadUpdate, installUpdate, getPluginVersion } from './update.js';
import { createCredentialManager, jwtExpiry, isUnauthorizedLike, refreshWithToken } from './credentials.js';
export const name = 'dsh-plugin-yuyu-quota';
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
export const inject = ['webServer', 'tools'];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BRIDGE_PORT = 53788;
export const API_PREFIX = '/yuyu-quota/api';
let currentUpdateProgress = null;
/** 用户偏好的出厂默认值 */
export function defaultPreferences() {
    return {
        theme: 'system',
        widgetStyle: 'whale',
        whaleModel: 'DSniang1',
        soundEffect: 'task-end-a',
        pressSound: 'duck',
        soundVolume: 80,
        notifyMode: 'both',
        notifyOnComplete: true,
        notifySound: 'Notification.Reminder',
        notifySubagentMute: true,
        notifyOnFailure: true,
        notifyOnlyWhenUnfocused: false,
        reportOnComplete: true,
        updateCheck: true,
        updateFeedUrl: 'https://dsh-plugin-yuyu-quota-update.pages.dev',
        githubRepo: 'Misakii1k/dsh-plugin-yuyu-quota',
        updateCheckIntervalHours: 6
    };
}
const SOUND_PRESETS = new Set([
    'Notification.Reminder',
    'Notification.Default',
    'Notification.IM',
    'Notification.Mail',
    'Notification.SMS',
    'none'
]);
/** 解析音效名称对应的本地音频文件绝对路径 */
export function resolveSoundFilePath(soundKey) {
    if (!soundKey || soundKey === 'none')
        return undefined;
    let fileName;
    if (soundKey === 'task-end-a')
        fileName = 'task-end-a.wav';
    else if (soundKey === 'cost-default')
        fileName = 'cost-default.wav';
    else if (soundKey === 'minecraft-exp-orb')
        fileName = 'minecraft-exp-orb.wav';
    else if (soundKey === 'duck')
        fileName = Math.random() > 0.5 ? 'Ya1.mp3' : 'Ya2.mp3';
    else if (soundKey === 'fx1')
        fileName = Math.random() > 0.5 ? 'D1.mp3' : 'D2.mp3';
    else if (soundKey.endsWith('.wav') || soundKey.endsWith('.mp3'))
        fileName = soundKey;
    if (!fileName)
        return undefined;
    const candidates = [
        path.resolve(__dirname, '../assets', fileName),
        path.resolve(__dirname, './assets', fileName),
        path.join(process.cwd(), 'assets', fileName)
    ];
    for (const p of candidates) {
        if (fs.existsSync(p))
            return p;
    }
    return undefined;
}
/**
 * 把任意外部输入收敛成合法偏好。
 * 只接受已知键，避免通过 HTTP 把任意字段写进配置文件。
 */
export function sanitizePreferences(input, base) {
    const next = { ...base };
    if (!input || typeof input !== 'object')
        return next;
    const bools = [
        'notifyOnComplete',
        'notifySubagentMute',
        'notifyOnFailure',
        'notifyOnlyWhenUnfocused',
        'reportOnComplete',
        'updateCheck'
    ];
    for (const key of bools) {
        if (typeof input[key] === 'boolean') {
            next[key] = input[key];
        }
    }
    if (input.theme === 'system' || input.theme === 'light' || input.theme === 'dark') {
        next.theme = input.theme;
    }
    if (input.widgetStyle === 'whale' || input.widgetStyle === 'pill') {
        next.widgetStyle = input.widgetStyle;
    }
    if (input.whaleModel === 'DSniang1' || input.whaleModel === 'DSniang02' || input.whaleModel === 'DSH2') {
        next.whaleModel = 'DSniang1';
    }
    if (typeof input.soundEffect === 'string') {
        next.soundEffect = input.soundEffect.trim();
    }
    if (typeof input.pressSound === 'string') {
        next.pressSound = input.pressSound.trim();
    }
    if (typeof input.soundVolume === 'number') {
        next.soundVolume = Math.max(0, Math.min(100, input.soundVolume));
    }
    if (input.notifyMode === 'both' || input.notifyMode === 'windows' || input.notifyMode === 'inapp' || input.notifyMode === 'off') {
        next.notifyMode = input.notifyMode;
        next.notifyOnComplete = input.notifyMode === 'both' || input.notifyMode === 'windows';
    }
    else if (input.notifyOnComplete !== undefined) {
        // 兼容历史版本布尔值
        next.notifyMode = input.notifyOnComplete ? 'both' : 'off';
    }
    if (typeof input.notifySound === 'string') {
        const sound = input.notifySound.trim();
        if (SOUND_PRESETS.has(sound))
            next.notifySound = sound;
    }
    if (typeof input.updateFeedUrl === 'string') {
        const raw = input.updateFeedUrl.trim();
        if (!raw)
            next.updateFeedUrl = '';
        else if (/^https?:\/\/[^\s]+$/i.test(raw))
            next.updateFeedUrl = raw.replace(/\/+$/, '');
    }
    if (typeof input.githubRepo === 'string') {
        const repo = input.githubRepo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
        if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
            next.githubRepo = repo;
    }
    if (input.updateCheckIntervalHours !== undefined) {
        const hours = Number(input.updateCheckIntervalHours);
        if (Number.isFinite(hours) && hours >= 0.5 && hours <= 168) {
            next.updateCheckIntervalHours = hours;
        }
    }
    return next;
}
/**
 * 刷新间隔映射表 (ms)
 */
const INTERVAL_MAP = {
    '1s': 1000,
    '5s': 5 * 1000,
    '30s': 30 * 1000,
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
};
function getGlobalStoreFile() {
    const dshDir = path.join(os.homedir(), '.dsh');
    try {
        if (!fs.existsSync(dshDir))
            fs.mkdirSync(dshDir, { recursive: true });
        return path.join(dshDir, 'yuyu-accounts.json');
    }
    catch {
        return path.resolve(__dirname, '..', 'yuyu-config.json');
    }
}
function getLocalConfigFile() {
    return path.resolve(__dirname, '..', 'yuyu-config.json');
}
export function loadAccountStore() {
    const store = {
        activeEmail: '',
        lastBrowserIat: 0,
        refreshInterval: '30s',
        alertThreshold: 2.0,
        baseUrl: 'https://sub.anzhiyu.com',
        accounts: [],
        preferences: defaultPreferences()
    };
    const files = [getGlobalStoreFile(), getLocalConfigFile(), path.join(process.cwd(), 'yuyu-config.json')];
    for (const file of files) {
        if (!fs.existsSync(file))
            continue;
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (raw.activeEmail && !store.activeEmail)
                store.activeEmail = raw.activeEmail;
            else if (raw.cachedEmail && !store.activeEmail)
                store.activeEmail = raw.cachedEmail;
            if (typeof raw.lastBrowserIat === 'number' && raw.lastBrowserIat > store.lastBrowserIat) {
                store.lastBrowserIat = raw.lastBrowserIat;
            }
            // 这三个字段 saveAccountStore 一直在写，早期版本却忘了读回来 ——
            // 结果用户设置的刷新频率/预警阈值/服务地址重启就丢，永远回到默认值。
            if (typeof raw.refreshInterval === 'string' && INTERVAL_MAP[raw.refreshInterval]) {
                store.refreshInterval = raw.refreshInterval;
            }
            if (typeof raw.alertThreshold === 'number' && Number.isFinite(raw.alertThreshold)) {
                store.alertThreshold = Math.max(0, Math.min(1000, raw.alertThreshold));
            }
            if (typeof raw.baseUrl === 'string' && /^https?:\/\/[^\s]+$/i.test(raw.baseUrl.trim())) {
                store.baseUrl = raw.baseUrl.trim().replace(/\/+$/, '');
            }
            if (raw.preferences && typeof raw.preferences === 'object') {
                store.preferences = sanitizePreferences(raw.preferences, store.preferences);
            }
            if (Array.isArray(raw.accounts)) {
                for (const acc of raw.accounts) {
                    if (acc && acc.email && acc.token) {
                        const idx = store.accounts.findIndex(a => a.email === acc.email);
                        if (idx >= 0)
                            store.accounts[idx] = { ...store.accounts[idx], ...acc };
                        else
                            store.accounts.push(acc);
                    }
                }
            }
            else if (raw.token && raw.cachedEmail) {
                const idx = store.accounts.findIndex(a => a.email === raw.cachedEmail);
                const item = {
                    email: raw.cachedEmail,
                    token: raw.token,
                    balance: Number(raw.cachedBalance || 0),
                    lastSyncedAt: raw.lastSyncedAt || new Date().toISOString()
                };
                if (idx >= 0)
                    store.accounts[idx] = { ...store.accounts[idx], ...item };
                else
                    store.accounts.push(item);
            }
        }
        catch { }
    }
    return store;
}
/**
 * 原子写入：先写临时文件再 rename。
 *
 * 为什么必须原子：refresh token 是一次性的（用过即轮换）。如果写盘写到一半崩溃，
 * 或两个进程同时写，就会永久丢掉唯一可用的 refresh token —— 用户只能重新登录。
 * rename 在同一分区上是原子的，能保证「要么旧内容，要么新内容」。
 */
function writeFileAtomic(target, content) {
    const dir = path.dirname(target);
    const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tmp, target);
        return true;
    }
    catch {
        // 不能退化成「直接覆盖」：那样会破坏原子性 ——
        // 写到一半崩溃就会留下半截 JSON，连带丢掉唯一的 refresh token。
        // 这里只清理临时文件并返回失败，让调用方决定是否重试。
        try {
            fs.unlinkSync(tmp);
        }
        catch { }
        return false;
    }
}
export function saveAccountStore(store) {
    const activeAcc = store.accounts.find(a => a.email === store.activeEmail) || store.accounts[0];
    const payload = {
        activeEmail: store.activeEmail || activeAcc?.email || '',
        lastBrowserIat: store.lastBrowserIat || 0,
        token: activeAcc?.token || '',
        cachedEmail: activeAcc?.email || '',
        cachedBalance: activeAcc?.balance || 0,
        refreshInterval: store.refreshInterval,
        alertThreshold: store.alertThreshold,
        baseUrl: store.baseUrl,
        lastSyncedAt: new Date().toISOString(),
        preferences: store.preferences,
        accounts: store.accounts.map(a => ({
            email: a.email,
            token: a.token,
            balance: a.balance,
            lastSyncedAt: a.lastSyncedAt,
            ...(a.balanceChangedAt ? { balanceChangedAt: a.balanceChangedAt } : {}),
            ...(a.lastTotalRecharged !== undefined ? { lastTotalRecharged: a.lastTotalRecharged } : {}),
            // 凭据续期字段：必须一并持久化，否则重启后又要重新登录
            ...(a.refreshToken ? { refreshToken: a.refreshToken } : {}),
            ...(a.accessTokenExpiresAt ? { accessTokenExpiresAt: a.accessTokenExpiresAt } : {}),
            ...(a.refreshTokenExpiresAt ? { refreshTokenExpiresAt: a.refreshTokenExpiresAt } : {}),
            ...(a.refreshedAt ? { refreshedAt: a.refreshedAt } : {}),
            ...(a.snapshot ? { snapshot: a.snapshot } : {})
        }))
    };
    const content = JSON.stringify(payload, null, 2);
    // 两份文件各自独立成功：任何一份成功都不会丢凭据。
    // 只有两份都失败才算真失败，交给调用方的节流写入器记录告警。
    let anySuccess = false;
    for (const file of [getGlobalStoreFile(), getLocalConfigFile()]) {
        if (writeFileAtomic(file, content))
            anySuccess = true;
    }
    if (!anySuccess) {
        throw new Error('账号库写入失败（两份目标文件均无法写入）');
    }
}
/**
 * 收敛前端上报的浮窗位置。
 * 只接受有限数值与三种吸附状态，避免脏数据把浮窗推到屏幕外。
 */
export function normalizeWidgetPosition(input) {
    if (!input || typeof input !== 'object')
        return null;
    const x = Number(input.x);
    const y = Number(input.y);
    if (!Number.isFinite(x) || !Number.isFinite(y))
        return null;
    const edge = input.edge === 'left' || input.edge === 'right' ? input.edge : 'free';
    return {
        x: Math.max(-2000, Math.min(20000, Math.round(x))),
        y: Math.max(-2000, Math.min(20000, Math.round(y))),
        edge
    };
}
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
export function isAllowedOrigin(origin) {
    if (!origin)
        return true;
    try {
        const parsed = new URL(origin);
        if (parsed.protocol === 'dsh:')
            return true;
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
            return false;
        return parsed.hostname === '127.0.0.1'
            || parsed.hostname === 'localhost'
            || parsed.hostname === '[::1]'
            || parsed.hostname === '::1';
    }
    catch {
        return false;
    }
}
/**
 * 为响应写 CORS 头。
 * 命中白名单就回显该 Origin，否则不回 CORS 头（浏览器会拦截）。
 */
function applyCorsHeaders(response, origin) {
    if (origin && isAllowedOrigin(origin)) {
        response.setHeader('access-control-allow-origin', origin);
        response.setHeader('vary', 'Origin');
        response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
        response.setHeader('access-control-allow-headers', 'Content-Type, Authorization');
    }
    // Origin 不在白名单时不写 ACAO，浏览器端请求会被拒绝
}
function sendJson(response, status, payload) {
    applyCorsHeaders(response, response.req?.headers?.origin);
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify(payload));
}
/** 请求体上限：这些路由只收偏好/账号名，256KB 已经很宽松 */
const MAX_BODY_BYTES = 256 * 1024;
function readJsonBody(request) {
    return new Promise((resolve) => {
        const chunks = [];
        let size = 0;
        let done = false;
        const finish = (value) => {
            if (done)
                return;
            done = true;
            resolve(value);
        };
        request.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                // 超限直接丢弃连接，避免被无限撑大内存
                try {
                    request.destroy();
                }
                catch { }
                finish({});
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                finish(raw ? JSON.parse(raw) : {});
            }
            catch {
                finish({});
            }
        });
        request.on('error', () => finish({}));
    });
}
/** 找到随插件分发的 tutorial.html */
function findTutorialFile() {
    const candidates = [
        path.resolve(__dirname, '../tutorial.html'),
        path.resolve(__dirname, './tutorial.html'),
        path.join(process.cwd(), 'tutorial.html')
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p))
                return p;
        }
        catch {
            // 继续尝试下一个候选
        }
    }
    return '';
}
/**
 * 用系统默认程序打开一个本地文件。
 *
 * 用 execFile 而不是 exec 拼字符串：本地路径可能含空格、引号或 & ，
 * 拼进 shell 既有注入风险也会打不开。
 */
function openPath(file) {
    if (!file)
        return false;
    try {
        const platform = process.platform;
        if (platform === 'win32') {
            // Windows 上 start 是 cmd 内建命令，必须经 cmd 转调；路径作为独立参数传入
            spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        }
        else if (platform === 'darwin') {
            spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
        }
        else {
            spawn('xdg-open', [file], { detached: true, stdio: 'ignore' }).unref();
        }
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 给 saveAccountStore 加节流。
 *
 * 为什么要节流：默认刷新间隔 30 秒，每次刷新都会重写两份 JSON（含完整 snapshot），
 * 高频次轮询下这是无意义的写放大，SSD 上尤其明显。
 * 但「凭据续期」必须立即落盘（refresh token 一次性，丢了只能重新登录），
 * 所以提供一个 `flushNow` 强制写入的入口。
 */
function createStoreWriter(store, logger) {
    const state = { timer: null, lastWrite: 0, pending: false };
    const MIN_INTERVAL_MS = 5_000;
    const doWrite = () => {
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        state.lastWrite = Date.now();
        state.pending = false;
        try {
            saveAccountStore(store);
        }
        catch (err) {
            logger?.warn?.(`[鱼鱼API] 写入账号库失败: ${err?.message || err}`);
        }
    };
    /** 常规保存：距上次写盘不足 5 秒就推迟，避免高频轮询写放大 */
    const save = () => {
        const elapsed = Date.now() - state.lastWrite;
        if (elapsed >= MIN_INTERVAL_MS) {
            doWrite();
            return;
        }
        state.pending = true;
        if (state.timer)
            return;
        state.timer = setTimeout(doWrite, MIN_INTERVAL_MS - elapsed);
        if (typeof state.timer.unref === 'function')
            state.timer.unref();
    };
    /** 立即写盘（凭据变更、账号增删等不可丢失的变更） */
    const flushNow = () => doWrite();
    /** 卸载时把未落盘的变更补上 */
    const dispose = () => {
        if (state.pending)
            doWrite();
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }
    };
    return { save, flushNow, dispose };
}
/**
 * 创建多账号管理与 API 路由服务控制器
 */
export function createYuyuService(initialConfig, logger = console) {
    const store = loadAccountStore();
    if (initialConfig?.alertThreshold !== undefined)
        store.alertThreshold = initialConfig.alertThreshold;
    if (initialConfig?.baseUrl)
        store.baseUrl = initialConfig.baseUrl;
    if (initialConfig?.refreshInterval)
        store.refreshInterval = initialConfig.refreshInterval;
    // 插件配置（cordis.patch.yml）里的偏好优先级高于本地文件，但仍只走白名单收敛
    store.preferences = sanitizePreferences(initialConfig, store.preferences);
    const getActiveAccount = () => {
        return store.accounts.find(a => a.email === store.activeEmail) || store.accounts[0];
    };
    const client = new YuyuApiClient(getActiveAccount()?.token || '', store.baseUrl);
    // 账号库写盘：日常刷新走节流，凭据变更走立即落盘
    const storeWriter = createStoreWriter(store, logger);
    const persist = () => storeWriter.save();
    const persistNow = () => storeWriter.flushNow();
    // —— 凭据自动续期 ——
    // access token 约 24 小时过期；有 refresh token 就能无感续期，不再需要用户 1~2 天重登。
    const credentialManager = createCredentialManager({
        get: (email) => {
            const acc = store.accounts.find(a => a.email === email);
            if (!acc)
                return undefined;
            return {
                email: acc.email,
                accessToken: acc.token,
                refreshToken: acc.refreshToken,
                accessTokenExpiresAt: acc.accessTokenExpiresAt || jwtExpiry(acc.token),
                refreshTokenExpiresAt: acc.refreshTokenExpiresAt
            };
        },
        set: (creds) => {
            const idx = store.accounts.findIndex(a => a.email === creds.email);
            if (idx < 0)
                return;
            const acc = store.accounts[idx];
            acc.token = creds.accessToken;
            if (creds.refreshToken)
                acc.refreshToken = creds.refreshToken;
            if (creds.accessTokenExpiresAt)
                acc.accessTokenExpiresAt = creds.accessTokenExpiresAt;
            if (creds.refreshTokenExpiresAt)
                acc.refreshTokenExpiresAt = creds.refreshTokenExpiresAt;
            acc.refreshedAt = Date.now();
            if (store.activeEmail === acc.email)
                client.updateToken(acc.token);
            store.credentialsDegraded = false;
            // 凭据必须立刻落盘：refresh token 一次性，丢了就只能重新登录
            persistNow();
        },
        recoverFromBrowser: async () => {
            const { scanLocalLevelDBTokens } = await import('./browser-sync.js');
            const { all } = scanLocalLevelDBTokens();
            if (all.length === 0)
                return null;
            // 优先返回当前激活账号，没有再退回最新登录的那个
            const preferred = all.find(t => t.email === store.activeEmail) || all[0];
            return {
                email: preferred.email,
                accessToken: preferred.token,
                refreshToken: preferred.refreshToken,
                accessTokenExpiresAt: preferred.exp * 1000
            };
        },
        logger
    }, store.baseUrl);
    /** 最近一次快照（供会话跟踪器取轮次基线，避免每次轮次都打网络） */
    let cachedSnapshot = getActiveAccount()?.snapshot || null;
    /** 最近一轮汇报 + 单调递增 seq（前端据此判断“有新的一轮”） */
    let lastReport = null;
    let lastReportSeq = 0;
    const reportHistory = [];
    /** 最近一次更新检查结果 */
    let lastUpdateInfo = null;
    let updateInFlight = null;
    const upsertAccount = (token, snap, setActive = true, extra) => {
        if (!snap.email)
            return;
        const now = new Date().toISOString();
        const existingIdx = store.accounts.findIndex(a => a.email === snap.email);
        const previous = existingIdx >= 0 ? store.accounts[existingIdx] : undefined;
        // 余额 / 累计充值发生变化时，记录变化时刻，便于确认“充值是否已到账”
        const balanceChanged = previous !== undefined
            && Math.abs(Number(previous.balance || 0) - snap.balance) > 1e-9;
        const rechargeChanged = previous?.lastTotalRecharged !== undefined
            && Math.abs(Number(previous.lastTotalRecharged) - snap.totalRecharged) > 1e-9;
        const entry = {
            email: snap.email,
            token,
            balance: snap.balance,
            lastSyncedAt: now,
            snapshot: snap,
            balanceChangedAt: (balanceChanged || rechargeChanged)
                ? now
                : (previous?.balanceChangedAt || now),
            lastTotalRecharged: snap.totalRecharged,
            // 保留已有凭据续期信息，别在每次刷新时把 refresh token 抹掉
            ...(previous?.refreshToken ? { refreshToken: previous.refreshToken } : {}),
            ...(previous?.accessTokenExpiresAt ? { accessTokenExpiresAt: previous.accessTokenExpiresAt } : {}),
            ...(previous?.refreshTokenExpiresAt ? { refreshTokenExpiresAt: previous.refreshTokenExpiresAt } : {}),
            ...(previous?.refreshedAt ? { refreshedAt: previous.refreshedAt } : {}),
            // 新拿到的凭据（浏览器同步时可能带来新的 refresh token）
            ...(extra?.refreshToken ? { refreshToken: extra.refreshToken } : {}),
            ...(extra?.accessTokenExpiresAt ? { accessTokenExpiresAt: extra.accessTokenExpiresAt } : {})
        };
        if (existingIdx >= 0) {
            store.accounts[existingIdx] = entry;
        }
        else {
            store.accounts.unshift(entry);
        }
        if (setActive || !store.activeEmail) {
            store.activeEmail = snap.email;
            client.updateToken(token);
        }
        persist();
    };
    /**
     * 用「自动续期」的方式拉一次快照。
     *
     * 为什么不直接在 refreshAccount 里 new YuyuApiClient：
     * 每个账号有自己的 token，而 token 会在续期后变化。
     * 统一走 credentialManager.withRetry，保证：
     * 1) 拿到的永远是最新 token；
     * 2) 401 时只续期一次并重试，不会无限递归；
     * 3) 续期成功的新凭据已经落盘。
     */
    const fetchSnapshotWithCredential = async (acc) => {
        const run = async (token) => {
            const scoped = new YuyuApiClient(token, store.baseUrl);
            return await scoped.getBalanceSnapshot(store.alertThreshold);
        };
        try {
            const snap = await credentialManager.withRetry(acc.email, run);
            // withRetry 成功后，store 里的 token 可能已经被续期，同步回内存中的 acc
            const latest = store.accounts.find(a => a.email === acc.email);
            if (latest && latest.token && latest.token !== acc.token)
                acc.token = latest.token;
            return snap;
        }
        catch (err) {
            // 续期与重试都失败：返回一个失败的快照而不是抛错，让上层继续用旧数据
            const message = err?.message || String(err);
            const unauthorized = isUnauthorizedLike(err);
            if (unauthorized)
                store.credentialsDegraded = true;
            return {
                success: false,
                timestamp: Date.now(),
                email: acc.email,
                balance: acc.balance || 0,
                frozenBalance: 0,
                totalRecharged: 0,
                todayCost: 0,
                todayRawCost: 0,
                todayTokens: 0,
                todayRequests: 0,
                totalRequests: 0,
                totalActualCost: 0,
                keysCount: 0,
                keysSummary: [],
                isLowBalance: false,
                alertThreshold: store.alertThreshold,
                formattedText: `[错误] 查询鱼鱼API余额失败: ${message}`,
                error: message,
                unauthorized
            };
        }
    };
    /**
     * 刷新指定或当前激活账号的实时快照，并并发刷新账号库内其他已保存账号的快照。
     *
     * 关键改动：所有请求都经过 credentialManager.withRetry ——
     * access token 过期（401）时会先用 refresh token 续期再重试，
     * 从而避免「隔 1~2 天就得重新登录」。
     *
     * 幂等约束：`targetEmail` 只用于「本次读哪个账号」，**不修改** store.activeEmail。
     * 早期版本在这里直接改 activeEmail，而 GET /snapshot?email=A 也会进来 ——
     * 一个带副作用的 GET 会在并发刷新时反复改写「当前账号」。
     * 切号只允许走 POST /switch。
     *
     * @param options.others 是否顺带刷新账号库里的其他账号（默认 true）。
     *        轮次汇报这类高频调用应传 false，避免每次轮次都打 N+1 次上游请求。
     */
    const refreshAccount = async (targetEmail, options = {}) => {
        const acc = targetEmail
            ? (store.accounts.find(a => a.email === targetEmail) || getActiveAccount())
            : getActiveAccount();
        if (!acc)
            return null;
        const isActive = acc.email === store.activeEmail;
        const snap = await fetchSnapshotWithCredential(acc);
        if (snap.success) {
            upsertAccount(acc.token, snap, isActive);
        }
        // 并发刷新其他保存账号的最新数据（同一账号的去重交给 withRetry 的 in-flight 合并）
        if (options.others !== false) {
            await Promise.allSettled(store.accounts
                .filter(a => a.email !== acc.email)
                .map(async (other) => {
                const otherSnap = await fetchSnapshotWithCredential(other);
                if (otherSnap.success) {
                    const balanceChanged = Math.abs(Number(other.balance || 0) - otherSnap.balance) > 1e-9;
                    const rechargeChanged = other.lastTotalRecharged !== undefined
                        && Math.abs(Number(other.lastTotalRecharged) - otherSnap.totalRecharged) > 1e-9;
                    const now = new Date().toISOString();
                    if (balanceChanged || rechargeChanged) {
                        other.balanceChangedAt = now;
                    }
                    else if (!other.balanceChangedAt) {
                        other.balanceChangedAt = now;
                    }
                    other.balance = otherSnap.balance;
                    other.lastTotalRecharged = otherSnap.totalRecharged;
                    other.lastSyncedAt = now;
                    other.snapshot = otherSnap;
                }
            }));
        }
        persist();
        // 只有当前激活账号的快照能作为「轮次基线」缓存
        if (snap.success && isActive)
            cachedSnapshot = snap;
        return snap.success ? snap : (acc.snapshot || snap);
    };
    /**
     * 从本地浏览器存储检测当前登录账号与所有历史有效账号
     * @param forceSwitch 是否强制将当前激活账号切换为浏览器最新登录账号（点击“从浏览器同步”按钮时为 true）
     */
    const syncFromBrowser = async (forceCapture = false, manualToken, forceSwitch = false) => {
        if (manualToken && manualToken.trim()) {
            const clean = manualToken.trim();
            const tempClient = new YuyuApiClient(clean, store.baseUrl);
            const snap = await tempClient.getBalanceSnapshot(store.alertThreshold);
            if (snap.success) {
                upsertAccount(clean, snap, true);
                return {
                    success: true,
                    browser: '手动Token',
                    email: snap.email,
                    balance: snap.balance,
                    snapshot: snap,
                    message: `已验证并切换至账号 ${snap.email} ($${snap.balance.toFixed(2)})`
                };
            }
            return {
                success: false,
                message: snap.error || 'Token 无效或已过期'
            };
        }
        let scanRes = await scanRunningBrowsersForToken();
        // 正常扫描找不到有效 access token 时，退一步找「已过期但还留着 refresh token」的账号。
        // 这是「隔一两天就得重新登录」的主要挽回路径：access token 24h 就过期，
        // 而浏览器里那份 rt 往往还有效，用它可以无感换回一对新凭据。
        if (!scanRes.success) {
            try {
                const { scanExpiredAccountsWithRefreshToken } = await import('./browser-sync.js');
                const recoverable = scanExpiredAccountsWithRefreshToken();
                for (const item of recoverable) {
                    if (!item.refreshToken)
                        continue;
                    const recovered = await refreshWithToken(item.refreshToken, store.baseUrl);
                    if (!recovered.ok || !recovered.credentials)
                        continue;
                    const existing = store.accounts.find(a => a.email === item.email);
                    if (existing) {
                        existing.token = recovered.credentials.accessToken;
                        existing.refreshToken = recovered.credentials.refreshToken;
                        existing.accessTokenExpiresAt = recovered.credentials.accessTokenExpiresAt;
                        existing.refreshTokenExpiresAt = recovered.credentials.refreshTokenExpiresAt;
                        existing.refreshedAt = Date.now();
                    }
                    else {
                        store.accounts.push({
                            email: item.email,
                            token: recovered.credentials.accessToken,
                            refreshToken: recovered.credentials.refreshToken,
                            balance: 0,
                            lastSyncedAt: new Date().toISOString(),
                            accessTokenExpiresAt: recovered.credentials.accessTokenExpiresAt,
                            refreshTokenExpiresAt: recovered.credentials.refreshTokenExpiresAt,
                            refreshedAt: Date.now()
                        });
                    }
                    store.activeEmail = item.email;
                    store.credentialsDegraded = false;
                    persistNow();
                    logger.info?.(`[鱼鱼API] 已用浏览器的 refresh token 恢复账号 ${item.email}`);
                }
            }
            catch (err) {
                logger.warn?.(`[鱼鱼API] 过期账号恢复失败: ${err?.message || err}`);
            }
        }
        if (!scanRes.success && forceCapture) {
            scanRes = await launchAndCaptureToken();
        }
        if (scanRes.success && scanRes.token) {
            // 1. 将浏览器中发现的所有有效账号同步进账号库（含 refresh token）
            if (Array.isArray(scanRes.allDiscovered)) {
                for (const disc of scanRes.allDiscovered) {
                    const existing = store.accounts.find(a => a.email === disc.email);
                    const expiresAt = typeof disc.exp === 'number' ? disc.exp * 1000 : undefined;
                    if (existing) {
                        existing.token = disc.token;
                        existing.accessTokenExpiresAt = expiresAt;
                        // 浏览器里的 refresh token 是「最新写入」的那份，优先采纳
                        if (disc.refreshToken) {
                            existing.refreshToken = disc.refreshToken;
                            existing.refreshTokenExpiresAt = disc.refreshExpiresAt;
                        }
                    }
                    else {
                        store.accounts.push({
                            email: disc.email,
                            token: disc.token,
                            balance: 0,
                            lastSyncedAt: new Date().toISOString(),
                            ...(disc.refreshToken ? { refreshToken: disc.refreshToken } : {}),
                            ...(expiresAt ? { accessTokenExpiresAt: expiresAt } : {}),
                            ...(disc.refreshExpiresAt ? { refreshTokenExpiresAt: disc.refreshExpiresAt } : {})
                        });
                    }
                }
            }
            // 2. 判断浏览器是否发生了新账号切换（iat 变大）或用户显式点击了同步按钮 (forceSwitch)
            const browserChanged = typeof scanRes.iat === 'number' && scanRes.iat > store.lastBrowserIat;
            const shouldSwitchToBrowserLatest = forceSwitch || browserChanged || !store.activeEmail;
            if (typeof scanRes.iat === 'number' && scanRes.iat > store.lastBrowserIat) {
                store.lastBrowserIat = scanRes.iat;
            }
            if (shouldSwitchToBrowserLatest && scanRes.email) {
                store.activeEmail = scanRes.email;
            }
            const activeSnap = await refreshAccount(store.activeEmail);
            if (activeSnap && activeSnap.success) {
                logger.info?.(`[鱼鱼API] 同步完成，当前激活账号: ${activeSnap.email} ($${activeSnap.balance.toFixed(2)})，共 ${store.accounts.length} 个账号`);
                return {
                    success: true,
                    browser: scanRes.browser,
                    email: activeSnap.email,
                    balance: activeSnap.balance,
                    snapshot: activeSnap,
                    message: shouldSwitchToBrowserLatest
                        ? `已跟随 ${scanRes.browser} 切换至 ${activeSnap.email} ($${activeSnap.balance.toFixed(2)})`
                        : `已刷新 ${activeSnap.email} ($${activeSnap.balance.toFixed(2)})`
                };
            }
        }
        const currentSnap = await refreshAccount();
        return {
            success: Boolean(currentSnap?.success),
            browser: '本地账号库',
            email: currentSnap?.email,
            balance: currentSnap?.balance,
            snapshot: currentSnap,
            message: scanRes.message || '已刷新当前选中账号数据'
        };
    };
    const buildCredentialHealth = () => {
        const acc = getActiveAccount();
        if (!acc)
            return null;
        const expiresAt = acc.accessTokenExpiresAt || jwtExpiry(acc.token);
        return {
            email: acc.email,
            hasRefreshToken: Boolean(acc.refreshToken),
            accessTokenExpiresAt: expiresAt,
            refreshTokenExpiresAt: acc.refreshTokenExpiresAt,
            msUntilExpiry: expiresAt ? expiresAt - Date.now() : undefined,
            mode: acc.refreshToken ? 'auto' : 'manual',
            lastRefreshedAt: acc.refreshedAt
        };
    };
    const buildResponsePayload = (extra = {}) => {
        const activeAcc = getActiveAccount();
        return {
            ok: true,
            activeEmail: store.activeEmail,
            refreshInterval: store.refreshInterval || '30s',
            snapshot: activeAcc?.snapshot || null,
            /** 凭据健康度：前端据此显示「自动续期中，还可撑 X 小时」 */
            credential: buildCredentialHealth(),
            accounts: store.accounts.map(a => ({
                email: a.email,
                balance: a.balance,
                lastSyncedAt: a.lastSyncedAt,
                balanceChangedAt: a.balanceChangedAt || null,
                active: a.email === store.activeEmail,
                hasRefreshToken: Boolean(a.refreshToken),
                snapshot: a.snapshot || null
            })),
            preferences: store.preferences,
            lastTurn: lastReport,
            lastTurnSeq: lastReportSeq,
            update: lastUpdateInfo,
            version: getPluginVersion(),
            ...extra
        };
    };
    /** 记录一轮汇报；seq 单调递增，前端据此判断是否为新轮次。 */
    const recordTurnReport = (report) => {
        lastReport = report;
        lastReportSeq += 1;
        reportHistory.unshift(report);
        if (reportHistory.length > 50)
            reportHistory.length = 50;
    };
    /** 按用户偏好决定是否发通知，并组装文案。 */
    const notifyTurnReport = async (report) => {
        const prefs = store.preferences;
        const mode = prefs.notifyMode || (prefs.notifyOnComplete ? 'both' : 'off');
        const allowWin = mode === 'both' || mode === 'windows';
        if (!allowWin)
            return;
        if (report.isSubagent && prefs.notifySubagentMute)
            return;
        if (report.reason !== 'completed' && !prefs.notifyOnFailure)
            return;
        const tokens = report.tokens.totalTokens;
        const quotaText = report.quotaSource === 'unavailable'
            ? '额度待下次刷新同步'
            : `${report.quotaSource === 'estimated' ? '约 ' : ''}$${report.quota.toFixed(4)}`;
        const titlePrefix = report.reason === 'completed'
            ? '任务完成'
            : (report.reason === 'error' ? '任务失败' : '任务中断');
        const lines = [
            `本轮 ${tokens.toLocaleString('en-US')} Tokens · 实扣 ${quotaText}`,
            `会话累计 ${report.sessionTokens.toLocaleString('en-US')} Tokens · $${report.sessionQuota.toFixed(4)}`
        ];
        if (typeof report.balanceAfter === 'number') {
            lines.push(`当前余额 $${report.balanceAfter.toFixed(2)}`);
        }
        const customSoundPath = resolveSoundFilePath(prefs.soundEffect);
        await sendDesktopNotification({
            title: `${titlePrefix} · ${report.sessionTitle}`.slice(0, 110),
            body: lines.join('\n'),
            sound: prefs.soundEffect === 'none' ? false : (customSoundPath ? false : (prefs.notifySound === 'none' ? false : prefs.notifySound)),
            customSoundPath,
            launch: 'dsh://open'
        });
    };
    /** 会话跟踪器：把一轮结束转成“记录 + 通知”。 */
    const sessionTracker = createSessionTracker({
        getCachedSnapshot: () => cachedSnapshot,
        refreshSnapshot: async () => {
            // 只刷当前账号：轮次开始/结束各调一次，若顺带刷 N 个账号，
            // 一轮对话就会打出 2×(N+1) 次上游请求，很容易触发限流。
            const snap = await refreshAccount(undefined, { others: false }).catch(() => null);
            return snap && snap.success ? snap : null;
        },
        onReport: async (report) => {
            recordTurnReport(report);
            await notifyTurnReport(report).catch(() => { });
        },
        logger
    });
    /** 检查更新（带并发合并，避免前端连点打出一串请求）。 */
    const runUpdateCheck = async (force = false) => {
        if (!force && lastUpdateInfo && Date.now() - lastUpdateInfo.checkedAt < 60_000) {
            return lastUpdateInfo;
        }
        if (updateInFlight)
            return updateInFlight;
        updateInFlight = checkForUpdate({
            preferences: store.preferences,
            currentVersion: getPluginVersion()
        })
            .then((info) => {
            lastUpdateInfo = info;
            return info;
        })
            .catch((err) => {
            const info = {
                available: false,
                currentVersion: getPluginVersion(),
                checkedAt: Date.now(),
                source: 'none',
                error: err?.message || String(err)
            };
            lastUpdateInfo = info;
            return info;
        })
            .finally(() => {
            updateInFlight = null;
        });
        return updateInFlight;
    };
    const handleHttpRequest = async (req, res) => {
        // 来源校验：非白名单 Origin 一律拒绝。
        // 只靠 CORS 不够（简单请求仍会被发出），必须在服务端也挡住。
        const origin = req.headers.origin;
        if (!isAllowedOrigin(origin)) {
            try {
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Forbidden origin');
            }
            catch { }
            return;
        }
        if (req.method === 'OPTIONS') {
            sendJson(res, 200, { ok: true });
            return;
        }
        // URL 解析必须包在 try 里：畸形请求行（如 "GET //[::1 HTTP/1.1"）会让 new URL 抛错，
        // 而这个 async 函数是裸调用（没有 .catch），抛错会变成未处理 rejection 直接打崩主进程。
        let url;
        try {
            url = new URL(String(req.url || '/'), 'http://127.0.0.1');
        }
        catch {
            try {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Bad Request');
            }
            catch { }
            return;
        }
        const route = url.pathname.startsWith(API_PREFIX)
            ? url.pathname.slice(API_PREFIX.length) || '/'
            : url.pathname;
        try {
            if (req.method === 'GET' && (route === '/snapshot' || route === '/')) {
                const shouldSyncBrowser = url.searchParams.get('syncBrowser') === '1';
                const targetEmail = url.searchParams.get('email') || undefined;
                if (shouldSyncBrowser) {
                    const syncRes = await syncFromBrowser(false, undefined, false);
                    sendJson(res, 200, buildResponsePayload({
                        browserSynced: syncRes.success,
                        browser: syncRes.browser,
                        message: syncRes.message
                    }));
                    return;
                }
                await refreshAccount(targetEmail);
                sendJson(res, 200, buildResponsePayload());
                return;
            }
            if (req.method === 'POST' && route === '/sync') {
                const body = await readJsonBody(req);
                const result = await syncFromBrowser(Boolean(body?.forceCapture), body?.token, true);
                sendJson(res, 200, buildResponsePayload({
                    ok: result.success,
                    browser: result.browser,
                    message: result.message
                }));
                return;
            }
            if (req.method === 'POST' && route === '/switch') {
                const body = await readJsonBody(req);
                const targetEmail = String(body?.email || '').trim();
                const found = store.accounts.find(a => a.email === targetEmail);
                if (!found) {
                    sendJson(res, 404, { ok: false, message: `未找到账号 ${targetEmail}` });
                    return;
                }
                store.activeEmail = found.email;
                await refreshAccount(found.email);
                sendJson(res, 200, buildResponsePayload({
                    message: `已切换至账号 ${found.email}`
                }));
                return;
            }
            if (req.method === 'POST' && route === '/interval') {
                const body = await readJsonBody(req);
                const interval = String(body?.interval || '').trim();
                if (INTERVAL_MAP[interval]) {
                    store.refreshInterval = interval;
                    persistNow();
                    // 重建后台定时器，否则后端仍按启动时的旧频率刷新
                    try {
                        refreshIntervalApplier?.();
                    }
                    catch (err) {
                        logger?.warn?.(`[鱼鱼API] 重建刷新定时器失败: ${err?.message || err}`);
                    }
                    sendJson(res, 200, buildResponsePayload({
                        refreshInterval: store.refreshInterval,
                        message: `刷新频率已设置为 ${interval}`
                    }));
                    return;
                }
                sendJson(res, 400, { ok: false, message: '无效的刷新频率参数' });
                return;
            }
            if (req.method === 'POST' && route === '/remove') {
                const body = await readJsonBody(req);
                const targetEmail = String(body?.email || '').trim();
                if (store.accounts.length <= 1) {
                    sendJson(res, 400, { ok: false, message: '至少需要保留一个账号' });
                    return;
                }
                store.accounts = store.accounts.filter(a => a.email !== targetEmail);
                if (store.activeEmail === targetEmail) {
                    store.activeEmail = store.accounts[0].email;
                }
                persistNow();
                await refreshAccount(store.activeEmail);
                sendJson(res, 200, buildResponsePayload({
                    message: `已移除账号 ${targetEmail}`
                }));
                return;
            }
            if (req.method === 'GET' && route === '/last-turn') {
                sendJson(res, 200, {
                    ok: true,
                    seq: lastReportSeq,
                    lastTurn: lastReport,
                    history: reportHistory.slice(0, 20)
                });
                return;
            }
            if (req.method === 'GET' && route === '/settings') {
                sendJson(res, 200, {
                    ok: true,
                    preferences: store.preferences,
                    version: getPluginVersion()
                });
                return;
            }
            if (req.method === 'POST' && route === '/settings') {
                const body = await readJsonBody(req);
                const previous = store.preferences;
                const next = sanitizePreferences(body?.preferences ?? body, previous);
                if (body?.widgetPosition !== undefined) {
                    next.widgetPosition = normalizeWidgetPosition(body.widgetPosition);
                }
                store.preferences = next;
                persistNow();
                sendJson(res, 200, {
                    ok: true,
                    preferences: store.preferences,
                    message: '设置已保存'
                });
                return;
            }
            if (req.method === 'POST' && route === '/notify/test') {
                const body = await readJsonBody(req);
                const soundKey = typeof body?.soundEffect === 'string' ? body.soundEffect : store.preferences.soundEffect;
                const customSoundPath = resolveSoundFilePath(soundKey);
                const result = await sendDesktopNotification({
                    title: '任务完成 · 鱼鱼配额插件测试通知',
                    body: [
                        '本轮 12,345 Tokens · 实扣 $0.0123',
                        '会话累计 45,678 Tokens · $0.0456',
                        '这是一条测试通知，用来确认声音与弹窗是否正常'
                    ].join('\n'),
                    sound: body?.silent === true || soundKey === 'none' ? false : (customSoundPath ? false : (store.preferences.notifySound === 'none' ? false : store.preferences.notifySound)),
                    customSoundPath,
                    launch: 'dsh://open'
                });
                sendJson(res, 200, {
                    ok: result.ok,
                    detail: result.detail,
                    message: result.ok ? '测试通知已发送' : '通知发送失败（已尝试用系统提示音兜底）'
                });
                return;
            }
            if (req.method === 'POST' && route === '/sound/test') {
                const body = await readJsonBody(req);
                const soundKey = typeof body?.sound === 'string' ? body.sound : store.preferences.soundEffect;
                const customPath = resolveSoundFilePath(soundKey);
                const played = await playSystemAlertSound(customPath);
                sendJson(res, 200, { ok: played, message: played ? '已播放提示音' : '播放失败' });
                return;
            }
            if (req.method === 'GET' && route === '/update') {
                const force = url.searchParams.get('force') === '1';
                const info = await runUpdateCheck(force);
                sendJson(res, 200, {
                    ok: true,
                    update: info,
                    version: getPluginVersion(),
                    agentRunning: sessionTracker.isAgentRunning()
                });
                return;
            }
            if (req.method === 'GET' && route === '/update/progress') {
                sendJson(res, 200, {
                    ok: true,
                    progress: currentUpdateProgress,
                    agentRunning: sessionTracker.isAgentRunning()
                });
                return;
            }
            if (req.method === 'POST' && route === '/update/download') {
                const info = await runUpdateCheck(false);
                if (!info.available || !info.downloadUrl) {
                    sendJson(res, 400, { ok: false, message: '当前没有可下载的新版本' });
                    return;
                }
                // 安全闸门：没有可校验的 sha256 就不允许自动安装。
                // 否则一旦更新源被中间人/恶意 feed 篡改，下载到的包会被直接解压到插件目录，
                // 等于把任意代码写进本机（并随 DSH 启动执行）。
                if (!info.sha256 || !/^[a-f0-9]{64}$/i.test(info.sha256)) {
                    sendJson(res, 400, {
                        ok: false,
                        error: '更新源未提供 sha256 校验值，已拒绝自动安装',
                        message: '更新源未提供 sha256 校验值，为安全起见已拒绝自动安装。请手动下载安装包。',
                        releaseUrl: info.releaseUrl
                    });
                    return;
                }
                const agentRunningBefore = sessionTracker.isAgentRunning();
                currentUpdateProgress = { status: '正在连接下载源...', loaded: 0, total: info.fileSize || 0, percent: 0 };
                const result = await downloadUpdate(info, {
                    onProgress: (loaded, total) => {
                        const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
                        currentUpdateProgress = {
                            status: percent >= 100 ? '正在校验完整性与安装...' : `正在下载... (${(loaded / 1024).toFixed(1)} KB / ${(total / 1024).toFixed(1)} KB)`,
                            loaded,
                            total,
                            percent
                        };
                    }
                });
                if (!result.ok || !result.file) {
                    currentUpdateProgress = null;
                    sendJson(res, 200, { ok: false, error: result.error || '下载校验失败' });
                    return;
                }
                currentUpdateProgress = { status: '正在自动解压安装...', loaded: result.bytes || 0, total: result.bytes || 0, percent: 100 };
                const installResult = await installUpdate(result.file);
                currentUpdateProgress = null;
                const agentRunning = sessionTracker.isAgentRunning() || agentRunningBefore;
                sendJson(res, 200, {
                    ok: installResult.ok,
                    installed: installResult.ok,
                    agentRunning,
                    file: result.file,
                    bytes: result.bytes,
                    sha256: result.sha256,
                    error: installResult.error,
                    message: installResult.ok
                        ? (agentRunning
                            ? '新版本已自动安装完成！检测到当前有 Agent 正在运行任务，请在当前任务完成后重启 DSH 生效。'
                            : '新版本已自动安装完成！请重启 DSH 使新版本生效。')
                        : `自动安装遇到问题: ${installResult.error || '未知错误'}`
                });
                return;
            }
            if (req.method === 'GET' && route === '/tutorial') {
                const tutorialCandidates = [
                    path.resolve(__dirname, '../tutorial.html'),
                    path.resolve(__dirname, './tutorial.html'),
                    path.join(process.cwd(), 'tutorial.html')
                ];
                for (const p of tutorialCandidates) {
                    if (fs.existsSync(p)) {
                        const html = fs.readFileSync(p, 'utf8');
                        res.writeHead(200, {
                            'Content-Type': 'text/html; charset=utf-8',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(html);
                        return;
                    }
                }
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Tutorial not found');
                return;
            }
            if (req.method === 'POST' && route === '/open-tutorial') {
                const found = findTutorialFile();
                if (found) {
                    // 用 openPath 而不是拼字符串进 shell：路径来自 __dirname，可能是插件安装目录，
                    // 直接拼 exec 会被路径里的空格/引号破坏（也构成命令注入面）。
                    if (openPath(found)) {
                        sendJson(res, 200, { ok: true, message: '已在浏览器中打开使用教程' });
                        return;
                    }
                }
                sendJson(res, 404, { ok: false, message: '未找到 tutorial.html 文件' });
                return;
            }
            if (req.method === 'POST' && route === '/open-topup') {
                if (openExternal('https://sub.anzhiyu.com/recharge-center')) {
                    sendJson(res, 200, { ok: true, message: '已在浏览器中打开充值中心' });
                }
                else {
                    sendJson(res, 500, { ok: false, message: '打开充值中心失败' });
                }
                return;
            }
            // 手动触发凭据续期：前端「立即续期」按钮 / 诊断用
            if (req.method === 'POST' && route === '/credential/refresh') {
                const body = await readJsonBody(req);
                const targetEmail = String(body?.email || store.activeEmail || '').trim();
                const acc = store.accounts.find(a => a.email === targetEmail);
                if (!acc) {
                    sendJson(res, 404, { ok: false, message: `未找到账号 ${targetEmail}` });
                    return;
                }
                const token = await credentialManager.ensureFresh(acc.email, true);
                if (!token) {
                    sendJson(res, 200, {
                        ok: false,
                        credential: buildCredentialHealth(),
                        message: acc.refreshToken
                            ? '自动续期失败：refresh token 可能已过期，请在浏览器重新登录后点「从浏览器同步」'
                            : '该账号没有 refresh token，无法自动续期：请先在浏览器登录 sub.anzhiyu.com 并点「从浏览器同步」'
                    });
                    return;
                }
                const snap = await refreshAccount(acc.email);
                sendJson(res, 200, {
                    ok: Boolean(snap?.success),
                    credential: buildCredentialHealth(),
                    message: snap?.success
                        ? `凭据已续期，当前余额 $${Number(snap.balance || 0).toFixed(2)}`
                        : '凭据已续期，但余额刷新失败，请稍后重试'
                });
                return;
            }
            if (req.method === 'GET' && route.startsWith('/assets/')) {
                const rawName = route.slice('/assets/'.length);
                // 空文件名会把候选路径解析成 assets/ 目录本身，createReadStream(dir) 会抛 EISDIR
                // 并作为未捕获异常打崩进程 —— 必须先挡掉。
                const fileName = path.basename(rawName);
                if (!fileName || fileName === '.' || fileName === '..') {
                    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Bad asset name');
                    return;
                }
                // 只允许白名单扩展名，避免任意文件读取
                const ext = path.extname(fileName).toLowerCase();
                const mimeMap = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.wav': 'audio/wav',
                    '.mp3': 'audio/mpeg'
                };
                if (!mimeMap[ext]) {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Asset not found');
                    return;
                }
                const assetCandidates = [
                    path.resolve(__dirname, '../assets', fileName),
                    path.resolve(__dirname, './assets', fileName),
                    path.join(process.cwd(), 'assets', fileName)
                ];
                let foundPath = '';
                for (const p of assetCandidates) {
                    try {
                        // 必须是普通文件：目录/设备文件一律跳过
                        if (fs.statSync(p).isFile()) {
                            foundPath = p;
                            break;
                        }
                    }
                    catch {
                        // 不存在或无权限，尝试下一个候选
                    }
                }
                if (!foundPath) {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Asset not found');
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': mimeMap[ext],
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=86400'
                });
                // 流必须挂 error 处理：文件在 stat 之后被删/被占用时，
                // 未处理的 'error' 事件同样会打崩进程。
                const stream = fs.createReadStream(foundPath);
                stream.on('error', () => {
                    try {
                        res.destroy();
                    }
                    catch { }
                });
                stream.pipe(res);
                return;
            }
            sendJson(res, 404, { ok: false, error: `Unknown route: ${route}` });
        }
        catch (err) {
            sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    };
    /** 由 apply() 注入：重建后台定时器。路由层改完频率后调用。 */
    let refreshIntervalApplier = null;
    const setRefreshIntervalApplier = (fn) => {
        refreshIntervalApplier = typeof fn === 'function' ? fn : null;
    };
    return {
        store,
        client,
        credentialManager,
        refreshAccount,
        syncFromBrowser,
        handleHttpRequest,
        getActiveAccount,
        buildCredentialHealth,
        setRefreshIntervalApplier,
        /** 启动时预热所有账号凭据（失败的账号保持原样，不影响其他账号） */
        warmUpCredentials: () => credentialManager.warmUp(store.accounts.map(a => a.email)),
        /** 卸载时补写未落盘的变更（节流写入器的收尾） */
        dispose: () => storeWriter.dispose(),
        sessionTracker,
        runUpdateCheck,
        recordTurnReport,
        notifyTurnReport,
        getLastReport: () => lastReport,
        getLastReportSeq: () => lastReportSeq,
        getUpdateInfo: () => lastUpdateInfo
    };
}
/**
 * 启动本地免重启 CORS 桥接守护端口 (127.0.0.1:53788)
 */
export function startLocalBridgeServer(service, port = BRIDGE_PORT) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            service.handleHttpRequest(req, res).catch((err) => {
                // 兜底：任何未预期异常都只能影响当前请求，绝不能让进程退出
                try {
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    }
                    res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
                }
                catch { }
            });
        });
        server.on('error', () => {
            resolve(null);
        });
        server.listen(port, '127.0.0.1', () => {
            resolve(server);
        });
    });
}
/**
 * 在 ctx 上解析一个可选服务。
 *
 * Cordis 的服务解析路径是 `ctx.reflect.get(name, strict=false)` 或属性代理
 * `ctx[name]`；但属性代理在服务“未被提供”时会抛
 * `cannot get property "x" without inject`，因此每一次探测都必须包裹 try/catch，
 * 否则一个缺失的可选服务会连带打断整个 apply()。
 *
 * `ctx.get` 不是公开 API（只存在于内部 ReflectService 上），仅作兼容探测。
 */
function resolveService(ctx, serviceName) {
    const probes = [
        // 本版本推荐：非严格解析，服务未提供时返回 undefined 而不是抛错
        () => ctx?.reflect?.get?.(serviceName, false),
        // 属性代理（服务存在时等价于 ctx.serviceName）
        () => ctx?.[serviceName],
        () => ctx?.get?.(serviceName, false),
        () => ctx?.root?.[serviceName],
    ];
    for (const probe of probes) {
        try {
            const value = probe();
            if (value && (typeof value === 'object' || typeof value === 'function'))
                return value;
        }
        catch {
            // 该探测路径不可用或服务未提供，继续尝试下一种
        }
    }
    return undefined;
}
/**
 * 把工具注册到当前 DSH 版本真实的工具服务上。
 * 本版本的工具服务是 @deepseek-ai/dsh-tools 的 ToolRuntime（ctx.tools），
 * 注册方法为 register(definition)，返回 disposer。旧版 ctx.agent.registerTool
 * 作为回退保留。
 */
function registerBalanceTool(ctx, tool, logger) {
    // 1) 本版本：tools 服务，register({ name, description, parameters, output, execute })
    const tools = resolveService(ctx, 'tools');
    if (tools && typeof tools.register === 'function') {
        const definition = {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters?.properties ? tool.parameters.properties : tool.parameters,
            output: {
                schema: { type: 'array', items: { type: 'json' } },
                render: (_args, value) => value
            },
            execute: async (args) => [{ type: 'text', text: await tool.execute(args) }]
        };
        try {
            const disposer = tools.register(definition);
            if (typeof disposer === 'function' && typeof ctx.effect === 'function') {
                ctx.effect(() => disposer, 'dsh-plugin-yuyu-quota: tool');
            }
            return 'tools.register';
        }
        catch (err) {
            logger?.warn?.(`[鱼鱼API] tools.register 失败: ${err?.message || err}`);
        }
    }
    // 2) 旧版：agent.registerTool（属性代理在服务缺失时会抛错，必须包裹）
    try {
        const agent = ctx?.agent;
        if (agent && typeof agent.registerTool === 'function') {
            agent.registerTool(tool);
            return 'agent.registerTool';
        }
    }
    catch {
        // 无 agent 服务，继续
    }
    // 3) 旧版：ctx.tool(...)
    try {
        if (typeof ctx?.tool === 'function') {
            ctx.tool(tool);
            return 'ctx.tool';
        }
    }
    catch {
        // 无 tool 方法，继续
    }
    logger?.warn?.('[鱼鱼API] 未找到可用的工具注册接口，Agent 工具不可用（余额主链路不受影响）');
    return 'none';
}
export function apply(ctx, config = {}) {
    const logger = typeof ctx.logger === 'function' ? ctx.logger('yuyu-quota') : (ctx.logger || console);
    const service = createYuyuService(config, logger);
    let timer = null;
    let bridgeServer = null;
    const notes = [];
    // 1. 先启动本地 CORS 桥接服务 —— 这是前端的主通道，必须最先起作用
    startLocalBridgeServer(service)
        .then((srv) => {
        bridgeServer = srv;
        if (!srv)
            logger?.warn?.('[鱼鱼API] 端口 53788 被占用，bridge 未启动（将回退 DSH 同源路由）');
    })
        .catch(() => { });
    // 2. 注册 DSH 官方 webServer 路由（存在才注册，缺失不阻断）
    const webServer = resolveService(ctx, 'webServer');
    if (webServer && typeof webServer.register === 'function') {
        try {
            const disposer = webServer.register({
                kind: 'prefix',
                path: API_PREFIX,
                handler: (req, res) => {
                    service.handleHttpRequest(req, res).catch((err) => {
                        try {
                            if (!res.headersSent) {
                                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                            }
                            res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
                        }
                        catch { }
                    });
                }
            });
            if (typeof disposer === 'function' && typeof ctx.effect === 'function') {
                ctx.effect(() => disposer, 'dsh-plugin-yuyu-quota: api');
            }
            notes.push('webServer=ok');
        }
        catch (err) {
            notes.push('webServer=fail');
            logger?.warn?.(`[鱼鱼API] webServer 路由注册失败: ${err?.message || err}`);
        }
    }
    else {
        notes.push('webServer=absent');
    }
    // 3. 注册 Agent Tool（失败仅告警）
    let toolReg = 'none';
    try {
        toolReg = registerBalanceTool(ctx, createYuyuBalanceTool(service.client, service.store.alertThreshold), logger);
    }
    catch (err) {
        logger?.warn?.(`[鱼鱼API] 工具注册异常: ${err?.message || err}`);
    }
    notes.push(`tool=${toolReg}`);
    // 4. 立即用已保存账号刷新一次（不走浏览器扫描，保证启动就拿到真实余额）
    //    先做一次凭据预热：把快过期/已过期的 access token 用 refresh token 换新，
    //    这样重启后不会因为 token 恰好过期而显示「未授权」。
    service
        .warmUpCredentials()
        .then(() => service.refreshAccount())
        .then((snap) => {
        if (snap?.success) {
            logger?.info?.(`[鱼鱼API] 启动刷新成功: ${snap.email} ($${snap.balance.toFixed(2)})`);
        }
    })
        .catch(() => { })
        .finally(() => {
        logger?.info?.(`[鱼鱼API] 后端已启动 bridge=53788 ${notes.join(' ')}`);
    });
    // 5. 启动后异步补充浏览器扫描（可能发现新账号 / 切换账号）
    setTimeout(() => {
        service.syncFromBrowser(false, undefined, false).catch(() => { });
    }, 1500);
    // 6. 定时刷新
    // 抽成函数是因为「刷新频率」是运行时可改的：POST /interval 只改了 store，
    // 早期版本从不重建 timer，导致用户切到「1 秒」后后端仍是旧节拍。
    const applyRefreshInterval = () => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        const ms = INTERVAL_MAP[service.store.refreshInterval] || 3 * 60 * 1000;
        timer = setInterval(() => {
            service.refreshAccount().catch(() => { });
        }, ms);
        if (typeof timer.unref === 'function')
            timer.unref();
        logger?.info?.(`[鱼鱼API] 后台刷新间隔: ${service.store.refreshInterval} (${ms}ms)`);
    };
    applyRefreshInterval();
    // 让路由层改完频率后能通知到这里
    service.setRefreshIntervalApplier(applyRefreshInterval);
    // 7. 订阅会话事件：每轮结束汇报 Token / 额度，并按偏好弹 Windows 原生通知
    const sessionDisposers = [];
    try {
        const onEvent = (session, event) => {
            try {
                service.sessionTracker.observe(session, event);
            }
            catch (err) {
                logger?.warn?.(`[鱼鱼API] 会话事件处理失败: ${err?.message || err}`);
            }
        };
        const onDisposed = (session) => {
            try {
                service.sessionTracker.forget(session);
            }
            catch { }
        };
        if (typeof ctx.on === 'function') {
            const d1 = ctx.on('session/event', onEvent);
            if (typeof d1 === 'function')
                sessionDisposers.push(d1);
            const d2 = ctx.on('session/disposed', onDisposed);
            if (typeof d2 === 'function')
                sessionDisposers.push(d2);
            notes.push('sessionWatch=ok');
        }
        else {
            notes.push('sessionWatch=absent');
        }
    }
    catch (err) {
        notes.push('sessionWatch=fail');
        logger?.warn?.(`[鱼鱼API] 会话事件订阅失败: ${err?.message || err}`);
    }
    // 8. 启动后按偏好检查一次更新
    if (service.store.preferences.updateCheck) {
        setTimeout(() => {
            service.runUpdateCheck(true).catch(() => { });
        }, 8000);
    }
    // 9. 卸载清理
    if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
            if (timer)
                clearInterval(timer);
            timer = null;
            for (const dispose of sessionDisposers) {
                try {
                    dispose();
                }
                catch { }
            }
            sessionDisposers.length = 0;
            try {
                service.sessionTracker.dispose();
            }
            catch { }
            // 把节流窗口内还没落盘的账号/凭据变更补写掉
            try {
                service.dispose();
            }
            catch { }
            if (bridgeServer) {
                try {
                    bridgeServer.close();
                }
                catch { }
                bridgeServer = null;
            }
        }, 'dsh-plugin-yuyu-quota: dispose');
    }
}
export * from './types.js';
export * from './api.js';
export * from './tool.js';
export * from './browser-sync.js';
export * from './session-tracker.js';
export * from './notify.js';
export * from './update.js';
export * from './credentials.js';
