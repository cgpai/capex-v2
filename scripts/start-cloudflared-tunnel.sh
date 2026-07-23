#!/usr/bin/env bash
# Quick public HTTPS tunnel to local FE (:3000). Requires: make run + cloudflared.
set -euo pipefail

PORT="${1:-3000}"
LOG="/tmp/capex-cloudflared.log"

extract_tunnel_url() {
  strings "$LOG" 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true
}

if ! curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
  echo "ERROR: nothing listening on http://127.0.0.1:${PORT} — run: make run"
  exit 1
fi

pkill -f "cloudflared tunnel --url http://127.0.0.1:${PORT}" 2>/dev/null || true
: > "$LOG"

echo "Starting cloudflared → localhost:${PORT} ..."
cloudflared tunnel --url "http://127.0.0.1:${PORT}" >>"$LOG" 2>&1 &
CF_PID=$!

for _ in $(seq 1 45); do
  URL=$(extract_tunnel_url)
  if [ -n "$URL" ]; then
    echo ""
    echo "=========================================="
    echo "  CAPEX public URL (share this):"
    echo "  $URL"
    echo "=========================================="
    echo "  PID: $CF_PID  |  log: $LOG"
    echo "  Stop: kill $CF_PID"
    exit 0
  fi
  sleep 1
done

echo "Tunnel started but URL not ready yet."
echo "Run: strings $LOG | grep trycloudflare"
exit 0
