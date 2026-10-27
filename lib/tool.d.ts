import { YuyuApiClient } from './api.js';
/**
 * DeepSeek-Harness Agent Tool 定义
 *
 * 关于 `force_refresh`：这个工具每次都真的打服务端（余额必须实时），
 * 所以该参数保留只是为了兼容既有调用，语义上恒为 true。
 * 旧描述写的「默认为 true」容易让人以为关掉能读缓存 —— 实际不会，
 * 这里在描述里说清楚，避免模型误用。
 */
export declare function createYuyuBalanceTool(client: YuyuApiClient, alertThreshold: number): {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            force_refresh: {
                type: string;
                description: string;
            };
        };
        required: never[];
    };
    execute: (_args?: {
        force_refresh?: boolean;
    }) => Promise<string>;
};
