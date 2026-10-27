/**
 * Windows 原生通知。
 *
 * 实现要点（均已在本机实测）：
 * 1. 走 PowerShell 的 WinRT ToastNotificationManager，避免引入原生依赖。
 * 2. AppUserModelID 使用 DSH 桌面客户端自己注册的 `com.deepseek.dsh` ——
 *    它由安装包在 HKCU\Software\Classes\AppUserModelId 下注册，通知会以
 *    “DeepSeek-Harness” 的身份显示，并能在操作中心里正确归组。
 *    （PowerShell 的 AUMID 也能弹出，但会显示成 Windows PowerShell。）
 * 3. `<audio src="ms-winsoundevent:Notification.*">` 是 Windows 官方提醒音资源，
 *    与系统设置里的通知声音一致，不需要额外音频文件。
 * 4. `activationType="protocol" launch="dsh://open"` 让点击通知能把 DSH 窗口唤到前台
 *    （桌面端已在 main 进程注册 dsh:// 协议）。
 * 5. 任何失败都不抛出：Toast 不可用时退回 SoundPlayer 播放系统提示音，
 *    保证“任务完成”至少有听得见的反馈。
 */
/** DSH 桌面客户端注册的 AppUserModelID */
declare const DSH_APP_ID = "com.deepseek.dsh";
export type NotifySound = 'Notification.Reminder' | 'Notification.Default' | 'Notification.IM' | 'Notification.Mail' | 'Notification.SMS' | 'none';
export interface DesktopNotificationOptions {
    title: string;
    /** 正文，最多取前三行；每行一个 <text> 节点 */
    body: string;
    /** 是否播放 Windows 官方提示音 */
    sound?: boolean | NotifySound;
    /** 自定义音频绝对路径（如存在则优先播放该音频，并静音 Windows 默认提示音） */
    customSoundPath?: string;
    /** 点击通知后唤起的协议地址，默认 dsh://open */
    launch?: string;
    /** 仅用于日志/诊断，不写入通知内容 */
    reason?: string;
}
/**
 * 发送 Windows 原生 Toast。
 *
 * @returns 一个 Promise，在 PowerShell 退出后 resolve；
 *          `ok` 表示 Toast 是否真的提交成功（失败时已尝试声音兜底）。
 *          调用方通常不需要 await —— 通知不应阻塞会话主流程。
 */
export declare function sendDesktopNotification(options: DesktopNotificationOptions): Promise<{
    ok: boolean;
    detail?: string;
}>;
/** 只发声、不弹通知；用于“通知被节流时至少给个声音反馈”或测试音效。 */
export declare function playSystemAlertSound(customSoundPath?: string): Promise<boolean>;
export { DSH_APP_ID };
