import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { YuyuApiClient } from './api.js';

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

interface BrowserUserDataCandidate {
  name: string;
  userDataDir: string;
}

/**
 * 支持无感读取本地 LevelDB 存储的浏览器列表（零 MCP、零远程调试端口依赖）
 */
function getBrowserUserDataCandidates(): BrowserUserDataCandidate[] {
  const localAppData = process.env.LOCALAPPDATA || '';
  return [
    {
      name: 'Google Chrome',
      userDataDir: path.join(localAppData, 'Google/Chrome/User Data')
    },
    {
      name: 'Microsoft Edge',
      userDataDir: path.join(localAppData, 'Microsoft/Edge/User Data')
    },
    {
      name: 'Brave Browser',
      userDataDir: path.join(localAppData, 'BraveSoftware/Brave-Browser/User Data')
    },
    {
      name: 'Chrome Canary',
      userDataDir: path.join(localAppData, 'Google/Chrome SxS/User Data')
    },
    {
      name: 'Chrome Beta',
      userDataDir: path.join(localAppData, 'Google/Chrome Beta/User Data')
    }
  ];
}

const JWT_REGEX = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/**
 * 直接从本地浏览器 Local Storage LevelDB 文件中无感扫描所有鱼鱼API 登录 Token
 * 特点：
 * 1. 默认不采用 MCP，不依赖 Puppeteer，不需要开启 Chrome 远程调试端口
 * 2. 根据 JWT 的 iat (签发时间戳) 精准判断用户最后一次切换登录的账号
 * 3. 同时发现所有历史登录且未过期的账号，支持多账号秒切
 */
export function scanLocalLevelDBTokens(): {
  latest: DiscoveredToken | null;
  all: DiscoveredToken[];
} {
  const candidates = getBrowserUserDataCandidates();
  const byEmail = new Map<string, DiscoveredToken>();
  let latestOverall: DiscoveredToken | null = null;
  const nowMs = Date.now();

  for (const browser of candidates) {
    if (!fs.existsSync(browser.userDataDir)) continue;

    let profileDirs: string[] = [];
    try {
      profileDirs = fs.readdirSync(browser.userDataDir).filter(
        d => d === 'Default' || d.startsWith('Profile ')
      );
    } catch {
      continue;
    }

    for (const prof of profileDirs) {
      const leveldbDir = path.join(browser.userDataDir, prof, 'Local Storage', 'leveldb');
      if (!fs.existsSync(leveldbDir)) continue;

      let files: { name: string; full: string; mtime: number }[] = [];
      try {
        files = fs.readdirSync(leveldbDir)
          .filter(f => f.endsWith('.log') || f.endsWith('.ldb'))
          .map(f => {
            const full = path.join(leveldbDir, f);
            let mtime = 0;
            try { mtime = fs.statSync(full).mtimeMs; } catch {}
            return { name: f, full, mtime };
          })
          .sort((a, b) => b.mtime - a.mtime);
      } catch {
        continue;
      }

      for (const file of files) {
        let content = '';
        try {
          content = fs.readFileSync(file.full).toString('latin1');
        } catch {
          continue;
        }

        const matches = content.matchAll(JWT_REGEX);
        for (const match of matches) {
          const token = match[0];
          try {
            const parts = token.split('.');
            if (parts.length !== 3) continue;
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

            // 验证是否为鱼鱼API 签发的有效用户 JWT (含 user_id, email, iat, exp, token_version)
            if (
              payload &&
              typeof payload.email === 'string' &&
              payload.user_id !== undefined &&
              payload.token_version !== undefined &&
              typeof payload.iat === 'number' &&
              typeof payload.exp === 'number' &&
              payload.exp * 1000 > nowMs
            ) {
              const record: DiscoveredToken = {
                email: payload.email,
                token,
                iat: payload.iat,
                exp: payload.exp,
                browser: browser.name
              };

              const existing = byEmail.get(record.email);
              if (!existing || record.iat >= existing.iat) {
                byEmail.set(record.email, record);
              }

              if (!latestOverall || record.iat >= latestOverall.iat) {
                latestOverall = record;
              }
            }
          } catch {
            // 非 JSON 或非目标 JWT，跳过
          }
        }
      }
    }
  }

  const all = Array.from(byEmail.values()).sort((a, b) => b.iat - a.iat);
  return {
    latest: latestOverall,
    all
  };
}

/**
 * 智能扫描本地浏览器登录凭据并向鱼鱼API 验证最新活跃账号
 */
export async function scanRunningBrowsersForToken(): Promise<SyncResult> {
  const { latest, all } = scanLocalLevelDBTokens();

  if (!latest || all.length === 0) {
    return {
      success: false,
      needsLogin: true,
      message: '未在本地浏览器（Chrome/Edge/Brave）存储中检测到有效的鱼鱼API登录记录'
    };
  }

  // 按 iat 从新到旧依次验证，优先选择最后一次登录的账号
  for (const item of all) {
    try {
      const client = new YuyuApiClient(item.token);
      const profile = await client.getProfile();
      return {
        success: true,
        browser: item.browser,
        token: item.token,
        email: profile.email || item.email,
        balance: Number(profile.balance || 0),
        iat: item.iat,
        allDiscovered: all,
        message: `已同步 ${item.browser} 当前登录账号 ${profile.email || item.email} ($${Number(profile.balance || 0).toFixed(2)})`
      };
    } catch {
      continue;
    }
  }

  return {
    success: false,
    needsLogin: true,
    message: '本地浏览器中的登录凭证已过期，请在浏览器重新登录 sub.anzhiyu.com'
  };
}

/**
 * 使用系统默认浏览器打开鱼鱼API 登录页，并轮询本地 LevelDB 捕获新登录的 Token（无 MCP 依赖）
 */
export async function launchAndCaptureToken(timeoutMs = 90000): Promise<SyncResult> {
  const beforeScan = scanLocalLevelDBTokens();
  const baselineIat = beforeScan.latest?.iat || 0;

  // 调用系统默认浏览器打开 sub.anzhiyu.com/usage
  try {
    exec('start "" "https://sub.anzhiyu.com/usage"');
  } catch {}

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await new Promise(r => setTimeout(r, 1500));
    const currentScan = scanLocalLevelDBTokens();
    if (currentScan.latest && currentScan.latest.iat > baselineIat) {
      return await scanRunningBrowsersForToken();
    }
  }

  // 若用户在窗口中保持原账号未重登，也尝试返回当前有效账号
  return await scanRunningBrowsersForToken();
}
