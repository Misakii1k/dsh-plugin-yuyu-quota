import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { YuyuApiClient } from './api.js';
import { createYuyuBalanceTool } from './tool.js';
import { scanRunningBrowsersForToken, launchAndCaptureToken } from './browser-sync.js';
import { createSessionTracker } from './session-tracker.js';
import { sendDesktopNotification, playSystemAlertSound } from './notify.js';
import { checkForUpdate, downloadUpdate, getPluginVersion } from './update.js';
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
/** 用户偏好的出厂默认值 */
export function defaultPreferences() {
    return {
        notifyOnComplete: true,
        notifySound: 'Notification.Reminder',
        notifySubagentMute: true,
        notifyOnFailure: true,
        notifyOnlyWhenUnfocused: false,
        reportOnComplete: true,
        updateCheck: true,
        updateFeedUrl: '',
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
            ...(a.snapshot ? { snapshot: a.snapshot } : {})
        }))
    };
    const targets = [getGlobalStoreFile(), getLocalConfigFile()];
    for (const file of targets) {
        try {
            fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
        }
        catch { }
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
function sendJson(response, status, payload) {
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization'
    });
    response.end(JSON.stringify(payload));
}
function readJsonBody(request) {
    return new Promise((resolve) => {
        const chunks = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch {
                resolve({});
            }
        });
        request.on('error', () => resolve({}));
    });
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
    /** 最近一次快照（供会话跟踪器取轮次基线，避免每次轮次都打网络） */
    let cachedSnapshot = getActiveAccount()?.snapshot || null;
    /** 最近一轮汇报 + 单调递增 seq（前端据此判断“有新的一轮”） */
    let lastReport = null;
    let lastReportSeq = 0;
    const reportHistory = [];
    /** 最近一次更新检查结果 */
    let lastUpdateInfo = null;
    let updateInFlight = null;
    const upsertAccount = (token, snap, setActive = true) => {
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
            lastTotalRecharged: snap.totalRecharged
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
        saveAccountStore(store);
    };
    /**
     * 刷新指定或当前激活账号的实时快照，并并发刷新账号库内其他已保存账号的快照
     */
    const refreshAccount = async (targetEmail) => {
        if (targetEmail) {
            store.activeEmail = targetEmail;
        }
        const acc = getActiveAccount();
        if (!acc || !acc.token)
            return null;
        store.activeEmail = acc.email;
        client.updateToken(acc.token);
        const snap = await client.getBalanceSnapshot(store.alertThreshold);
        if (snap.success) {
            upsertAccount(acc.token, snap, true);
        }
        // 并发刷新其他保存账号的最新数据
        await Promise.allSettled(store.accounts
            .filter(a => a.email !== acc.email && a.token)
            .map(async (other) => {
            const otherClient = new YuyuApiClient(other.token, store.baseUrl);
            const otherSnap = await otherClient.getBalanceSnapshot(store.alertThreshold);
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
        saveAccountStore(store);
        if (snap.success)
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
        if (!scanRes.success && forceCapture) {
            scanRes = await launchAndCaptureToken();
        }
        if (scanRes.success && scanRes.token) {
            // 1. 将浏览器中发现的所有有效账号同步进账号库
            if (Array.isArray(scanRes.allDiscovered)) {
                for (const disc of scanRes.allDiscovered) {
                    const existing = store.accounts.find(a => a.email === disc.email);
                    if (existing) {
                        existing.token = disc.token;
                    }
                    else {
                        store.accounts.push({
                            email: disc.email,
                            token: disc.token,
                            balance: 0,
                            lastSyncedAt: new Date().toISOString()
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
    const buildResponsePayload = (extra = {}) => {
        const activeAcc = getActiveAccount();
        return {
            ok: true,
            activeEmail: store.activeEmail,
            refreshInterval: store.refreshInterval || '30s',
            snapshot: activeAcc?.snapshot || null,
            accounts: store.accounts.map(a => ({
                email: a.email,
                balance: a.balance,
                lastSyncedAt: a.lastSyncedAt,
                balanceChangedAt: a.balanceChangedAt || null,
                active: a.email === store.activeEmail,
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
        if (!prefs.notifyOnComplete)
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
        await sendDesktopNotification({
            title: `${titlePrefix} · ${report.sessionTitle}`.slice(0, 110),
            body: lines.join('\n'),
            sound: prefs.notifySound === 'none' ? false : prefs.notifySound,
            launch: 'dsh://open'
        });
    };
    /** 会话跟踪器：把一轮结束转成“记录 + 通知”。 */
    const sessionTracker = createSessionTracker({
        getCachedSnapshot: () => cachedSnapshot,
        refreshSnapshot: async () => {
            const snap = await refreshAccount().catch(() => null);
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
        if (req.method === 'OPTIONS') {
            sendJson(res, 200, { ok: true });
            return;
        }
        const url = new URL(String(req.url || '/'), 'http://127.0.0.1');
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
                    saveAccountStore(store);
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
                saveAccountStore(store);
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
                saveAccountStore(store);
                sendJson(res, 200, {
                    ok: true,
                    preferences: store.preferences,
                    message: '设置已保存'
                });
                return;
            }
            if (req.method === 'POST' && route === '/notify/test') {
                const body = await readJsonBody(req);
                const sound = store.preferences.notifySound;
                const result = await sendDesktopNotification({
                    title: '任务完成 · 鱼鱼配额插件测试通知',
                    body: [
                        '本轮 12,345 Tokens · 实扣 $0.0123',
                        '会话累计 45,678 Tokens · $0.0456',
                        '这是一条测试通知，用来确认声音与弹窗是否正常'
                    ].join('\n'),
                    sound: body?.silent === true ? false : (sound === 'none' ? false : sound),
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
                const played = await playSystemAlertSound();
                sendJson(res, 200, { ok: played, message: played ? '已播放系统提示音' : '播放失败' });
                return;
            }
            if (req.method === 'GET' && route === '/update') {
                const force = url.searchParams.get('force') === '1';
                const info = await runUpdateCheck(force);
                sendJson(res, 200, { ok: true, update: info, version: getPluginVersion() });
                return;
            }
            if (req.method === 'POST' && route === '/update/download') {
                const info = await runUpdateCheck(false);
                if (!info.available || !info.downloadUrl) {
                    sendJson(res, 400, { ok: false, message: '当前没有可下载的新版本' });
                    return;
                }
                const result = await downloadUpdate(info);
                sendJson(res, 200, {
                    ok: result.ok,
                    file: result.file,
                    bytes: result.bytes,
                    sha256: result.sha256,
                    error: result.error,
                    message: result.ok
                        ? `已下载并校验通过：${result.file}`
                        : (result.error || '下载失败'),
                    installHint: result.file
                        ? '在 DSH 中执行：dsh plugin --profile desktop add "' + result.file + '"，然后 Ctrl+R 生效'
                        : undefined
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
                const tutorialCandidates = [
                    path.resolve(__dirname, '../tutorial.html'),
                    path.resolve(__dirname, './tutorial.html'),
                    path.join(process.cwd(), 'tutorial.html')
                ];
                let found = '';
                for (const p of tutorialCandidates) {
                    if (fs.existsSync(p)) {
                        found = p;
                        break;
                    }
                }
                if (found) {
                    if (process.platform === 'win32') {
                        exec(`start "" "${found}"`);
                    }
                    else if (process.platform === 'darwin') {
                        exec(`open "${found}"`);
                    }
                    else {
                        exec(`xdg-open "${found}"`);
                    }
                    sendJson(res, 200, { ok: true, message: '已在浏览器中打开使用教程' });
                    return;
                }
                sendJson(res, 404, { ok: false, message: '未找到 tutorial.html 文件' });
                return;
            }
            sendJson(res, 404, { ok: false, error: `Unknown route: ${route}` });
        }
        catch (err) {
            sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        }
    };
    return {
        store,
        client,
        refreshAccount,
        syncFromBrowser,
        handleHttpRequest,
        getActiveAccount,
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
            service.handleHttpRequest(req, res);
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
                handler: (req, res) => service.handleHttpRequest(req, res)
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
    service
        .refreshAccount()
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
    const intervalMs = INTERVAL_MAP[service.store.refreshInterval] || 3 * 60 * 1000;
    timer = setInterval(() => {
        service.refreshAccount().catch(() => { });
    }, intervalMs);
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
export * from './widget.js';
export * from './browser-sync.js';
export * from './session-tracker.js';
export * from './notify.js';
export * from './update.js';
