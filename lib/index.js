import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { YuyuApiClient } from './api.js';
import { createYuyuBalanceTool } from './tool.js';
import { scanRunningBrowsersForToken, launchAndCaptureToken } from './browser-sync.js';
export const name = 'dsh-plugin-yuyu-quota';
export const inject = ['webServer'];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BRIDGE_PORT = 53788;
export const API_PREFIX = '/yuyu-quota/api';
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
        accounts: []
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
        accounts: store.accounts.map(a => ({
            email: a.email,
            token: a.token,
            balance: a.balance,
            lastSyncedAt: a.lastSyncedAt,
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
    const getActiveAccount = () => {
        return store.accounts.find(a => a.email === store.activeEmail) || store.accounts[0];
    };
    const client = new YuyuApiClient(getActiveAccount()?.token || '', store.baseUrl);
    const upsertAccount = (token, snap, setActive = true) => {
        if (!snap.email)
            return;
        const now = new Date().toISOString();
        const existingIdx = store.accounts.findIndex(a => a.email === snap.email);
        const entry = {
            email: snap.email,
            token,
            balance: snap.balance,
            lastSyncedAt: now,
            snapshot: snap
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
                other.balance = otherSnap.balance;
                other.lastSyncedAt = new Date().toISOString();
                other.snapshot = otherSnap;
            }
        }));
        saveAccountStore(store);
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
                active: a.email === store.activeEmail,
                snapshot: a.snapshot || null
            })),
            ...extra
        };
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
        getActiveAccount
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
export function apply(ctx, config = {}) {
    const logger = typeof ctx.logger === 'function' ? ctx.logger('yuyu-quota') : (ctx.logger || console);
    const service = createYuyuService(config, logger);
    let timer = null;
    let bridgeServer = null;
    // 1. 注册 Agent Tool
    const balanceTool = createYuyuBalanceTool(service.client, service.store.alertThreshold);
    if (ctx.agent?.registerTool) {
        ctx.agent.registerTool(balanceTool);
    }
    else if (typeof ctx.tool === 'function') {
        ctx.tool(balanceTool);
    }
    // 2. 注册 DSH 官方 webServer 路由
    if (ctx.webServer?.register) {
        ctx.effect(() => ctx.webServer.register({
            kind: 'prefix',
            path: API_PREFIX,
            handler: (req, res) => service.handleHttpRequest(req, res)
        }), 'dsh-plugin-yuyu-quota: api');
    }
    // 3. 启动本地 CORS 桥接服务 (127.0.0.1:53788)
    startLocalBridgeServer(service).then((srv) => {
        bridgeServer = srv;
    });
    // 4. 启动时自动从本地浏览器存储同步并刷新所有账号
    service.syncFromBrowser(false, undefined, true).catch(() => { });
    const intervalMs = INTERVAL_MAP[service.store.refreshInterval] || 3 * 60 * 1000;
    timer = setInterval(() => {
        service.refreshAccount().catch(() => { });
    }, intervalMs);
    // 5. 卸载清理
    if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
            if (timer)
                clearInterval(timer);
            if (bridgeServer) {
                try {
                    bridgeServer.close();
                }
                catch { }
            }
        }, 'dsh-plugin-yuyu-quota: dispose');
    }
}
export * from './types.js';
export * from './api.js';
export * from './tool.js';
export * from './widget.js';
export * from './browser-sync.js';
