import { YuyuApiClient } from './api.js';
import { YuyuSiteId } from './sites.js';
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
export declare function buildYuyuBalanceToolDescription(site?: YuyuSiteId): string;
export declare function createYuyuBalanceTool(client: YuyuApiClient, alertThreshold: number, site?: YuyuSiteId, 
/** 运行时站点解析器：切换账号后描述与提示要跟着变 */
resolveSite?: () => YuyuSiteId): {
    name: string;
    description: string;
    liveDescription: () => string;
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
    /** 注册时可用的站点标签 */
    siteLabel: string;
};
