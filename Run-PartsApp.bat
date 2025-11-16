@echo off
setlocal ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

where py >nul 2>nul && (set "PY=py") || (set "PY=python")

set "PORT=8081"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do set "PID=%%a"
if defined PID (
  echo Port %PORT% busy, trying next...
  set /a PORT=%PORT%+1
)

start "Parts PWA Server" /min %PY% -m http.server %PORT% --bind 127.0.0.1
timeout /t 2 >nul

set "URL=http://localhost:%PORT%/"
echo Opening %URL%
start "" "%URL%"
echo Running. Close this window to stop the server.
pause >nul
