#!/bin/bash
set -e

echo "=========================================="
echo "   VRSideForge - Linux Starter"
echo "=========================================="
echo

NEXT_BIN="frontend/node_modules/.bin/next"

if [ ! -f "$NEXT_BIN" ]; then
  echo "[WARNING] Next.js binaries not found."
  echo "Attempting automatic correction..."
  bash setup.sh
fi

echo
echo "[1/1] Starting VRSideForge..."
echo

# Clear Next.js cache to ensure portability across different paths
if [ -d "frontend/.next" ]; then
  rm -rf "frontend/.next"
fi

npm run dev
