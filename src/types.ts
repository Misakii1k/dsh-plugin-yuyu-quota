/**
 * 鱼鱼 API 数据类型定义
 */

export interface UserProfile {
  id: number;
  email: string;
  username: string;
  role: string;
  balance: number;           // 账户可用余额（元）
  frozen_balance: number;    // 冻结金额（元）
  total_recharged: number;   // 累计充值（元）
  status: string;
  concurrency: number;
  rpm_limit: number;
}

export interface UsageStats {
  total_api_keys: number;
  active_api_keys: number;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  today_requests: number;
  today_tokens: number;
  today_cost: number;        // 今日消耗（元）
  today_input_tokens: number;
  today_output_tokens: number;
}

export interface ApiKeyItem {
  id: number;
  name: string;
  key: string;
  group_id: number;
  status: string;
  quota: number;
  quota_used: number;
  group?: {
    id: number;
    name: string;
    platform: string;
    rate_multiplier: number;
  };
}

export interface BalanceSnapshot {
  success: boolean;
  timestamp: number;
  email: string;
  balance: number;           // 余额
  frozenBalance: number;     // 冻结
  todayCost: number;         // 今日花费
  todayTokens: number;       // 今日消耗 Token
  todayRequests: number;     // 今日请求数
  keysCount: number;         // 活跃 Key 数量
  keysSummary: string[];     // Key 分组概要
  isLowBalance: boolean;     // 是否触发低额报警
  alertThreshold: number;    // 预警阈值
  formattedText: string;     // 中文自然语言友好摘要
  error?: string;
}

export type RefreshInterval = '30s' | '1m' | '3m' | '5m';

export interface PluginConfig {
  /** 鱼鱼API 网页登录 Auth Token (JWT) */
  token: string;
  /** 定时刷新频率 (预设：30秒、1分钟、3分钟、5分钟) */
  refreshInterval: RefreshInterval;
  /** 低额警示阈值（单位：元，默认 2.00 元） */
  alertThreshold: number;
  /** API 基础服务地址，默认 https://sub.anzhiyu.com */
  baseUrl?: string;
}
