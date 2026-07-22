#!/usr/bin/env bash
# Demo via cloudflared — production FE (no WebSocket/HMR errors through HTTPS tunnel).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-3000}"
LOG="/tmp/capex-cloudflared.log"

cd "$ROOT"

echo "==> Stopping old processes on :${PORT} / :3001 ..."
make stop >/dev/null 2>&1 || true
pkill -f "cloudflared tunnel --url http://127.0.0.1:${PORT}" 2>/dev/null || true

echo "==> Starting backend :3001 ..."
(cd capexbe && npm run start:dev) &
BE_PID=$!

echo "==> Building frontend (production) ..."
(cd capex-apps && npm run build)

echo "==> Starting frontend :${PORT} (next start, no HMR) ..."
(cd capex-apps && npm run start:public) &
FE_PID=$!

for _ in $(seq 1 30); do
  if curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
    break
  fi
  sleep 1
done

if ! curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
  echo "ERROR: FE failed to start on :${PORT}"
  kill $BE_PID $FE_PID 2>/dev/null || true
  exit 1
fi

: > "$LOG"
echo "==> Starting cloudflared tunnel ..."
cloudflared tunnel --url "http://127.0.0.1:${PORT}" >>"$LOG" 2>&1 &
CF_PID=$!

for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  if [ -n "$URL" ]; then
    echo ""
    echo "=========================================="
    echo "  CAPEX tunnel (production — no WS errors)"
    echo "  $URL"
    echo "=========================================="
    echo "  BE pid $BE_PID | FE pid $FE_PID | tunnel pid $CF_PID"
    echo "  Stop: kill $BE_PID $FE_PID $CF_PID"
    echo "  Press Ctrl+C — or run: make stop && kill $CF_PID"
    wait
    exit 0
  fi
  sleep 1
done

echo "Tunnel log: tail -f $LOG"
wait
