#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "  CAPEX — Cursor Tunnel (Port Forward)"
echo "=========================================="
echo ""
echo "  1. Pastikan app jalan:  make run"
echo "  2. Cursor → tab Ports → Forward a Port → 3000"
echo "  3. Klik kanan port → Port Visibility → Public"
echo "  4. Copy URL  https://....devtunnels.ms"
echo ""
echo "  Hanya port 3000 — BE (:3001) via BFF /api/be"
echo ""
if curl -sS -o /dev/null -w "" http://127.0.0.1:3000/ 2>/dev/null; then
  echo "  Status FE :3000  →  OK (running)"
else
  echo "  Status FE :3000  →  NOT running (make run)"
fi
echo ""
cursor tunnel status 2>/dev/null || echo "  Tunnel CLI: jalankan 'cursor tunnel user login' jika belum"
echo "=========================================="
