/**
 * Cloudflare Pages Functions 共享工具。
 *
 * 文件名以下划线开头，Pages 不会把它注册成路由，只作为被 import 的模块。
 *
 * 这里集中处理三件容易出错的事：
 * 1. `tag` 查询参数必须走白名单校验 —— 直接拼进 GitHub API 路径会让 WHATWG URL
 *    归一化吃掉 `../`，把端点变成「带 token 的任意 GitHub API 读取代理」。
 * 2. CORS 只对已知来源回显，而不是通配 `*`，避免被第三方站点当免费中继刷配额。
 * 3. 上游错误一律脱敏，不回显 GitHub 原文与内部异常消息。
 */

export interface Env {
  GITHUB_TOKEN?: string;
}

/** 本插件的 GitHub 仓库（当前为私有，必须经由本代理访问） */
export const GITHUB_REPO = 'Misakii1k/dsh-plugin-yuyu-quota';

const RELEASES_API_BASE = `https://api.github.com/repos/${GITHUB_REPO}/releases`;

/** 版本 tag 白名单：1.0.0 / v1.0.0 / v1.0.0-beta.1 */
const RELEASE_TAG_RE = /^v?\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][0-9A-Za-z.-]{1,32})?$/;

/**
 * 允许跨域访问代理的来源。
 *
 * DSH 桌面客户端的页面来自 `dsh://app` 自定义协议，浏览器页面来自
 * `http://127.0.0.1:*`。这里的请求实际由插件后端（Node fetch）发出，
 * 不经过浏览器同源策略；保留 CORS 主要是为了教程页/调试页面能用同一套接口。
 */
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/i,
  /^https:\/\/[a-z0-9.-]*dsh[a-z0-9.-]*$/i,
  /^http:\/\/127\.0\.0\.1(:\d{1,5})?$/,
  /^http:\/\/localhost(:\d{1,5})?$/,
  /^dsh:\/\/[a-z]+$/i
];

const UPSTREAM_TIMEOUT_MS = 8000;

export type ReleaseTagResult =
  | { ok: true; tag: string | null }
  | { ok: false };

/**
 * 解析并校验 `tag` 查询参数。
 * - 未提供（或空串）→ `{ ok: true, tag: null }`，调用方回落到 latest release。
 * - 不符合白名单 → `{ ok: false }`，调用方必须返回 400。
 */
export function parseReleaseTag(raw: string | null): ReleaseTagResult {
  if (raw === null) return { ok: true, tag: null };
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, tag: null };
  if (!RELEASE_TAG_RE.test(trimmed)) return { ok: false };
  return { ok: true, tag: trimmed };
}

/** 构造 release 查询地址，并断言结果仍在预期的 API 前缀下（防归一化穿越的双保险）。 */
export function releaseApiUrl(tag: string | null): string {
  if (tag === null) return `${RELEASES_API_BASE}/latest`;
  const normalized = tag.startsWith('v') || tag.startsWith('V') ? tag : `v${tag}`;
  const url = new URL(`${RELEASES_API_BASE}/tags/${normalized}`);
  if (!url.pathname.startsWith(`/repos/${GITHUB_REPO}/releases/tags/`)) {
    throw new Error('release tag escaped the expected API prefix');
  }
  return url.toString();
}

export function assetApiUrl(assetId: number): string {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw new Error('invalid asset id');
  }
  return `${RELEASES_API_BASE}/assets/${assetId}`;
}

export interface GithubAsset {
  id?: number;
  name?: string;
  size?: number;
  digest?: string;
  browser_download_url?: string;
}

export interface GithubRelease {
  tag_name?: string;
  body?: string;
  published_at?: string;
  assets?: GithubAsset[];
  [key: string]: unknown;
}

/** 客户端与代理共用的安装包选择规则：第一个 .tgz / .tar.gz 资产。 */
export function pickTgzAsset(assets: GithubAsset[] | undefined): GithubAsset | null {
  if (!Array.isArray(assets)) return null;
  return assets.find((asset) => typeof asset.name === 'string' && /\.tgz$/i.test(asset.name))
    ?? assets.find((asset) => typeof asset.name === 'string' && /\.tar\.gz$/i.test(asset.name))
    ?? null;
}

export function githubHeaders(token: string, accept: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'User-Agent': 'DSH-Yuyu-Quota-CF-Proxy',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

/** 带超时的 fetch；Workers 环境里 AbortSignal.timeout 并非所有版本都可用，手动兜底。 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function baseHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
}

/** 命中白名单才回显 CORS 头，并加 Vary 以便边缘正确缓存。 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowed = ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
  if (!allowed) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

export function jsonResponse(
  body: unknown,
  status: number,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...baseHeaders(),
      ...extra
    }
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  extra: Record<string, string> = {}
): Response {
  return jsonResponse({ error: code, message }, status, extra);
}

export function tokenMissingResponse(): Response {
  return errorResponse(
    'GITHUB_TOKEN_NOT_CONFIGURED',
    '请在 Cloudflare Pages 控制台的「设置 -> 环境变量」中添加 GITHUB_TOKEN，即可开启私有仓库的版本查询与下载。',
    503
  );
}

export function invalidTagResponse(): Response {
  return errorResponse('INVALID_TAG', '版本号格式不合法。', 400);
}

export function upstreamFailureResponse(status: number): Response {
  // 不回显 GitHub 原文与异常消息，只保留「没找到 / 上游故障」两类。
  return errorResponse('UPSTREAM_ERROR', '上游发布信息暂时不可用，请稍后再试。', status === 404 ? 404 : 502);
}
