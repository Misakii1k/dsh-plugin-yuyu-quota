import fs from 'node:fs';
import path from 'node:path';
import { YuyuApiClient } from './api.js';
/**
 * 支持检测的 Chromium 浏览器列表
 */
function getBrowserCandidates() {
    const localAppData = process.env.LOCALAPPDATA || '';
    return [
        {
            name: 'Google Chrome',
            channel: 'chrome',
            portFile: path.join(localAppData, 'Google/Chrome/User Data/DevToolsActivePort')
        },
        {
            name: 'Microsoft Edge',
            channel: 'msedge',
            portFile: path.join(localAppData, 'Microsoft/Edge/User Data/DevToolsActivePort')
        },
        {
            name: 'Brave Browser',
            portFile: path.join(localAppData, 'BraveSoftware/Brave-Browser/User Data/DevToolsActivePort')
        },
        {
            name: 'Chrome Canary',
            portFile: path.join(localAppData, 'Google/Chrome SxS/User Data/DevToolsActivePort')
        },
        {
            name: 'Chrome Beta',
            portFile: path.join(localAppData, 'Google/Chrome Beta/User Data/DevToolsActivePort')
        }
    ];
}
/**
 * 寻找本地已安装的浏览器可执行文件
 */
export function getAvailableBrowserExecutables() {
    const localAppData = process.env.LOCALAPPDATA || '';
    const list = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'
    ];
    return list.filter(p => fs.existsSync(p));
}
/**
 * 获取 Puppeteer 运行时引用
 */
async function getPuppeteer() {
    const dynamicImport = new Function('u', 'return import(u)');
    try {
        const mod = await dynamicImport('file:///D:/npm-cache/_npx/15c61037b1978c83/node_modules/chrome-devtools-mcp/build/src/third_party/index.js');
        return mod.puppeteer;
    }
    catch {
        try {
            const p = await dynamicImport('puppeteer-core');
            return p.default || p;
        }
        catch {
            throw new Error('未找到 Puppeteer 模块，请先运行 npm install');
        }
    }
}
/**
 * 从已连接的 Browser 实例中检索 sub.anzhiyu.com 标签页并提取 Token
 */
async function extractTokenFromBrowser(browser, browserName) {
    const pages = await browser.pages();
    const targetPage = pages.find((p) => p.url().includes('sub.anzhiyu.com'));
    if (!targetPage) {
        return null;
    }
    const token = await targetPage.evaluate(() => localStorage.getItem('auth_token'));
    if (token) {
        const client = new YuyuApiClient(token);
        const profile = await client.getProfile().catch(() => null);
        return {
            success: true,
            browser: browserName,
            token,
            email: profile?.email || '已连接',
            balance: profile ? Number(profile.balance || 0) : undefined,
            message: `成功从 ${browserName} 提取凭据并验证成功！`
        };
    }
    else {
        return {
            success: false,
            browser: browserName,
            needsLogin: true,
            message: `检测到 ${browserName} 已打开鱼鱼API页面，但尚未完成登录`
        };
    }
}
/**
 * 智能扫描运行中的所有 Chromium 浏览器活动标签页并提取凭证
 */
export async function scanRunningBrowsersForToken() {
    const candidates = getBrowserCandidates();
    const puppeteer = await getPuppeteer();
    for (const candidate of candidates) {
        // 1. 优先尝试 Chrome 144+ 原生 channel 自动连接
        if (candidate.channel) {
            try {
                const browser = await puppeteer.connect({ channel: candidate.channel });
                const result = await extractTokenFromBrowser(browser, candidate.name);
                await browser.disconnect().catch(() => { });
                if (result)
                    return result;
            }
            catch {
                // channel 连接失败时继续尝试 DevToolsActivePort 文件
            }
        }
        // 2. 尝试通过 DevToolsActivePort 文件连接
        if (!fs.existsSync(candidate.portFile)) {
            continue;
        }
        try {
            const content = fs.readFileSync(candidate.portFile, 'utf8').trim().split('\n');
            const port = parseInt(content[0]?.trim() || '', 10);
            const wsPath = content[1]?.trim();
            if (!port || !wsPath)
                continue;
            const wsEndpoint = `ws://127.0.0.1:${port}${wsPath}`;
            const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
            const result = await extractTokenFromBrowser(browser, candidate.name);
            await browser.disconnect().catch(() => { });
            if (result)
                return result;
        }
        catch {
            continue;
        }
    }
    return {
        success: false,
        needsLogin: true,
        message: '未在运行中的浏览器（Chrome/Edge/Brave等）中检测到已登录的鱼鱼API标签页'
    };
}
/**
 * 调起独立登录窗口并自动捕获凭据
 */
export async function launchAndCaptureToken(timeoutMs = 120000) {
    const executables = getAvailableBrowserExecutables();
    if (executables.length === 0) {
        return {
            success: false,
            message: '本地未找到 Chrome 或 Edge 等可用浏览器'
        };
    }
    const browserPath = executables[0];
    const puppeteer = await getPuppeteer();
    const tempProfileDir = path.join(process.env.TEMP || '', `yuyu-dsh-auth-${Date.now()}`);
    let browser = null;
    try {
        browser = await puppeteer.launch({
            executablePath: browserPath,
            headless: false,
            userDataDir: tempProfileDir,
            defaultViewport: null,
            args: ['--window-size=960,720', '--app=https://sub.anzhiyu.com/usage']
        });
        const pages = await browser.pages();
        const page = pages[0] || (await browser.newPage());
        // 轮询等待用户登录完成并捕获 token
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (browser && !browser.isConnected()) {
                break;
            }
            const token = await page.evaluate(() => {
                try {
                    return localStorage.getItem('auth_token');
                }
                catch {
                    return null;
                }
            }).catch(() => null);
            if (token) {
                const client = new YuyuApiClient(token);
                const profile = await client.getProfile().catch(() => null);
                await browser.close().catch(() => { });
                // 清理临时会话目录
                try {
                    fs.rmSync(tempProfileDir, { recursive: true, force: true });
                }
                catch { }
                return {
                    success: true,
                    browser: '独立登录窗口',
                    token,
                    email: profile?.email || '已验证',
                    balance: profile ? Number(profile.balance || 0) : undefined,
                    message: '登录成功并已自动同步凭据！'
                };
            }
            await new Promise(r => setTimeout(r, 1200));
        }
        await browser.close().catch(() => { });
        try {
            fs.rmSync(tempProfileDir, { recursive: true, force: true });
        }
        catch { }
        return {
            success: false,
            message: '登录窗口已关闭或等待超时，未能捕获到登录凭据'
        };
    }
    catch (err) {
        if (browser) {
            await browser.close().catch(() => { });
        }
        try {
            fs.rmSync(tempProfileDir, { recursive: true, force: true });
        }
        catch { }
        return {
            success: false,
            message: `调起登录窗口异常: ${err?.message || err}`
        };
    }
}
