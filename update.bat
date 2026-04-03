@echo off
setlocal enabledelayedexpansion
set "ESC= "
set "RED=!ESC![91m"
set "GREEN=!ESC![92m"
set "YELLOW=!ESC![93m"
set "BLUE=!ESC![94m"
set "RESET=!ESC![0m"
echo !BLUE!==========================================!RESET!
echo    VR Rookie Downloader - Updater
echo !BLUE!==========================================!RESET!
echo.
if not exist "package.json" (
    echo !RED![ERROR] package.json not found.!RESET!
    pause
    exit /b 1
)
for /f "tokens=2 delims=:," %%a in ('findstr /i "\"version\"" package.json') do (
    set "LOCAL_VERSION=%%~a"
    set "LOCAL_VERSION=!LOCAL_VERSION:"=!"
    set "LOCAL_VERSION=!LOCAL_VERSION: =!"
    set "LOCAL_VERSION=!LOCAL_VERSION:	=!"
    goto :ve1
)
:ve1
echo [INFO] Local Version: !GREEN!!LOCAL_VERSION!!RESET!
echo [INFO] Checking for updates on GitHub...
curl.exe -s "https://raw.githubusercontent.com/yGuilhermy/VRRookieDownloader/main/package.json?t=%RANDOM%" > temp_pkg.json
if errorlevel 1 (
    echo !RED![ERROR] Failed to check for updates. Check your internet connection.!RESET!
    pause
    exit /b 1
)
for /f "tokens=2 delims=:," %%a in ('findstr /i "\"version\"" temp_pkg.json') do (
    set "REMOTE_VERSION=%%~a"
    set "REMOTE_VERSION=!REMOTE_VERSION:"=!"
    set "REMOTE_VERSION=!REMOTE_VERSION: =!"
    set "REMOTE_VERSION=!REMOTE_VERSION:	=!"
    goto :ve2
)
:ve2
del temp_pkg.json
echo [INFO] Remote Version: !YELLOW!!REMOTE_VERSION!!RESET!
for /f "tokens=1,2,3 delims=." %%x in ("!LOCAL_VERSION!") do (set L1=%%x&set L2=%%y&set L3=%%z)
for /f "tokens=1,2,3 delims=." %%x in ("!REMOTE_VERSION!") do (set R1=%%x&set R2=%%y&set R3=%%z)
set "NEED=0"
if !R1! GTR !L1! (set "NEED=1") else (if !R1! EQU !L1! (if !R2! GTR !L2! (set "NEED=1") else (if !R2! EQU !L2! (if !R3! GTR !L3! (set "NEED=1")))))
if "!NEED!"=="0" (
    echo [INFO] You are already on the latest version.
    pause
    exit /b 0
)
echo.
echo !YELLOW![INFO] Update available!!RESET! Starting process...
echo.
echo [INFO] Terminating Node.js processes...
taskkill /F /IM node.exe >nul 2>nul
taskkill /F /IM next.exe >nul 2>nul
timeout /t 2 /nobreak >nul
for /f "delims=" %%a in ('wmic OS Get localdatetime ^| find "."') do set dt=%%a
set "dt_safe=!dt:~0,14!"
set "BACKUP_DIR=old_!LOCAL_VERSION!_!dt_safe!"
mkdir "!BACKUP_DIR!"
echo [INFO] Moving files to !BACKUP_DIR!...
for /d %%d in (*) do (
    set "dirname=%%d"
    echo !dirname! | findstr /b "old_" >nul
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
    if not exist "backend" mkdir backend
    move "!BACKUP_DIR!\backend\node_modules" "backend\" >nul
)
if exist "!BACKUP_DIR!\frontend\node_modules" (
    if not exist "frontend" mkdir frontend
    move "!BACKUP_DIR!\frontend\node_modules" "frontend\" >nul
)
echo [INFO] Downloading new version (ZIP)...
curl.exe -L "https://github.com/yGuilhermy/VRRookieDownloader/archive/refs/heads/main.zip" -o update.zip
if errorlevel 1 (
    echo !RED![ERROR] Failed to download update ZIP.!RESET!
    pause
    exit /b 1
)
echo [INFO] Extracting files...
powershell -Command "Expand-Archive -Path 'update.zip' -DestinationPath 'temp_update' -Force"
del /f /q update.zip
echo [INFO] Applying new files...
for /d %%d in (temp_update\*) do (
    xcopy "%%d\*" . /E /Y /H /Q >nul
)
rmdir /s /q temp_update
echo [INFO] Running setup (setup.bat)...
call setup.bat
echo.
echo !GREEN!==========================================!RESET!
echo [OK] Update completed! Version: !REMOTE_VERSION!
echo !GREEN!==========================================!RESET!
pause
