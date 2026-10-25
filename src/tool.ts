import { YuyuApiClient } from './api.js';
import { BalanceSnapshot } from './types.js';

/**
 * DeepSeek Harness Agent Tool 定义
 */
export function createYuyuBalanceTool(client: YuyuApiClient, alertThreshold: number) {
  return {
    name: 'get_yuyu_api_balance',
    description: '查询鱼鱼API (sub.anzhiyu.com) 的当前可用账户余额、今日消耗金额、消耗Token总数及关联密钥状态。当用户询问“余额还剩多少”、“查一下额度”、“今天用了多少钱”时调用此工具。',
    parameters: {
      type: 'object',
      properties: {
        force_refresh: {
          type: 'boolean',
          description: '是否强制从服务器拉取最新数据，默认为 true'
        }
      },
      required: []
    },
    execute: async (_args: { force_refresh?: boolean } = {}): Promise<string> => {
      const snapshot: BalanceSnapshot = await client.getBalanceSnapshot(alertThreshold);

      if (!snapshot.success) {
        return `查询失败: ${snapshot.error || '无法获取鱼鱼API账户余额'}`;
      }

      // 返回友好中文摘要与结构化信息
      return snapshot.formattedText;
    }
  };
}
