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
export declare const SITES: Record<YuyuSiteId, YuyuSite>;
export declare const SITE_IDS: YuyuSiteId[];
/** 历史账号没有 site 字段，一律按 sub 处理（1.2.x 之前只有这一个站） */
export declare const DEFAULT_SITE: YuyuSiteId;
/** 把用户/配置里各种写法收敛成站点 id；认不出来返回 null */
export declare function normalizeSiteId(value: unknown): YuyuSiteId | null;
/** 浏览器 localStorage / baseUrl 里的 host → 站点 id；自定义域名返回 null */
export declare function siteOfHost(host: string | undefined | null): YuyuSiteId | null;
/** 从任意 baseUrl 推断站点；自定义地址返回 null（由 store.baseUrl 兜底） */
export declare function siteOfBaseUrl(url: string | undefined | null): YuyuSiteId | null;
export declare function siteBaseUrl(site: YuyuSiteId | string | undefined | null): string;
export declare function siteInfo(site: YuyuSiteId | string | undefined | null): YuyuSite;
export declare function siteLabel(site: YuyuSiteId | string | undefined | null): string;
/** 账号唯一键：站点 + 邮箱 */
export declare function accountKey(site: YuyuSiteId | string | undefined | null, email: string): string;
/** 解析账号键；没有前缀的旧格式按默认站点处理。邮箱统一小写，避免同一账号两种大小写 */
export declare function parseAccountKey(key: string): {
    site: YuyuSiteId;
    email: string;
};
/** 邮箱比较统一走小写；账号键与 API 返回值可能大小写不一致 */
export declare function sameEmail(a: string | undefined | null, b: string | undefined | null): boolean;
/** 邮箱 + 站点 的展示名（旧站不额外加前缀，避免界面噪音） */
export declare function accountDisplay(email: string, site?: string): string;
