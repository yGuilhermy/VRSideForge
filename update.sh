#!/bin/bash
set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
echo -e "${BLUE}==========================================${NC}"
echo "   VR Rookie Downloader - Updater"
echo -e "${BLUE}==========================================${NC}"
echo
if [ ! -f "package.json" ]; then
    echo -e "${RED}[ERROR] package.json not found.${NC}"
    exit 1
fi
LOCAL_VERSION=$(grep '"version"' package.json | head -n 1 | awk -F '"' '{print $4}')
echo -e "[INFO] Local Version: ${GREEN}$LOCAL_VERSION${NC}"
echo "[INFO] Checking for updates on GitHub..."
REMOTE_JSON=$(curl -s "https://raw.githubusercontent.com/yGuilhermy/VRRookieDownloader/main/package.json?t=$(date +%s)")
REMOTE_VERSION=$(echo "$REMOTE_JSON" | grep '"version"' | head -n 1 | awk -F '"' '{print $4}')
if [ -z "$REMOTE_VERSION" ]; then
    echo -e "${RED}[ERROR] Failed to fetch remote version.${NC}"
    exit 1
fi
echo -e "[INFO] Remote Version: ${YELLOW}$REMOTE_VERSION${NC}"
if [ "$LOCAL_VERSION" == "$REMOTE_VERSION" ]; then
    echo "[INFO] You are already on the latest version."
    exit 0
fi
echo
echo -e "${YELLOW}[INFO] Update available!${NC} Starting process..."
echo
echo "[INFO] Terminating Node.js processes..."
pkill -f "node " || true
pkill -f "next-server" || true
sleep 2
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
echo "[INFO] Downloading new version (ZIP)..."
curl -L "https://github.com/yGuilhermy/VRRookieDownloader/archive/refs/heads/main.zip" -o update.zip
echo "[INFO] Extracting files..."
unzip -q update.zip
rm update.zip
echo "[INFO] Applying new files..."
cp -af VRRookieDownloader-main/* . || cp -af VRRookieDownloader-master/* .
rm -rf VRRookieDownloader-main VRRookieDownloader-master
chmod +x setup.sh start.sh update.sh
./setup.sh
echo
echo -e "${GREEN}==========================================${NC}"
echo -e "[OK] Update completed! Version: $REMOTE_VERSION"
echo -e "${GREEN}==========================================${NC}"
