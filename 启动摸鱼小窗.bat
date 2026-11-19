@echo off
chcp 936 >nul
cd /d "%~dp0"
title 摸鱼计时器 · 深海潜航
echo.
echo   摸鱼计时器 · 深海潜航版
echo   正在启动桌面小窗...
echo.

REM 清掉可能继承的运行时环境变量，否则 Electron 会退化成纯 Node 无法开窗
set ELECTRON_RUN_AS_NODE=
REM 国内镜像，避免 Electron 二进制下载失败
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

set "EXE=node_modules\electron\dist\electron.exe"
if not exist "%EXE%" (
  echo   首次运行，需要先安装依赖，请稍候...
  call npm install --no-audit --no-fund
  echo.
)

if not exist "%EXE%" (
  echo   [启动失败] Electron 未能安装成功。
  echo   请检查网络后重新双击本文件，或在命令行手动执行 npm install
  echo.
  pause
  exit /b 1
)

start "" "%EXE%" .
exit /b 0
