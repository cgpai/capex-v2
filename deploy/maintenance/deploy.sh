#!/usr/bin/env bash
# Jalankan di VPS (dari folder deploy/maintenance) setelah git pull.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Stop stack lama (capex-web / capex-api) jika masih jalan..."
if [ -f ../docker-compose.public.example.yml ]; then
  COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"
fi

# Folder deploy produksi di VPS (sesuaikan jika beda)
PROD_DIR="${CAPEX_DEPLOY_DIR:-/ops-agentic/workspaces/developer-aldryan/capex-deploy}"

if [ -f "$PROD_DIR/docker-compose.yml" ]; then
  (cd "$PROD_DIR" && docker compose stop capex-web capex-api 2>/dev/null) || true
fi

echo "==> Build & start halaman maintenance..."
docker compose up -d --build --force-recreate

echo "==> Selesai. Cek: curl -sI http://127.0.0.1:8080/ | head -1"
curl -sI http://127.0.0.1:8080/ | head -1 || true

echo ""
echo "Maintenance page aktif di 127.0.0.1:8080"
echo "Pastikan nginx host masih proxy domain ke port 8080."
