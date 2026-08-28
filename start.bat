@echo off
chcp 65001 >nul
echo ====================================
echo   奶茶审批局 启动中...
echo   本机访问： http://localhost:3000
echo   按 Ctrl+C 可停止
echo ====================================
start "" http://localhost:3000
node "%~dp0server.js"
pause
