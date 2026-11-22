import { DEFAULT_SITE, siteInfo, siteLabel } from './sites.js';
/**
 * DeepSeek-Harness Agent Tool 定义
 *
 * 关于 `force_refresh`：这个工具每次都真的打服务端（余额必须实时），
 * 所以该参数保留只是为了兼容既有调用，语义上恒为 true。
 * 旧描述写的「默认为 true」容易让人以为关掉能读缓存 —— 实际不会，
 * 这里在描述里说清楚，避免模型误用。
 *
 * 站点维度：插件同时支持 sub / www 两个独立后端，本工具始终查询
 * 「当前激活账号」所在站点，并在描述里写明是哪个站点。
 */
/** 工具描述随激活站点变化（切换账号后模型看到的站点不能是旧的） */
export function buildYuyuBalanceToolDescription(site = DEFAULT_SITE) {
    const info = siteInfo(site);
    return `查询鱼鱼API（${info.host}）当前激活账号的可用余额、今日消耗金额、消耗Token总数及关联密钥状态。插件的账号按站点区分（旧站 sub 与 新站 www 是两套独立后端，同一个邮箱在两个站点是两个账号），本工具只查当前激活账号所在站点。当用户询问“余额还剩多少”、“查一下额度”、“今天用了多少钱”时调用此工具。`;
}
export function createYuyuBalanceTool(client, alertThreshold, site = DEFAULT_SITE, 
/** 运行时站点解析器：切换账号后描述与提示要跟着变 */
resolveSite) {
    const currentSite = () => resolveSite?.() || site;
    return {
        name: 'get_yuyu_api_balance',
        description: buildYuyuBalanceToolDescription(site),
        liveDescription: () => buildYuyuBalanceToolDescription(currentSite()),
        // 这是完整的 JSON Schema（object 根），不是「属性名 → 属性」的映射：
        // DSH 的 tools.register / PTC 的 SDK 生成都按根节点校验，少了 type: 'object'
        // 这一层，PTC 生成的 TypeScript 绑定会把参数类型降级成 unknown。
        parameters: {
            type: 'object',
            properties: {
                force_refresh: {
                    type: 'boolean',
                    description: '保留字段。本工具每次都会实时向服务器查询，该参数不影响行为。'
                }
            },
            required: []
        },
        execute: async (_args = {}) => {
            const snapshot = await client.getBalanceSnapshot(alertThreshold);
            if (!snapshot.success) {
                const hint = snapshot.unauthorized
                    ? `登录凭据已失效。请打开插件卡片点「从浏览器同步」，或在浏览器重新登录 ${siteInfo(currentSite()).usageUrl}。`
                    : (snapshot.error || '无法获取鱼鱼API账户余额');
                return `查询失败: ${hint}`;
            }
            // 返回友好中文摘要与结构化信息
            return snapshot.formattedText;
        },
        /** 注册时可用的站点标签 */
        siteLabel: siteLabel(site)
    };
}
