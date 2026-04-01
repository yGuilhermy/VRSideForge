@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo    VR Rookie Downloader - Updater
echo ==========================================
echo.

if not exist "package.json" (
    echo [ERROR] package.json not found.
    pause
    exit /b 1
)

for /f "tokens=2 delims=:," %%a in ('findstr /i "version" package.json') do (
    set "LOCAL_VERSION=%%~a"
    set "LOCAL_VERSION=!LOCAL_VERSION:"=!"
    set "LOCAL_VERSION=!LOCAL_VERSION: =!"
    goto :ve1
)
:ve1

echo [INFO] Local Version: !LOCAL_VERSION!

echo [INFO] Checking for updates...
curl -s https://raw.githubusercontent.com/yGuilhermy/VRRookieDownloader/main/package.json > temp_pkg.json
for /f "tokens=2 delims=:," %%a in ('findstr /i "version" temp_pkg.json') do (
    set "REMOTE_VERSION=%%~a"
    set "REMOTE_VERSION=!REMOTE_VERSION:"=!"
    set "REMOTE_VERSION=!REMOTE_VERSION: =!"
    goto :ve2
)
:ve2
del temp_pkg.json

echo [INFO] Remote Version: !REMOTE_VERSION!

if "!LOCAL_VERSION!"=="!REMOTE_VERSION!" (
    echo [INFO] You are already on the latest version.
    pause
    exit /b 0
)

echo [INFO] Update available! Starting process...

echo [INFO] Terminating Node.js processes...
taskkill /F /IM node.exe >nul 2>nul
taskkill /F /IM next.exe >nul 2>nul

for /f "delims=" %%a in ('wmic OS Get localdatetime ^| find "."') do set dt=%%a
set "dt_safe=!dt:~0,14!"
set "BACKUP_DIR=old_!LOCAL_VERSION!_!dt_safe!"
mkdir "!BACKUP_DIR!"

echo [INFO] Moving files to !BACKUP_DIR!...
for /d %%d in (*) do (
    echo %%d | findstr /b "old_" >nul
    if errorlevel 1 (
        if /i not "%%d"=="node_modules" if /i not "%%d"=="!BACKUP_DIR!" if /i not "%%d"==".git" (
            move "%%d" "!BACKUP_DIR!\" >nul
        )
    )
)
for %%f in (*) do (
    if /i not "%%f"=="update.bat" if /i not "%%f"=="update.sh" (
        move "%%f" "!BACKUP_DIR!\" >nul
    )
)

if exist "!BACKUP_DIR!\backend\node_modules" (
    mkdir backend >nul 2>nul
    move "!BACKUP_DIR!\backend\node_modules" "backend\" >nul
)
if exist "!BACKUP_DIR!\frontend\node_modules" (
    mkdir frontend >nul 2>nul
    move "!BACKUP_DIR!\frontend\node_modules" "frontend\" >nul
)

echo [INFO] Downloading new version...
git clone https://github.com/yGuilhermy/VRRookieDownloader.git temp_update

echo [INFO] Applying new files...
xcopy temp_update\* . /E /Y /H /Q >nul
rmdir /s /q temp_update

echo [INFO] Running setup (setup.bat)...
call setup.bat

echo.
echo ==========================================
echo [OK] Update completed! Version: !REMOTE_VERSION!
echo ==========================================
pause
