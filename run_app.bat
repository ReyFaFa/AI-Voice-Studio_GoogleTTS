@echo off
echo AI Voice Studio starting...
echo [1/3] Checking dependencies...
call npm install
echo Dependencies checked.

echo.
echo [2/3] Checking port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Port 3000 is in use by PID %%a. Killing process...
    taskkill /F /PID %%a
    timeout /t 2 >nul
)

echo.
echo [3/3] Starting dev server on port 3000...
call npm run dev
pause
