@echo off
chcp 65001 >nul
title 鱼鱼API - DeepSeek Harness 跨机器一键安装与自适应配置向导
cd /d "%~dp0"

echo ======================================================================
echo    [鱼鱼API 资产监控插件 - 全自动跨机器一键配置向导]
echo ======================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [提示] 安装过程中遇到提示，请查看上方信息。
)

echo.
echo 正在检查本地 Node.js 环境以执行凭据预同步...
where node >nul 2>&1
if %errorlevel% equ 0 (
    echo 检测到 Node.js，正在预先扫描浏览器有效 Token...
    node "%~dp0setup.mjs"
) else (
    echo [提示] 本机未安装独立 Node.js（属于普通用户标准环境）。
    echo 无需担心！DSH 宿主内部自带完整运行时环境。
    echo 请直接打开 DeepSeek Harness 客户端，按 【Ctrl + R】 刷新，
    echo 在卡片内点击【从浏览器同步账号】按钮即可无感提取！
)

echo.
echo ======================================================================
echo    所有配置流程已完成，请在 DSH 客户端中按 Ctrl + R 开启使用！
echo ======================================================================
echo.
pause