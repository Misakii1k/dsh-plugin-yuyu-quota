import { Context, Schema } from 'cordis';
import { PluginConfig } from './types.js';
export declare const name = "dsh-plugin-yuyu-quota";
/**
 * Cordis 配置 Schema
 */
export declare const Config: Schema<PluginConfig>;
export declare function apply(ctx: Context, config: PluginConfig): void;
export * from './types.js';
export * from './api.js';
export * from './tool.js';
export * from './widget.js';
export * from './browser-sync.js';
