/**
 * 显示币种与汇率换算。
 *
 * 鱼鱼 API 的钱包余额始终以 USD 记账；新站额外提供
 * `/api/v1/currency/rates`（1 USD = N CNY）。这里只做**展示口径**，
 * 不参与充值、订单或后端记账，避免把换算值误当成真实人民币余额。
 */
import type { CurrencyRate, DisplayCurrency, YuyuSiteId } from './types.js';
export declare const DISPLAY_CURRENCIES: DisplayCurrency[];
/** 运行时收窄外部输入，避免配置里写入任意字符串 */
export declare function isDisplayCurrency(value: unknown): value is DisplayCurrency;
/** 汇率是否足以做展示：必须为正数；stale 仍可用，但 UI 要标出“略旧” */
export declare function usableCurrencyRate(rate: CurrencyRate | null | undefined): CurrencyRate | null;
/**
 * 解析最终展示币种。
 *
 * - 用户显式 USD：永远 USD；
 * - 旧站没有汇率接口：即使选 CNY 也回退 USD；
 * - 新站但汇率暂不可用：回退 USD，绝不用 0 或猜测值换算；
 * - auto：新站有可用汇率时用 CNY，其余 USD。
 */
export declare function resolveDisplayCurrency(preference: DisplayCurrency | undefined, site: YuyuSiteId | undefined, rate: CurrencyRate | null | undefined): 'USD' | 'CNY';
export declare function currencySymbol(currency: 'USD' | 'CNY'): string;
/** 把 USD 金额换算成展示币种；没有可用汇率时保持 USD */
export declare function convertUsdAmount(amountUsd: number, currency: 'USD' | 'CNY', rate: CurrencyRate | null | undefined): number;
/** 固定小数位 + 千分位；手写实现避免不同 Node/浏览器 locale 差异 */
export declare function formatGroupedNumber(value: number, digits?: number): string;
export interface DisplayAmountOptions {
    currency?: 'USD' | 'CNY';
    rate?: CurrencyRate | null;
    digits?: number;
    /** 例如“约 ”；只加在金额前，不加在币种符号前 */
    prefix?: string;
}
/** 后端通知专用：与前端 moneyText 同一套口径 */
export declare function formatDisplayAmount(amountUsd: number, options?: DisplayAmountOptions): string;
