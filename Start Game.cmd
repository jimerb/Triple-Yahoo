@echo off
cd /d "%~dp0"
title Triple Yahoo! server
rem Stop any earlier game server still holding port 4317
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:":4317 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
timeout /t 1 /nobreak >nul
set "GAME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%GAME_NODE%" set "GAME_NODE=node"
rem Listen on all network interfaces so phones and tablets on the Wi-Fi can connect
set "HOST=0.0.0.0"
echo.
echo Open one of these on your tablet or phone (same Wi-Fi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http://%%a:4317
echo.
rem Open the browser two seconds after the server starts
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://127.0.0.1:4317'"
"%GAME_NODE%" server.mjs
pause
