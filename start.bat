@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo    VRSideForge - Auto Starter
echo ==========================================
echo.

:: Check for Next.js binary before starting
set "NEXT_BIN=frontend\node_modules\.bin\next.cmd"

if not exist "!NEXT_BIN!" (
    echo [ALERTA] Binarios do Next.js nao encontrados. 
    echo Tentando correcao automatica...
    call setup.bat
)

echo.
echo [1/1] Starting VRSideForge...
echo.

:: Try to run dev
call npm run dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] The process closed with error code !ERRORLEVEL!. 
    echo Maybe you need to run 'setup.bat' manually.
)

pause
