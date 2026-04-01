#!/bin/bash
set -e

echo "=========================================="
echo "   VR Rookie Downloader - Auto Starter"
echo "=========================================="
echo

NEXT_BIN="frontend/node_modules/.bin/next"

if [ ! -f "$NEXT_BIN" ]; then
  echo "[AVISO] Binários do Next.js não encontrados."
  echo "Tentando correção automática..."
  bash setup.sh
fi

echo
echo "[1/1] Iniciando Backend e Frontend..."
echo

npm run dev
