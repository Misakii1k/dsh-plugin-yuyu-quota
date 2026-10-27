import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { YuyuApiClient } from './api.js';

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

interface BrowserUserDataCandidate {
  name: string;
  userDataDir: string;
}

/**
 * 需要扫描的浏览器 User Data 根目录。
 *
 * Edge 有几处容易漏：
 * 1. 只用 LOCALAPPDATA 拼路径，环境变量缺失时（如某些服务/计划任务）整段扫描直接失效；
 * 2. 只认 `Microsoft/Edge`，不认 Beta / Dev / Canary(SxS)；
 * 3. Edge WebView2 也有独立的 User Data（DSH 桌面端自身就基于 WebView2），
 *    用户可能在 WebView 里登录过鱼鱼API。
 */
function getBrowserUserDataCandidates(): BrowserUserDataCandidate[] {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const join = (...parts: string[]) => path.join(local, ...parts);

  const candidates: BrowserUserDataCandidate[] = [
    { name: 'Microsoft Edge', userDataDir: join('Microsoft/Edge/User Data') },
    { name: 'Microsoft Edge Beta', userDataDir: join('Microsoft/Edge Beta/User Data') },
    { name: 'Microsoft Edge Dev', userDataDir: join('Microsoft/Edge Dev/User Data') },
    { name: 'Microsoft Edge Canary', userDataDir: join('Microsoft/Edge SxS/User Data') },
    { name: 'Google Chrome', userDataDir: join('Google/Chrome/User Data') },
    { name: 'Google Chrome Beta', userDataDir: join('Google/Chrome Beta/User Data') },
    { name: 'Google Chrome Dev', userDataDir: join('Google/Chrome Dev/User Data') },
    { name: 'Google Chrome Canary', userDataDir: join('Google/Chrome SxS/User Data') },
    { name: 'Brave Browser', userDataDir: join('BraveSoftware/Brave-Browser/User Data') },
    { name: 'Vivaldi', userDataDir: join('Vivaldi/User Data') },
    { name: 'Opera GX', userDataDir: join('Programs/Opera GX/user data') },
    { name: 'Opera', userDataDir: join('Programs/Opera/user data') },
    // Edge WebView2（DSH 桌面端运行时）：形如 EdgeWebView/User Data/EBWebView/Default
    { name: 'Edge WebView2', userDataDir: join('Microsoft/EdgeWebView/User Data') },
    // 少数机器把 Edge 数据放在 Roaming 下
    { name: 'Microsoft Edge (Roaming)', userDataDir: path.join(roaming, 'Microsoft/Edge/User Data') }
  ];

  // 去重（大小写不敏感，Windows 路径）
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = item.userDataDir.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const JWT_REGEX = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
/** 鱼鱼API 的 refresh token 固定前缀 rt_ + 64 位 hex */
const REFRESH_TOKEN_REGEX = /rt_[0-9a-f]{64}/g;

/** 解析 JWT 载荷；失败返回 null。 */
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** 判断是否为鱼鱼API 签发的用户 access token（并且未过期） */
function isTargetJwt(payload: any, nowMs: number): boolean {
  return Boolean(
    payload
    && typeof payload.email === 'string'
    && payload.user_id !== undefined
    && payload.token_version !== undefined
    && typeof payload.iat === 'number'
    && typeof payload.exp === 'number'
    && payload.exp * 1000 > nowMs
  );
}

/**
 * 递归列出 profile 目录。
 *
 * Edge/Chrome 的 profile 目录名可能是 Default、Profile 1、Profile 2……
 * WebView2 还会多一层 `EBWebView`。这里用有限深度的递归覆盖这两种布局，
 * 避免因写死层级而漏读。
 */
function listProfileDirs(userDataDir: string, depth = 0): string[] {
  if (depth > 2) return [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(userDataDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const full = path.join(userDataDir, name);
    const isProfile = name === 'Default' || /^Profile \d+$/.test(name) || name === 'Guest Profile';
    if (isProfile) {
      result.push(full);
      continue;
    }
    // WebView2 等容器：继续下钻一层
    if (name === 'EBWebView' || name === 'User Data') {
      result.push(...listProfileDirs(full, depth + 1));
    }
  }
  return result;
}

/**
 * 读取一个文件里所有 leveldb 记录中的可读文本。
 *
 * 说明（重要）：Chromium 的 `Local Storage/leveldb` 里，`.ldb` 的**数据块**
 * 可能被 Snappy 压缩，但线上实测（Chrome 与 Edge 均为当前版本）
 * localStorage 这些块压缩标志为 0，值以 UTF-8 明文直接可读，
 * 因此这里按二进制安全的方式整体扫描即可，不需要引入 snappy 依赖。
 * 为了让 UTF-16 / 单字节两种编码都不漏，两种解码都扫。
 */
function readSearchableText(file: string): string | null {
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch {
    return null;
  }
  // latin1 保证 1:1 字节映射，不会丢字节；再拼一份 utf8 视图覆盖多字节场景
  const latin1 = buffer.toString('latin1');
  let utf8 = '';
  try {
    utf8 = buffer.toString('utf8');
  } catch {
    utf8 = '';
  }
  return latin1 === utf8 ? latin1 : `${latin1}\n${utf8}`;
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
export function scanAllBrowserTokens(): RawScanState {
  const nowMs = Date.now();
  const state: RawScanState = {
    tokens: [],
    refreshTokens: [],
    files: 0,
    unreadable: 0,
    profiles: 0,
    roots: [],
    tokenHits: [],
    refreshHits: []
  };

  for (const browser of getBrowserUserDataCandidates()) {
    if (!fs.existsSync(browser.userDataDir)) continue;
    state.roots.push(`${browser.name}: ${browser.userDataDir}`);

    const profileDirs = listProfileDirs(browser.userDataDir);
    for (const profileDir of profileDirs) {
      const leveldbDir = path.join(profileDir, 'Local Storage', 'leveldb');
      if (!fs.existsSync(leveldbDir)) continue;
      state.profiles += 1;
      const profileKey = `${browser.name}|${path.relative(browser.userDataDir, profileDir) || 'Default'}`;

      let files: string[] = [];
      try {
        files = fs.readdirSync(leveldbDir).filter((f) => f.endsWith('.log') || f.endsWith('.ldb'));
      } catch {
        state.unreadable += 1;
        continue;
      }

      for (const file of files) {
        state.files += 1;
        const text = readSearchableText(path.join(leveldbDir, file));
        if (text === null) {
          // 被浏览器独占用锁 / 权限不足：计入诊断，继续扫其他文件
          state.unreadable += 1;
          continue;
        }

        for (const match of text.matchAll(REFRESH_TOKEN_REGEX)) {
          if (!state.refreshTokens.includes(match[0])) state.refreshTokens.push(match[0]);
          state.refreshHits.push({
            rt: match[0],
            profileKey,
            fileKey: file,
            index: match.index || 0
          });
        }

        for (const match of text.matchAll(JWT_REGEX)) {
          const token = match[0];
          const payload = decodeJwtPayload(token);
          if (!isTargetJwt(payload, nowMs)) continue;
          state.tokens.push({
            email: payload.email,
            token,
            iat: payload.iat,
            exp: payload.exp,
            browser: browser.name,
            profile: path.relative(browser.userDataDir, profileDir) || 'Default'
          });
          state.tokenHits.push({
            payload,
            token,
            browser: browser.name,
            profileKey,
            fileKey: file,
            index: match.index || 0
          });
        }
      }
    }
  }

  return state;
}

/**
 * 把 refresh token 与账号配对。
 *
 * 为什么不能简单取「第一个 rt_」：refresh token 是一次性的且会轮换，
 * 一旦把 A 账号的 rt 记到 B 账号上，续期时就会用 A 的凭据换出 A 的 token 写进 B，
 * 造成账号串号，同时提前消耗掉 A 的 rt。
 *
 * 实测（Chromium 系浏览器）：`auth_token` 与 `refresh_token` 之间可能隔着上千字节的
 * 其他 localStorage 记录，单纯凭「偏移最近」并不可靠。但它们的**写入顺序是一致的**——
 * 登录时先写 token 再写 rt，且每换一次登录两者都成对更新。
 * 因此按「同 profile 内按 iat 排序的 token」与「按写入位置排序的 rt」做**有序配对**，
 * 比取第一个或只看偏移距离都更稳定。
 *
 * 匹配不到就留空 —— 宁可让用户点一次「从浏览器同步」，也不能张冠李戴。
 */
function pairRefreshTokens(state: RawScanState): DiscoveredToken[] {
  const sorted = [...state.tokens].sort((a, b) => b.iat - a.iat);
  const byEmail = new Map<string, DiscoveredToken>();
  const used = new Set<string>();

  /** 每个 profile 里可用的 rt 队列（按写入位置从新到旧） */
  const rtByProfile = new Map<string, RefreshHit[]>();
  for (const hit of state.refreshHits) {
    const list = rtByProfile.get(hit.profileKey) || [];
    list.push(hit);
    rtByProfile.set(hit.profileKey, list);
  }
  for (const list of rtByProfile.values()) {
    // 位置越大越新（leveldb 追加写）；按 profile 内位置降序
    list.sort((a, b) => b.index - a.index);
  }

  for (const token of sorted) {
    if (byEmail.has(token.email)) continue;
    const hit = state.tokenHits.find(h => h.token === token.token);
    let chosen: RefreshHit | null = null;

    if (hit) {
      const queue = rtByProfile.get(hit.profileKey) || [];
      // 优先取同文件且偏移最接近的；没有就取该 profile 里最新的
      const sameFile = queue.filter(r => r.fileKey === hit.fileKey && !used.has(r.rt));
      if (sameFile.length > 0) {
        chosen = sameFile.reduce((best, cur) =>
          Math.abs(cur.index - hit.index) < Math.abs(best.index - hit.index) ? cur : best
        );
      } else {
        chosen = queue.find(r => !used.has(r.rt)) || null;
      }
    }

    if (chosen) {
      used.add(chosen.rt);
      byEmail.set(token.email, { ...token, refreshToken: chosen.rt });
    } else {
      byEmail.set(token.email, token);
    }
  }

  return [...byEmail.values()].sort((a, b) => b.iat - a.iat);
}

/**
 * 收集「已过期但仍在本地留有 refresh token」的账号。
 *
 * 这是「1~2 天就得重新获取 Token」的真正解法之一：
 * access token 24 小时就过期，但浏览器里那份 refresh token 往往还有效。
 * 旧实现把所有过期 token 直接过滤掉，连带着把可用的 rt 一起丢了，
 * 于是用户即使刚在浏览器登录过，插件也认为「没数据」。
 */
export function scanExpiredAccountsWithRefreshToken(): DiscoveredToken[] {
  const nowMs = Date.now();
  const state = scanAllBrowserTokens();
  const expired: DiscoveredToken[] = [];

  for (const hit of state.tokenHits) {
    const payload = hit.payload;
    // 只关心「签名结构像鱼鱼API、但已过期」的
    if (!payload || typeof payload.email !== 'string') continue;
    if (payload.user_id === undefined || payload.token_version === undefined) continue;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 > nowMs) continue;

    expired.push({
      email: payload.email,
      token: hit.token,
      iat: payload.iat,
      exp: payload.exp,
      browser: hit.browser,
      profile: hit.profileKey.split('|')[1] || 'Default'
    });
  }

  if (expired.length === 0) return [];
  // 复用同一套配对逻辑（把过期 token 也喂进去）
  const merged: RawScanState = {
    ...state,
    tokens: state.tokens.concat(expired.map(e => ({
      email: e.email, token: e.token, iat: e.iat, exp: e.exp, browser: e.browser, profile: e.profile
    })))
  };
  const paired = pairRefreshTokens(merged);
  // 只返回带 rt 的过期账号（没 rt 的救不回来，没必要暴露）
  return paired.filter(item => item.refreshToken && item.exp * 1000 <= nowMs);
}

/**
 * 直接从本地浏览器 Local Storage LevelDB 文件中无感扫描所有鱼鱼API 登录 Token。
 * 默认不采用 MCP、不依赖 Puppeteer、不需要开启远程调试端口。
 */
export function scanLocalLevelDBTokens(): {
  latest: DiscoveredToken | null;
  all: DiscoveredToken[];
  diagnostics: BrowserScanDiagnostics;
} {
  const raw = scanAllBrowserTokens();
  const all = pairRefreshTokens(raw);
  return {
    latest: all[0] || null,
    all,
    diagnostics: {
      roots: raw.roots,
      profiles: raw.profiles,
      files: raw.files,
      unreadable: raw.unreadable,
      validTokens: all.length,
      refreshTokens: raw.refreshTokens.length
    }
  };
}

/**
 * 智能扫描本地浏览器登录凭据并向鱼鱼API 验证最新活跃账号
 */
export async function scanRunningBrowsersForToken(): Promise<SyncResult> {
  const { latest, all, diagnostics } = scanLocalLevelDBTokens();

  if (!latest || all.length === 0) {
    const noBrowserData = diagnostics.roots.length === 0;
    return {
      success: false,
      needsLogin: true,
      diagnostics,
      message: noBrowserData
        ? '未找到任何浏览器数据目录（Chrome/Edge/Brave 均未安装或从未启动）'
        : `未在浏览器（${diagnostics.roots.length} 个 profile 根目录，已读 ${diagnostics.files} 个文件）中检测到有效的鱼鱼API登录记录`
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
        diagnostics,
        message: `已同步 ${item.browser} 当前登录账号 ${profile.email || item.email} ($${Number(profile.balance || 0).toFixed(2)})`
      };
    } catch {
      continue;
    }
  }

  return {
    success: false,
    needsLogin: true,
    diagnostics,
    message: '本地浏览器中的登录凭证已过期，请在浏览器重新登录 sub.anzhiyu.com'
  };
}

/**
 * 使用系统默认浏览器打开鱼鱼API 登录页，并轮询本地 LevelDB 捕获新登录的 Token。
 */
export async function launchAndCaptureToken(timeoutMs = 90000): Promise<SyncResult> {
  const beforeScan = scanLocalLevelDBTokens();
  const baselineIat = beforeScan.latest?.iat || 0;

  // 调用系统默认浏览器打开 sub.anzhiyu.com/usage
  openExternal('https://sub.anzhiyu.com/usage');

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    const currentScan = scanLocalLevelDBTokens();
    if (currentScan.latest && currentScan.latest.iat > baselineIat) {
      return await scanRunningBrowsersForToken();
    }
  }

  // 若用户在窗口中保持原账号未重登，也尝试返回当前有效账号
  return await scanRunningBrowsersForToken();
}

/**
 * 用系统默认程序打开 URL。
 *
 * 安全约束：只接受 http(s)，并且用 spawn 传参数数组而不是拼 shell 字符串 ——
 * 这个函数会被 HTTP 路由间接触达，绝不能把任意文本拼进命令行。
 */
export function openExternal(targetUrl: string): boolean {
  const url = String(targetUrl || '').trim();
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) return false;

  try {
    if (process.platform === 'win32') {
      // Windows 的 start 是 cmd 内建命令，必须经 cmd 转调；
      // 第一个空参数是窗口标题占位，防止 URL 被当成标题。
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch {
    return false;
  }
}
