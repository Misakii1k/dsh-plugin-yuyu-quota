import { execFile } from 'node:child_process';
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
const DSH_APP_ID = 'com.deepseek.dsh';
const ALLOWED_SOUNDS = new Set([
    'Notification.Reminder',
    'Notification.Default',
    'Notification.IM',
    'Notification.Mail',
    'Notification.SMS'
]);
function resolveSound(sound) {
    if (sound === false || sound === 'none')
        return '';
    if (typeof sound === 'string' && ALLOWED_SOUNDS.has(sound))
        return sound;
    return 'Notification.Reminder';
}
function splitLines(body, limit = 3) {
    return String(body || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => line.length > 0)
        .slice(0, limit);
}
/**
 * PowerShell 脚本。文本通过环境变量传入并在脚本内用
 * SecurityElement.Escape 转义，避免引号/尖括号破坏 XML。
 */
function buildToastScript() {
    return [
        "$ErrorActionPreference = 'Stop'",
        'try {',
        '  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
        '  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
        '  $texts = @()',
        '  foreach ($raw in @($env:YUYU_TOAST_TITLE, $env:YUYU_TOAST_LINE1, $env:YUYU_TOAST_LINE2, $env:YUYU_TOAST_LINE3)) {',
        '    if ([string]::IsNullOrWhiteSpace($raw)) { continue }',
        "    $texts += '<text>' + [System.Security.SecurityElement]::Escape($raw) + '</text>'",
        '  }',
        '  if ($texts.Count -eq 0) { $texts += "<text>DSH 提醒</text>" }',
        "  $launch = if ([string]::IsNullOrWhiteSpace($env:YUYU_TOAST_LAUNCH)) { 'dsh://open' } else { $env:YUYU_TOAST_LAUNCH }",
        "  $hasCustomSound = (![string]::IsNullOrWhiteSpace($env:YUYU_CUSTOM_SOUND_PATH) -and (Test-Path $env:YUYU_CUSTOM_SOUND_PATH))",
        "  $audio = if ($hasCustomSound -or [string]::IsNullOrWhiteSpace($env:YUYU_TOAST_SOUND)) { '<audio silent=\"true\" />' } else { '<audio src=\"ms-winsoundevent:' + $env:YUYU_TOAST_SOUND + '\" loop=\"false\" />' }",
        "  $xml = '<toast activationType=\"protocol\" launch=\"' + [System.Security.SecurityElement]::Escape($launch) + '\"><visual><binding template=\"ToastGeneric\">' + ($texts -join '') + '</binding></visual>' + $audio + '</toast>'",
        '  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument',
        '  $doc.LoadXml($xml)',
        '  $toast = New-Object Windows.UI.Notifications.ToastNotification $doc',
        '  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($env:YUYU_TOAST_APP_ID).Show($toast)',
        '  if ($hasCustomSound) {',
        '    try {',
        '      $p = $env:YUYU_CUSTOM_SOUND_PATH',
        "      if ($p -match '\\.wav$') {",
        '        (New-Object System.Media.SoundPlayer $p).Play()',
        '      } else {',
        '        Add-Type -AssemblyName presentationCore',
        '        $mediaPlayer = New-Object System.Windows.Media.MediaPlayer',
        '        $mediaPlayer.Open([Uri]$p)',
        '        $mediaPlayer.Play()',
        '      }',
        '    } catch { }',
        '  }',
        "  Write-Output 'TOAST_OK'",
        '} catch {',
        "  Write-Output ('TOAST_FAIL: ' + $_.Exception.Message)",
        "  if (![string]::IsNullOrWhiteSpace($env:YUYU_CUSTOM_SOUND_PATH) -and (Test-Path $env:YUYU_CUSTOM_SOUND_PATH)) {",
        '    try {',
        '      $p = $env:YUYU_CUSTOM_SOUND_PATH',
        "      if ($p -match '\\.wav$') {",
        '        (New-Object System.Media.SoundPlayer $p).PlaySync()',
        '      } else {',
        '        Add-Type -AssemblyName presentationCore',
        '        $mediaPlayer = New-Object System.Windows.Media.MediaPlayer',
        '        $mediaPlayer.Open([Uri]$p)',
        '        $mediaPlayer.Play()',
        '      }',
        '    } catch { }',
        "  } elseif ($env:YUYU_TOAST_SOUND -ne '') {",
        '    try {',
        "      $wav = Join-Path $env:WINDIR 'Media\\Windows Notify.wav'",
        '      if (Test-Path $wav) { (New-Object System.Media.SoundPlayer $wav).PlaySync() }',
        '    } catch { }',
        '  }',
        '  exit 1',
        '}'
    ].join('\r\n');
}
const TOAST_SCRIPT_BASE64 = Buffer.from(buildToastScript(), 'utf16le').toString('base64');
/**
 * 发送 Windows 原生 Toast。
 *
 * @returns 一个 Promise，在 PowerShell 退出后 resolve；
 *          `ok` 表示 Toast 是否真的提交成功（失败时已尝试声音兜底）。
 *          调用方通常不需要 await —— 通知不应阻塞会话主流程。
 */
export function sendDesktopNotification(options) {
    if (process.platform !== 'win32') {
        return Promise.resolve({ ok: false, detail: 'not-win32' });
    }
    const lines = splitLines(options.body);
    const soundName = resolveSound(options.sound);
    const customSound = options.customSoundPath && typeof options.customSoundPath === 'string'
        ? options.customSoundPath.trim()
        : '';
    const env = {
        ...process.env,
        YUYU_TOAST_APP_ID: DSH_APP_ID,
        YUYU_TOAST_TITLE: String(options.title || 'DSH 提醒').slice(0, 120),
        YUYU_TOAST_LINE1: lines[0] || '',
        YUYU_TOAST_LINE2: lines[1] || '',
        YUYU_TOAST_LINE3: lines[2] || '',
        YUYU_TOAST_SOUND: soundName,
        YUYU_CUSTOM_SOUND_PATH: customSound,
        YUYU_TOAST_LAUNCH: String(options.launch || 'dsh://open').slice(0, 200)
    };
    return new Promise((resolve) => {
        try {
            execFile('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-WindowStyle',
                'Hidden',
                '-EncodedCommand',
                TOAST_SCRIPT_BASE64
            ], { windowsHide: true, timeout: 15_000, env }, (error, stdout) => {
                const text = String(stdout || '').trim();
                resolve({ ok: !error && text.includes('TOAST_OK'), detail: text.slice(0, 200) || undefined });
            });
        }
        catch (err) {
            resolve({ ok: false, detail: err?.message });
        }
    });
}
/** 只发声、不弹通知；用于“通知被节流时至少给个声音反馈”或测试音效。 */
export function playSystemAlertSound(customSoundPath) {
    if (process.platform !== 'win32')
        return Promise.resolve(false);
    const customSound = customSoundPath && typeof customSoundPath === 'string' ? customSoundPath.trim() : '';
    const cmd = customSound
        ? `$p = $env:YUYU_PLAY_SOUND; if (Test-Path $p) { if ($p -match '\\.wav$') { (New-Object System.Media.SoundPlayer $p).PlaySync() } else { Add-Type -AssemblyName presentationCore; $m = New-Object System.Windows.Media.MediaPlayer; $m.Open([Uri]$p); $m.Play(); Start-Sleep -Milliseconds 800 } }`
        : "$wav = Join-Path $env:WINDIR 'Media\\Windows Notify.wav'; if (Test-Path $wav) { (New-Object System.Media.SoundPlayer $wav).PlaySync() }";
    return new Promise((resolve) => {
        try {
            execFile('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-WindowStyle',
                'Hidden',
                '-Command',
                cmd
            ], { windowsHide: true, timeout: 10_000, env: { ...process.env, YUYU_PLAY_SOUND: customSound } }, (error) => resolve(!error));
        }
        catch {
            resolve(false);
        }
    });
}
export { DSH_APP_ID };
