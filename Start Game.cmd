@echo off
cd /d "%~dp0"
title Triple Yahoo! server
rem Stop any earlier game server still holding port 4317
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":4317 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
timeout /t 1 /nobreak >nul
set "GAME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%GAME_NODE%" set "GAME_NODE=node"
rem Open the browser two seconds after the server starts
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://127.0.0.1:4317'"
"%GAME_NODE%" server.mjs
pause
