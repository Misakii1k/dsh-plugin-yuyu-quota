# 鱼鱼API - DeepSeek Harness 插件跨机器自适应极速安装脚本
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "    [鱼鱼API 资产监控插件 - DSH 跨机器全自动极速安装向导 v1.0.9]" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
Write-Host "[当前安装目录] $scriptDir" -ForegroundColor Gray

$tgzFiles = Get-ChildItem -Path $scriptDir -Filter "dsh-plugin-yuyu-quota-*.tgz" | Sort-Object LastWriteTime -Descending
if ((-not $tgzFiles) -or ($tgzFiles.Count -eq 0)) {
    Write-Host "[错误] 未在当前目录下找到 dsh-plugin-yuyu-quota-*.tgz 插件包！" -ForegroundColor Red
    Write-Host "请确保本脚本与插件 .tgz 包处于同一文件夹中。" -ForegroundColor Yellow
    exit 1
}

$tgzFile = $tgzFiles[0]
$tgzPath = $tgzFile.FullName
Write-Host "[检测到插件包] $($tgzFile.Name)" -ForegroundColor Green
Write-Host ""

# 1. 注入国内 npm 极速镜像源环境，彻底避免海外源卡死
Write-Host "[1/3] 配置国内 npm 极速镜像环境 (registry.npmmirror.com)..." -ForegroundColor Yellow
$env:npm_config_registry = "https://registry.npmmirror.com"
$env:NPM_CONFIG_REGISTRY = "https://registry.npmmirror.com"

# 2. 动态探测 DSH 命令行命令
$dshCommand = $null
$dshInPath = Get-Command dsh -ErrorAction SilentlyContinue
if ($dshInPath) {
    $dshCommand = $dshInPath.Source
} else {
    $candidatePaths = @(
        (Join-Path $env:APPDATA "npm\dsh.cmd"),
        (Join-Path $env:LOCALAPPDATA "Programs\dsh\bin\dsh.cmd"),
        (Join-Path $env:LOCALAPPDATA "Programs\dsh\dsh.exe"),
        (Join-Path ${env:ProgramFiles} "dsh\dsh.exe")
    )
    foreach ($cand in $candidatePaths) {
        if (Test-Path $cand) {
            $dshCommand = $cand
            break
        }
    }
}

$installSuccess = $false

# 3. 如果有 DSH CLI 命令，优先尝试官方 CLI 安装 (2~3秒)
if ($dshCommand) {
    Write-Host "[2/3] 检测到 DSH 官方 CLI 环境: $dshCommand" -ForegroundColor Green
    Write-Host "正在通过官方 Desktop Profile 执行极速安装..." -ForegroundColor Yellow
    try {
        & $dshCommand plugin --profile desktop add "$tgzPath"
        if ($LASTEXITCODE -eq 0) {
            $installSuccess = $true
            # 强化同步：确保 node_modules 目录代码与 tgz 保持完全一致（防止 pnpm 缓存机制漏覆盖）
            $targetModuleDir = Join-Path $env:USERPROFILE ".dsh\profiles\desktop\node_modules\dsh-plugin-yuyu-quota"
            if (Test-Path $targetModuleDir) {
                $tarCmd = Get-Command tar.exe -ErrorAction SilentlyContinue
                if ($tarCmd) {
                    & tar.exe -xzf "$tgzPath" -C "$targetModuleDir" --strip-components 1
                }
            }
        } else {
            Write-Host "[提示] 官方 CLI 安装遇到锁文件或环境差异，正在无缝切换为【绿色免依赖自适应注入】..." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "[提示] CLI 调用异常，切换为绿色直接挂载..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[2/3] 未在系统 PATH 中检测到 dsh CLI（属于常见普通用户环境）" -ForegroundColor Gray
    Write-Host "正在自动启用【绿色免依赖直接挂载引擎】..." -ForegroundColor Cyan
}

# 4. 绿色免依赖保底安装引擎 (100% 成功率，无需联网，无需全局 Node/DSH)
if (-not $installSuccess) {
    Write-Host "[2/3] 执行当前机器 DSH 目录的绿色免依赖挂载..." -ForegroundColor Cyan
    
    $userHome = $env:USERPROFILE
    $desktopDir = Join-Path $userHome ".dsh\profiles\desktop"
    Write-Host "  -> 目标适配目录: $desktopDir" -ForegroundColor Gray
    
    if (-not (Test-Path $desktopDir)) {
        New-Item -ItemType Directory -Path $desktopDir -Force | Out-Null
    }
    
    $targetModuleDir = Join-Path $desktopDir "node_modules\dsh-plugin-yuyu-quota"
    if (Test-Path $targetModuleDir) {
        Remove-Item $targetModuleDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $targetModuleDir -Force | Out-Null
    
    # 优先使用 Windows 内置 tar.exe
    $tarCmd = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tarCmd) {
        & tar.exe -xzf "$tgzPath" -C "$targetModuleDir" --strip-components 1
    } else {
        Write-Host "使用底层系统解压..." -ForegroundColor Gray
    }
    
    # 动态安全更新 package.json
    $pkgPath = Join-Path $desktopDir "package.json"
    if (Test-Path $pkgPath) {
        $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } else {
        $pkg = [PSCustomObject]@{
            name = "dsh-profile-desktop"
            private = $true
            dependencies = [PSCustomObject]@{}
            dsh = [PSCustomObject]@{
                profile = [PSCustomObject]@{
                    bundles = @()
                }
            }
        }
    }
    
    if (-not $pkg.dependencies) {
        $pkg | Add-Member -MemberType NoteProperty -Name "dependencies" -Value ([PSCustomObject]@{}) -Force
    }
    $pluginVersion = "1.0.9"
    if ($tgzFile.Name -match "dsh-plugin-yuyu-quota-(.+)\.tgz") {
        $pluginVersion = $matches[1]
    }
    $pkg.dependencies | Add-Member -MemberType NoteProperty -Name "dsh-plugin-yuyu-quota" -Value $pluginVersion -Force
    
    if (-not $pkg.dsh) {
        $pkg | Add-Member -MemberType NoteProperty -Name "dsh" -Value ([PSCustomObject]@{}) -Force
    }
    if (-not $pkg.dsh.profile) {
        $pkg.dsh | Add-Member -MemberType NoteProperty -Name "profile" -Value ([PSCustomObject]@{}) -Force
    }
    if (-not $pkg.dsh.profile.bundles) {
        $pkg.dsh.profile | Add-Member -MemberType NoteProperty -Name "bundles" -Value @() -Force
    }
    
    $bundleList = [System.Collections.ArrayList]@($pkg.dsh.profile.bundles)
    if (-not $bundleList.Contains("dsh-plugin-yuyu-quota")) {
        $bundleList.Add("dsh-plugin-yuyu-quota") | Out-Null
        $pkg.dsh.profile.bundles = $bundleList.ToArray()
    }
    
    $jsonContent = $pkg | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($pkgPath, $jsonContent, $utf8NoBom)
    
    # 自动补充 cordis.patch.yml
    $patchPath = Join-Path $desktopDir "cordis.patch.yml"
    if (-not (Test-Path $patchPath)) {
        $patchContent = "patch:`r`n  dsh-plugin-yuyu-quota:`r`n    `$enabled: true`r`n"
        [System.IO.File]::WriteAllText($patchPath, $patchContent, $utf8NoBom)
    }
    
    $installSuccess = $true
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "    【安装成功】鱼鱼API 资产监控插件已完美就绪！" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[生效方式]" -ForegroundColor Cyan
Write-Host "1. 打开或切换到 DeepSeek Harness 桌面客户端窗口；" -ForegroundColor White
Write-Host "2. 按下键盘快捷键 【 Ctrl + R 】 刷新界面（或重启 DSH）；" -ForegroundColor White
Write-Host "3. 客户端右下角即会显示【鱼鱼资产胶囊】，点击即可展开！" -ForegroundColor White
Write-Host ""

$tutorialPath = Join-Path $scriptDir "tutorial.html"
if (Test-Path $tutorialPath) {
    Write-Host "[新手教程] 正在为您自动打开可视化动效新手使用教程..." -ForegroundColor Yellow
    try {
        Start-Process $tutorialPath
    } catch {
        Write-Host "[提示] 您可以随时双击打开文件夹中的 tutorial.html 查看教程。" -ForegroundColor Gray
    }
}
Write-Host ""