#!/bin/bash
set -e

echo "=========================================="
echo "   VR Rookie Downloader - Updater"
echo "=========================================="
echo

if [ ! -f "package.json" ]; then
    echo "[ERROR] package.json not found."
    exit 1
fi

LOCAL_VERSION=$(grep -m1 '"version"' package.json | awk -F '"' '{print $4}')
echo "[INFO] Local Version: $LOCAL_VERSION"

echo "[INFO] Checking for updates..."
REMOTE_VERSION=$(curl -s https://raw.githubusercontent.com/yGuilhermy/VRRookieDownloader/main/package.json | grep -m1 '"version"' | awk -F '"' '{print $4}')
echo "[INFO] Remote Version: $REMOTE_VERSION"

if [ "$LOCAL_VERSION" == "$REMOTE_VERSION" ]; then
    echo "[INFO] You are already on the latest version."
    exit 0
fi

echo "[INFO] Update available! Starting process..."

echo "[INFO] Terminating Node.js processes..."
pkill -f "node " || true
pkill -f "next-server" || true
sleep 1

DATE_STR=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="old_${LOCAL_VERSION}_${DATE_STR}"
mkdir -p "$BACKUP_DIR"

echo "[INFO] Moving files to $BACKUP_DIR ..."

for item in * .*; do
    if [ "$item" != "." ] && [ "$item" != ".." ] && [ "$item" != "node_modules" ] && [ "$item" != ".git" ] && [[ "$item" != old_* ]] && [ "$item" != "$BACKUP_DIR" ] && [ "$item" != "update.sh" ] && [ "$item" != "update.bat" ]; then
        mv "$item" "$BACKUP_DIR/" 2>/dev/null || true
    fi
done

if [ -d "$BACKUP_DIR/backend/node_modules" ]; then
    mkdir -p backend
    mv "$BACKUP_DIR/backend/node_modules" backend/
fi
if [ -d "$BACKUP_DIR/frontend/node_modules" ]; then
    mkdir -p frontend
    mv "$BACKUP_DIR/frontend/node_modules" frontend/
fi

echo "[INFO] Downloading new version..."
git clone https://github.com/yGuilhermy/VRRookieDownloader.git temp_update

echo "[INFO] Applying new files..."
cp -a temp_update/. .
rm -rf temp_update

echo "[INFO] Running setup (setup.sh)..."
chmod +x setup.sh start.sh update.sh
./setup.sh

echo
echo "=========================================="
echo "[OK] Update completed! Version: $REMOTE_VERSION"
echo "=========================================="
