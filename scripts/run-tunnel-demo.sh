#!/usr/bin/env bash
# One-shot: BE + FE dev + public tunnel (ngrok preferred, cloudflared fallback).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-3000}"
CF_LOG="/tmp/capex-cloudflared.log"

cd "$ROOT"

echo "==> Stopping old processes ..."
make stop >/dev/null 2>&1 || true
pkill -f "cloudflared tunnel --url http://127.0.0.1:${PORT}" 2>/dev/null || true
pkill -f "ngrok http ${PORT}" 2>/dev/null || true
sleep 1

echo "==> Starting backend :3001 ..."
(cd capexbe && npm run start:dev) &
BE_PID=$!

echo "==> Starting frontend :${PORT} ..."
(cd capex-apps && npm run dev) &
FE_PID=$!

echo "==> Waiting for FE (up to 90s) ..."
for _ in $(seq 1 90); do
  if curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
    break
  fi
  sleep 1
done

if ! curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
  echo "ERROR: FE not ready on :${PORT}"
  kill $BE_PID $FE_PID 2>/dev/null || true
  exit 1
fi

TUNNEL_PID=""
PUBLIC_URL=""

if command -v ngrok >/dev/null 2>&1; then
  echo "==> Starting ngrok ..."
  ngrok http "$PORT" --log=stdout > /tmp/capex-ngrok.log 2>&1 &
  TUNNEL_PID=$!
  for _ in $(seq 1 20); do
    PUBLIC_URL=$(curl -sS http://127.0.0.1:4040/api/tunnels 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); ts=d.get('tunnels',[]); print(next((t['public_url'] for t in ts if t.get('public_url','').startswith('https')), ''))" 2>/dev/null || true)
    [ -n "$PUBLIC_URL" ] && break
    sleep 1
  done
fi

if [ -z "$PUBLIC_URL" ]; then
  echo "==> Starting cloudflared ..."
  : > "$CF_LOG"
  cloudflared tunnel --url "http://127.0.0.1:${PORT}" >>"$CF_LOG" 2>&1 &
  TUNNEL_PID=$!
  for _ in $(seq 1 45); do
    PUBLIC_URL=$(strings "$CF_LOG" 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true)
    [ -n "$PUBLIC_URL" ] && break
    sleep 1
  done
fi

echo ""
echo "=========================================="
if [ -n "$PUBLIC_URL" ]; then
  echo "  CAPEX tunnel URL:"
  echo "  $PUBLIC_URL"
  echo "$PUBLIC_URL" > /tmp/capex-tunnel-url.txt
else
  echo "  Tunnel starting — check /tmp/capex-ngrok.log or $CF_LOG"
fi
echo "=========================================="
echo "  BE $BE_PID | FE $FE_PID | tunnel $TUNNEL_PID"
echo "  URL file: /tmp/capex-tunnel-url.txt"
echo "  Stop: make stop && kill $TUNNEL_PID 2>/dev/null"
echo "" >&2

cleanup() {
  kill $BE_PID $FE_PID $TUNNEL_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM
wait
