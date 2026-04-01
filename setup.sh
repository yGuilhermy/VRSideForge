#!/bin/bash
set -e

echo "=========================================="
echo "   VR Rookie Downloader - Linux Installer"
echo "=========================================="
echo

echo "[0/4] Checking System Requirements..."

if ! command -v node &> /dev/null; then
  echo
  echo "[ERROR] Node.js not found!"
  echo "Please install Node.js v18 or newer before continuing."
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  echo
  exit 1
else
  NODE_VER=$(node -v)
  echo "OK! Node.js detected: $NODE_VER"
fi

echo

if ! command -v adb &> /dev/null; then
  echo "[!] ADB (Android Debug Bridge) not found in PATH."
  echo "Checking system package..."

  if dpkg -l adb &> /dev/null 2>&1; then
    echo "OK! ADB found via dpkg (adb package)."
  else
    echo
    echo "[!] ADB not installed. Attempting to install via apt..."
    if command -v apt-get &> /dev/null; then
      sudo apt-get update -qq
      sudo apt-get install -y adb
      if command -v adb &> /dev/null; then
        echo "[OK] ADB installed successfully via apt!"
      else
        ADB_DIR="$HOME/.local/share/VRRookieDownloader/adb"
        mkdir -p "$ADB_DIR"
        echo "[1/3] Downloading ADB platform-tools for Linux..."
        curl -L "https://dl.google.com/android/repository/platform-tools-latest-linux.zip" -o "$ADB_DIR/platform-tools.zip"
        echo "[2/3] Extracting..."
        unzip -q "$ADB_DIR/platform-tools.zip" -d "$ADB_DIR"
        echo "[3/3] Organizing..."
        mv "$ADB_DIR/platform-tools/"* "$ADB_DIR/"
        rmdir "$ADB_DIR/platform-tools"
        rm -f "$ADB_DIR/platform-tools.zip"
        chmod +x "$ADB_DIR/adb"
        echo "export PATH=\"\$PATH:$ADB_DIR\"" >> "$HOME/.bashrc"
        export PATH="$PATH:$ADB_DIR"
        echo "[OK] ADB installed at $ADB_DIR"
        echo "IMPORTANT: Restart your terminal or run: source ~/.bashrc"
      fi
    else
      echo "[!] apt-get not found. Please install ADB manually."
      echo "    sudo apt-get install adb"
    fi
  fi
else
  echo "OK! ADB detected: $(adb --version | head -1)"
fi

echo

echo "[!] Checking qBittorrent..."
QBIT_FOUND=false
if command -v qbittorrent &> /dev/null; then
  echo "OK! qBittorrent (GUI) detected."
  QBIT_FOUND=true
elif command -v qbittorrent-nox &> /dev/null; then
  echo "OK! qBittorrent-nox (headless) detected."
  QBIT_FOUND=true
fi

if [ "$QBIT_FOUND" = false ]; then
  echo "[!] qBittorrent not detected on the system."
  echo
  read -r -p "[?] Do you want to install qBittorrent? (G=GUI / N=Headless nox / S=Skip): " INSTALL_QBIT
  case "$INSTALL_QBIT" in
    [Gg]*)
      if command -v apt-get &> /dev/null; then
        echo "Installing qBittorrent (GUI)..."
        sudo apt-get update -qq
        sudo apt-get install -y qbittorrent
        echo "[OK] qBittorrent (GUI) installed!"
        echo
        echo "IMPORTANT: After opening qBittorrent, enable the Web UI:"
        echo "  Tools > Options > Web UI"
        echo "  IP: 127.0.0.1 | Port: 8080"
        echo "  Username: admin | Password: adminadmin"
      else
        echo "[!] apt-get not found. Install qBittorrent manually."
      fi
      ;;
    [Nn]*)
      if command -v apt-get &> /dev/null; then
        echo "Installing qBittorrent-nox (headless)..."
        sudo apt-get update -qq
        sudo apt-get install -y qbittorrent-nox
        echo "[OK] qBittorrent-nox installed!"
        echo
        echo "IMPORTANT: Run 'qbittorrent-nox' and configure Web UI on first launch."
        echo "  Accept the legal notice, then access http://127.0.0.1:8080"
        echo "  Default credentials: admin / adminadmin"
      else
        echo "[!] apt-get not found. Install qbittorrent-nox manually."
      fi
      ;;
    *)
      echo "[!] qBittorrent installation skipped."
      echo "IMPORTANT: The application requires a torrent client to download games."
      ;;
  esac
fi

echo

echo "[1/4] Checking Root dependencies..."
if [ ! -d "node_modules" ]; then
  echo "Installing..."
  npm install
else
  echo "OK!"
fi

echo "[2/4] Checking Backend dependencies..."
if [ ! -d "backend/node_modules" ]; then
  echo "Installing..."
  (cd backend && npm install)
else
  echo "OK!"
fi

echo "[3/4] Checking Frontend dependencies..."
NEXT_BIN="frontend/node_modules/.bin/next"
if [ ! -f "$NEXT_BIN" ]; then
  echo "Next.js binaries not found or corrupted. Reinstalling..."
  if [ -d "frontend/node_modules" ]; then
    rm -rf "frontend/node_modules"
  fi
  (cd frontend && npm install)
else
  if [ ! -d "frontend/node_modules" ]; then
    echo "Installing..."
    (cd frontend && npm install)
  else
    echo "OK!"
  fi
fi

echo

echo "=========================================="
echo "   Installation Completed Successfully!"
echo "   Run './start.sh' to launch the app."
echo "=========================================="
echo
