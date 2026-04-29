@echo off
setlocal EnableDelayedExpansion
title CAMS Installer
color 0A

echo.
echo  ============================================
echo    CAMS - CCTV Layout Planner  ^|  Installer
echo  ============================================
echo.

:: ── Check Node.js ────────────────────────────────────────────────────────────
echo [1/4] Checking Node.js...
where node >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%v in ('node -v 2^>^&1') do set NODE_VER=%%v
    echo       Found Node.js !NODE_VER!
    goto :npm_check
)

echo       Node.js not found. Attempting to install via winget...
echo.

:: Try winget (Windows 10 1709+ / Windows 11)
where winget >nul 2>&1
if %errorlevel% == 0 (
    echo [1/4] Installing Node.js LTS via winget...
    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if !errorlevel! == 0 (
        echo       Node.js installed successfully.
        :: Refresh PATH for this session
        for /f "tokens=*" %%p in ('powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\"PATH\",\"Machine\")"') do set "PATH=%%p;%PATH%"
        goto :npm_check
    ) else (
        echo.
        echo  [ERROR] winget install failed.
        goto :manual_node
    )
) else (
    goto :manual_node
)

:manual_node
echo.
echo  ============================================================
echo   Node.js is required but could not be installed automatically.
echo.
echo   Please install it manually:
echo     1. Go to  https://nodejs.org
echo     2. Download and install the LTS version
echo     3. Re-run this installer after Node.js is installed
echo  ============================================================
echo.
pause
exit /b 1

:: ── Check npm ────────────────────────────────────────────────────────────────
:npm_check
echo.
echo [2/4] Checking npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] npm not found. Please reinstall Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo       npm found.

:: ── Install dependencies ─────────────────────────────────────────────────────
echo.
echo [3/4] Installing dependencies (npm install)...
cd /d "%~dp0"
npm install
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] npm install failed. Check your internet connection and retry.
    pause
    exit /b 1
)
echo       Dependencies installed.

:: ── Create start script ──────────────────────────────────────────────────────
echo.
echo [4/4] Creating start-cams.bat...

set STARTSCRIPT=%~dp0start-cams.bat
(
    echo @echo off
    echo title CAMS Server
    echo cd /d "%%~dp0"
    echo echo.
    echo echo  Starting CAMS server...
    echo echo  Open your browser at: http://localhost:8080
    echo echo.
    echo echo  Press Ctrl+C to stop the server.
    echo echo.
    echo node server.js
    echo pause
) > "%STARTSCRIPT%"

echo       start-cams.bat created.

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo    Installation complete!
echo  ============================================
echo.
echo   To start CAMS:
echo     - Double-click  start-cams.bat
echo     - Then open     http://localhost:8080
echo.
echo   To access from other devices on the network:
echo     - Use  http://^<this-computer-ip^>:8080
echo.

set /p LAUNCH="  Start CAMS now? [Y/N]: "
if /i "!LAUNCH!" == "Y" (
    echo.
    echo  Launching CAMS...
    start "" "%STARTSCRIPT%"
    timeout /t 2 /nobreak >nul
    start "" "http://localhost:8080"
)

echo.
pause
endlocal
