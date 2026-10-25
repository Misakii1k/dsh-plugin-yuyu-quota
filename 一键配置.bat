@echo off
chcp 65001 >nul
title 鱼鱼API - DeepSeek Harness 插件一键配置向导
cd /d "%~dp0"

echo 正在检查 Node.js 运行环境...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 本机未检测到 Node.js 环境，请先安装 Node.js！
    pause
    exit /b 1
)

echo 正在编译最新插件组件...
call npm run build >nul 2>&1

echo 启动自动凭证探测与配置同步...
node setup.mjs

echo.
pause
