import fs from 'node:fs';
import path from 'node:path';
import { YuyuApiClient } from './api.js';

export interface SyncResult {
  success: boolean;
  browser?: string;
  token?: string;
  email?: string;
  balance?: number;
  message?: string;
  needsLogin?: boolean;
}

interface BrowserCandidate {
  name: string;
  portFile: string;
}

/**
 * 支持检测的 Chromium 浏览器列表
 */
function getBrowserCandidates(): BrowserCandidate[] {
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    {
      name: 'Google Chrome',
      portFile: path.join(localAppData, 'Google/Chrome/User Data/DevToolsActivePort')
    },
    {
      name: 'Microsoft Edge',
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
export function getAvailableBrowserExecutables(): string[] {
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
async function getPuppeteer(): Promise<any> {
  const dynamicImport = new Function('u', 'return import(u)');
  try {
    const mod = await dynamicImport('file:///D:/npm-cache/_npx/15c61037b1978c83/node_modules/chrome-devtools-mcp/build/src/third_party/index.js');
    return mod.puppeteer;
  } catch {
    try {
      const p = await dynamicImport('puppeteer-core');
      return p.default || p;
    } catch {
      throw new Error('未找到 Puppeteer 模块，请先运行 npm install');
    }
  }
}

/**
 * 智能扫描运行中的所有 Chromium 浏览器活动标签页并提取凭证
 */
export async function scanRunningBrowsersForToken(): Promise<SyncResult> {
  const candidates = getBrowserCandidates();
  const puppeteer = await getPuppeteer();

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.portFile)) {
      continue;
    }

    try {
      const content = fs.readFileSync(candidate.portFile, 'utf8').trim().split('\n');
      const port = parseInt(content[0]?.trim() || '', 10);
      const wsPath = content[1]?.trim();

      if (!port || !wsPath) continue;

      const wsEndpoint = `ws://127.0.0.1:${port}${wsPath}`;
      const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
      const pages = await browser.pages();

      const targetPage = pages.find((p: any) => p.url().includes('sub.anzhiyu.com'));
      if (targetPage) {
        const token = await targetPage.evaluate(() => localStorage.getItem('auth_token'));
        await browser.disconnect();

        if (token) {
          // 验证并获取最新余额
          const client = new YuyuApiClient(token);
          const profile = await client.getProfile().catch(() => null);

          return {
            success: true,
            browser: candidate.name,
            token,
            email: profile?.email || '已连接',
            balance: profile ? Number(profile.balance || 0) : undefined,
            message: `成功从 ${candidate.name} 提取凭据并验证成功！`
          };
        } else {
          return {
            success: false,
            browser: candidate.name,
            needsLogin: true,
            message: `检测到 ${candidate.name} 已打开鱼鱼API页面，但尚未完成登录`
          };
        }
      }

      await browser.disconnect();
    } catch (err: any) {
      // 当前浏览器连接异常或拒绝，继续尝试下一个候选
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
export async function launchAndCaptureToken(timeoutMs = 120000): Promise<SyncResult> {
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

  let browser: any = null;
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
        } catch {
          return null;
        }
      }).catch(() => null);

      if (token) {
        const client = new YuyuApiClient(token);
        const profile = await client.getProfile().catch(() => null);
        await browser.close().catch(() => {});

        // 清理临时会话目录
        try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}

        return {
          success: true,
          browser: path.basename(browserPath),
          token,
          email: profile?.email || '已连接',
          balance: profile ? Number(profile.balance || 0) : undefined,
          message: '登录捕获成功，凭证已自动就绪！'
        };
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    await browser.close().catch(() => {});
    return {
      success: false,
      message: '登录超时或窗口被提前关闭，未捕获到登录凭证'
    };
  } catch (err: any) {
    if (browser) await browser.close().catch(() => {});
    return {
      success: false,
      message: `拉起登录窗口失败: ${err?.message || err}`
    };
  }
}
