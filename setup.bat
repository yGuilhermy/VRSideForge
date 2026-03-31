@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo    VR Rookie Downloader - Installer
echo ==========================================
echo.

echo [0/4] Checking System Requirements...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js not found!
    echo Please install Node.js v18 or newer before continuing.
    echo Download at: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where adb >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [!] ADB - Android Debug Bridge - not found in PATH.
    echo Downloading official ADB - Platform Tools...
    
    set "ADB_DIR=%USERPROFILE%\Documents\VRRookieDownloader\adb"
    if not exist "!ADB_DIR!" mkdir "!ADB_DIR!"
    
    echo [1/3] Downloading...
    curl -L "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -o "!ADB_DIR!\platform-tools.zip"
    
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to download ADB. Check your internet connection.
    ) else (
        echo [2/3] Extracting files...
        powershell -Command "Expand-Archive -Path '!ADB_DIR!\platform-tools.zip' -DestinationPath '!ADB_DIR!' -Force"
        
        echo [3/3] Organizing files...
        move /y "!ADB_DIR!\platform-tools\*" "!ADB_DIR!\" >nul
        rmdir /s /q "!ADB_DIR!\platform-tools"
        del /f /q "!ADB_DIR!\platform-tools.zip"
        
        echo [INFO] Adding '!ADB_DIR!' to temporary session PATH...
        set "PATH=%PATH%;!ADB_DIR!"
        
        echo [INFO] Adding permanently to user PATH - via setx...
        setx PATH "%PATH%;!ADB_DIR!" >nul
        
        echo.
        echo [OK] ADB installed and configured successfully!
        echo IMPORTANT: If Sideload features do not work immediately, the system will use the fallback path.
    )
    echo.
) else (
    echo OK! ADB detected.
)

echo.
echo [!] Checking qBitTorrent...
where qbittorrent >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\qBittorrent\qbittorrent.exe" (
        echo OK! qBitTorrent found at C:\Program Files\qBittorrent.
    ) else (
        echo [!] qBitTorrent not detected on the system.
        echo Attempting to install via Winget - Windows Package Manager...
        
        winget --version >nul 2>nul
        if !errorlevel! equ 0 (
            echo [1/2] Starting silent installation via Winget...
            winget install --id qBittorrent.qBittorrent --silent --accept-package-agreements --accept-source-agreements
            if !errorlevel! equ 0 (
                echo [2/2] qBitTorrent installed successfully!
                set "QBIT_INSTALLED=1"
            ) else (
                echo [!] Winget installation failed. Attempting direct download...
            )
        ) else (
            echo [!] Winget not found. Attempting direct download...
        )
        
        if not defined QBIT_INSTALLED (
            echo [1/2] Downloading qBitTorrent installer...
            powershell -Command "Invoke-WebRequest -Uri 'https://managedway.dl.sourceforge.net/project/qbittorrent/qbittorrent-win32/qbittorrent-4.6.3/qbittorrent_4.6.3_x64_setup.exe' -OutFile 'qbit_setup.exe'"
            echo [2/2] Running installer - this may take a few minutes...
            start /wait qbit_setup.exe /S
            del /f /q qbit_setup.exe
            echo [OK] qBitTorrent installed successfully!
        )
    )
) else (
    echo OK! qBitTorrent detected in PATH.
)
echo.

echo [1/4] Checking Root dependencies...
if not exist node_modules (
    echo Installing...
    call npm install
) else (
    echo OK!
)

echo [2/4] Checking Backend dependencies...
if not exist backend\node_modules (
    echo Installing...
    pushd backend
    call npm install
    popd
) else (
    echo OK!
)

echo [3/4] Checking Frontend dependencies...
set "NEXT_BIN=frontend\node_modules\.bin\next"

if not exist "!NEXT_BIN!" (
    echo Next.js binaries not found or corrupted. Reinstalling...
    pushd frontend
    if exist node_modules (
        rmdir /s /q node_modules
    )
    call npm install
    popd
) else (
    if not exist frontend\node_modules (
        echo Installing...
        pushd frontend
        call npm install
        popd
    ) else (
        echo OK!
    )
)

echo.
echo ==========================================
echo    Installation Completed Successfully!
echo    Use start.bat to run the project.
echo ==========================================
echo.
pause
