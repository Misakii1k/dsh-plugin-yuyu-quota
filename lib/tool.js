/**
 * DeepSeek-Harness Agent Tool 定义
 *
 * 关于 `force_refresh`：这个工具每次都真的打服务端（余额必须实时），
 * 所以该参数保留只是为了兼容既有调用，语义上恒为 true。
 * 旧描述写的「默认为 true」容易让人以为关掉能读缓存 —— 实际不会，
 * 这里在描述里说清楚，避免模型误用。
 */
export function createYuyuBalanceTool(client, alertThreshold) {
    return {
        name: 'get_yuyu_api_balance',
        description: '查询鱼鱼API (sub.anzhiyu.com) 的当前可用账户余额、今日消耗金额、消耗Token总数及关联密钥状态。当用户询问“余额还剩多少”、“查一下额度”、“今天用了多少钱”时调用此工具。',
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
                    ? '登录凭据已失效。请打开插件卡片点「从浏览器同步」，或在浏览器重新登录 sub.anzhiyu.com。'
                    : (snapshot.error || '无法获取鱼鱼API账户余额');
                return `查询失败: ${hint}`;
            }
            // 返回友好中文摘要与结构化信息
            return snapshot.formattedText;
        }
    };
}
