/**
 * 鱼鱼 API 站点注册表。
 *
 * 背景（2026-11 实测）：
 * - `sub.anzhiyu.com` 与 `www.anzhiyu.com` 是**两套独立后端**：
 *   接口形状完全一致（/api/v1/user/profile、/usage/dashboard/stats、/keys、
 *   /auth/refresh），但 token 互不通用 —— 同一邮箱在两个站点会是两个不同的
 *   user_id（实测 sub: id=366、www: id=1859173037）。
 * - 浏览器 localStorage 里两份登录态也各存各的，靠 leveldb 记录前的
 *   `_https://<host>` 前缀区分。
 *
 * 因此插件必须「按站点」记账：账号的唯一键是 `<site>:<email>`，
 * 每个账号的所有请求（余额、续期、充值页、使用记录）都走自己的站点。
 */

export type YuyuSiteId = 'sub' | 'www';

export interface YuyuSite {
  id: YuyuSiteId;
  /** 站点短标签（UI 上的一枚小徽标） */
  label: string;
  /** 站点完整名称 */
  name: string;
  /** API 根地址（不带结尾斜杠） */
  baseUrl: string;
  /** 站点 host，用于匹配浏览器 localStorage 里的 origin */
  host: string;
  /** 使用记录 / 登录页 */
  usageUrl: string;
  /** 充值中心 */
  rechargeUrl: string;
}

export const SITES: Record<YuyuSiteId, YuyuSite> = {
  sub: {
    id: 'sub',
    // 旧站：1.2.x 及更早版本只有这一个站点
    label: '旧',
    name: '鱼鱼 API（旧站 · sub.anzhiyu.com）',
    baseUrl: 'https://sub.anzhiyu.com',
    host: 'sub.anzhiyu.com',
    usageUrl: 'https://sub.anzhiyu.com/usage',
    rechargeUrl: 'https://sub.anzhiyu.com/recharge-center'
  },
  www: {
    id: 'www',
    // 新站：2026-11 起启用的独立后端，token 与旧站互不通用
    label: '新',
    name: '鱼鱼 API（新站 · www.anzhiyu.com）',
    baseUrl: 'https://www.anzhiyu.com',
    host: 'www.anzhiyu.com',
    usageUrl: 'https://www.anzhiyu.com/usage',
    rechargeUrl: 'https://www.anzhiyu.com/recharge-center'
  }
};

export const SITE_IDS: YuyuSiteId[] = ['sub', 'www'];

/** 历史账号没有 site 字段，一律按 sub 处理（1.2.x 之前只有这一个站） */
export const DEFAULT_SITE: YuyuSiteId = 'sub';

/**
 * 从任意写法（id / host / URL）里抽出小写 host。
 * 不允许把 `www.` 直接抹掉再匹配：`www.anzhiyu.com` 与 `sub.anzhiyu.com`
 * 是两个独立后端，抹掉前缀会把新站误判成旧站。
 */
function extractHost(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, '');
}

/** 把用户/配置里各种写法收敛成站点 id；认不出来返回 null */
export function normalizeSiteId(value: unknown): YuyuSiteId | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'sub' || raw === 'old' || raw === '旧' || raw === '旧站') return 'sub';
  if (raw === 'www' || raw === 'new' || raw === '新' || raw === '新站') return 'www';

  const host = extractHost(raw);
  if (!host) return null;
  // 裸域 anzhiyu.com 由主站承载（会跳到 www），与浏览器 origin 的判定保持一致
  if (host === 'www.anzhiyu.com' || host === 'anzhiyu.com') return 'www';
  if (host === 'sub.anzhiyu.com') return 'sub';
  return null;
}

/** 浏览器 localStorage / baseUrl 里的 host → 站点 id；自定义域名返回 null */
export function siteOfHost(host: string | undefined | null): YuyuSiteId | null {
  const h = extractHost(host);
  if (!h) return null;
  if (h === 'www.anzhiyu.com' || h === 'anzhiyu.com') return 'www';
  if (h === 'sub.anzhiyu.com') return 'sub';
  return null;
}

/** 从任意 baseUrl 推断站点；自定义地址返回 null（由 store.baseUrl 兜底） */
export function siteOfBaseUrl(url: string | undefined | null): YuyuSiteId | null {
  return siteOfHost(url);
}

export function siteBaseUrl(site: YuyuSiteId | string | undefined | null): string {
  const id = normalizeSiteId(site) || DEFAULT_SITE;
  return SITES[id].baseUrl;
}

export function siteInfo(site: YuyuSiteId | string | undefined | null): YuyuSite {
  return SITES[normalizeSiteId(site) || DEFAULT_SITE];
}

export function siteLabel(site: YuyuSiteId | string | undefined | null): string {
  return siteInfo(site).label;
}

/** 账号唯一键：站点 + 邮箱 */
export function accountKey(site: YuyuSiteId | string | undefined | null, email: string): string {
  const id = normalizeSiteId(site) || DEFAULT_SITE;
  return `${id}:${String(email || '').trim().toLowerCase()}`;
}

/** 解析账号键；没有前缀的旧格式按默认站点处理。邮箱统一小写，避免同一账号两种大小写 */
export function parseAccountKey(key: string): { site: YuyuSiteId; email: string } {
  const raw = String(key || '').trim();
  const sep = raw.indexOf(':');
  if (sep > 0) {
    const site = normalizeSiteId(raw.slice(0, sep));
    if (site) return { site, email: raw.slice(sep + 1).trim().toLowerCase() };
  }
  return { site: DEFAULT_SITE, email: raw.toLowerCase() };
}

/** 邮箱比较统一走小写；账号键与 API 返回值可能大小写不一致 */
export function sameEmail(a: string | undefined | null, b: string | undefined | null): boolean {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/** 邮箱 + 站点 的展示名（旧站不额外加前缀，避免界面噪音） */
export function accountDisplay(email: string, site?: string): string {
  const id = normalizeSiteId(site) || DEFAULT_SITE;
  return id === 'sub' ? email : `${email} · ${siteLabel(id)}`;
}
