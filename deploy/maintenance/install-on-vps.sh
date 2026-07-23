#!/usr/bin/env bash
# =============================================================================
# CAPEX Maintenance Page — install on VPS (paste / run as ubuntu)
# Ganti capex-web + capex-api dengan halaman HTML statis di port 8080
# =============================================================================
set -euo pipefail

WEB_PORT="${CAPEX_WEB_PORT:-8080}"
SITE_DIR="${CAPEX_SITE_DIR:-/opt/capex-maintenance}"
REPO_DIR="${CAPEX_REPO_DIR:-}"

echo "==> CAPEX maintenance installer"
echo "    site: $SITE_DIR"
echo "    port: 127.0.0.1:$WEB_PORT"

# --- Cari repo monorepo (opsional) -------------------------------------------
if [ -z "$REPO_DIR" ]; then
  for candidate in \
    "$HOME/capex" \
    "/ops-agentic/workspaces/developer-aldryan/capex" \
    "/var/www/capex" \
    "/home/ubuntu/capex"; do
    if [ -f "$candidate/capex-apps/public/capex-v2.html" ]; then
      REPO_DIR="$candidate"
      break
    fi
  done
fi

sudo mkdir -p "$SITE_DIR/images"

if [ -n "$REPO_DIR" ] && [ -f "$REPO_DIR/capex-apps/public/capex-v2.html" ]; then
  echo "==> Copy dari repo: $REPO_DIR"
  sudo cp "$REPO_DIR/capex-apps/public/capex-v2.html" "$SITE_DIR/index.html"
  sudo cp "$REPO_DIR/capex-apps/public/capex-pro-favicon.svg" "$SITE_DIR/" 2>/dev/null || true
  sudo cp "$REPO_DIR/capex-apps/public/images/login-bg.png" "$SITE_DIR/images/"
else
  echo "ERROR: Repo tidak ditemukan."
  echo "Set CAPEX_REPO_DIR=/path/to/capex lalu jalankan lagi,"
  echo "atau upload folder deploy/maintenance/site ke $SITE_DIR"
  exit 1
fi

# --- Stop stack lama ---------------------------------------------------------
for dir in \
  "/ops-agentic/workspaces/developer-aldryan/capex-deploy" \
  "$HOME/capex-deploy"; do
  if [ -f "$dir/docker-compose.yml" ]; then
    echo "==> Stop capex-web / capex-api di $dir"
    (cd "$dir" && docker compose stop capex-web capex-api 2>/dev/null) || true
  fi
done

# Hapus container lama di port yang sama
docker rm -f capex-maintenance 2>/dev/null || true
docker rm -f capex-web 2>/dev/null || true

# --- Nginx container (static only) -------------------------------------------
echo "==> Start nginx maintenance..."
docker run -d \
  --name capex-maintenance \
  --restart unless-stopped \
  -p "127.0.0.1:${WEB_PORT}:80" \
  -v "$SITE_DIR:/usr/share/nginx/html:ro" \
  nginx:1.27-alpine

sleep 2
echo ""
echo "==> Smoke test:"
curl -sI "http://127.0.0.1:${WEB_PORT}/" | head -3
echo ""
echo "DONE. Buka domain publik (nginx proxy ke 127.0.0.1:${WEB_PORT})."
echo "Rollback: docker rm -f capex-maintenance && cd capex-deploy && docker compose up -d capex-web capex-api"
