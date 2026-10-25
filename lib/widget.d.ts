import { BalanceSnapshot } from './types.js';
/**
 * 原生制作的精细 SVG 矢量图标库 (Radix / Carbon 风格紧凑严谨网格，1.5px 笔触)
 */
export declare const ICONS: {
    wallet: string;
    alert: string;
    refresh: string;
    fish: string;
    browser: string;
    check: string;
    sparkle: string;
};
/**
 * Oil-UI 规范设计的 Web UI 状态栏胶囊与弹窗详情组件
 * 特点：
 * 1. 严格层级：大字等宽数字主角、次级信息后退、删减多余边框与装饰
 * 2. 动效手感：展开时 0.98->1 微缩放渐入，点击时 0.97 微阻尼反馈
 * 3. 完整交互：支持点击外部自收起、Esc关闭、同步旋转反馈、一键提取
 * 4. 纯净矢量：全原生 SVG，零依赖、自适应深色/浅色模式
 */
export declare function renderWidgetHtml(snapshot: BalanceSnapshot): string;
