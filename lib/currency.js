export const DISPLAY_CURRENCIES = ['auto', 'USD', 'CNY'];
/** 运行时收窄外部输入，避免配置里写入任意字符串 */
export function isDisplayCurrency(value) {
    return value === 'auto' || value === 'USD' || value === 'CNY';
}
/** 汇率是否足以做展示：必须为正数；stale 仍可用，但 UI 要标出“略旧” */
export function usableCurrencyRate(rate) {
    if (!rate || !Number.isFinite(Number(rate.rate)) || Number(rate.rate) <= 0)
        return null;
    return rate;
}
/**
 * 解析最终展示币种。
 *
 * - 用户显式 USD：永远 USD；
 * - 旧站没有汇率接口：即使选 CNY 也回退 USD；
 * - 新站但汇率暂不可用：回退 USD，绝不用 0 或猜测值换算；
 * - auto：新站有可用汇率时用 CNY，其余 USD。
 */
export function resolveDisplayCurrency(preference, site, rate) {
    if (preference === 'USD')
        return 'USD';
    if (site !== 'www')
        return 'USD';
    if (!usableCurrencyRate(rate))
        return 'USD';
    return 'CNY';
}
export function currencySymbol(currency) {
    return currency === 'CNY' ? '¥' : '$';
}
/** 把 USD 金额换算成展示币种；没有可用汇率时保持 USD */
export function convertUsdAmount(amountUsd, currency, rate) {
    const value = Number(amountUsd) || 0;
    const usable = usableCurrencyRate(rate);
    if (currency !== 'CNY' || !usable)
        return value;
    return value * usable.rate;
}
/** 固定小数位 + 千分位；手写实现避免不同 Node/浏览器 locale 差异 */
export function formatGroupedNumber(value, digits = 2) {
    const fixed = (Number(value) || 0).toFixed(digits);
    const negative = fixed.startsWith('-');
    const raw = negative ? fixed.slice(1) : fixed;
    const [head, tail] = raw.split('.');
    const grouped = head.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '-' : ''}${grouped}${tail ? `.${tail}` : ''}`;
}
/** 后端通知专用：与前端 moneyText 同一套口径 */
export function formatDisplayAmount(amountUsd, options = {}) {
    const currency = options.currency || 'USD';
    const digits = options.digits === undefined ? 2 : options.digits;
    const value = convertUsdAmount(amountUsd, currency, options.rate);
    return `${options.prefix || ''}${currencySymbol(currency)}${formatGroupedNumber(value, digits)}`;
}
