import { YuyuApiClient } from './api.js';
/**
 * DeepSeek Harness Agent Tool 定义
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
