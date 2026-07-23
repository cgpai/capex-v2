#!/usr/bin/env bash
# Public HTTPS tunnel to localhost:PORT — prefers ngrok, falls back to cloudflared.
set -euo pipefail

PORT="${1:-3000}"
CF_LOG="/tmp/capex-cloudflared.log"

if ! curl -sS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
  echo "ERROR: nothing on http://127.0.0.1:${PORT} — run: make run  OR  make run-tunnel-demo"
  exit 1
fi

pkill -f "cloudflared tunnel --url http://127.0.0.1:${PORT}" 2>/dev/null || true
pkill -f "ngrok http ${PORT}" 2>/dev/null || true
sleep 1

if command -v ngrok >/dev/null 2>&1; then
  echo "Starting ngrok → localhost:${PORT} ..."
  ngrok http "$PORT" --log=stdout > /tmp/capex-ngrok.log 2>&1 &
  NG_PID=$!
  URL=""
  for _ in $(seq 1 20); do
    URL=$(curl -sS http://127.0.0.1:4040/api/tunnels 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); ts=d.get('tunnels',[]); print(next((t['public_url'] for t in ts if t.get('public_url','').startswith('https')), ''))" 2>/dev/null || true)
    if [ -n "$URL" ]; then break; fi
    sleep 1
  done
  if [ -n "$URL" ]; then
    echo ""
    echo "=========================================="
    echo "  CAPEX public URL (ngrok):"
    echo "  $URL"
    echo "=========================================="
    echo "$URL" > /tmp/capex-tunnel-url.txt
    echo "  PID: $NG_PID  |  log: /tmp/capex-ngrok.log"
    echo "  Stop: kill $NG_PID"
    exit 0
  fi
  kill $NG_PID 2>/dev/null || true
  echo "ngrok failed — trying cloudflared ..."
fi

: > "$CF_LOG"
echo "Starting cloudflared → localhost:${PORT} ..."
cloudflared tunnel --url "http://127.0.0.1:${PORT}" >>"$CF_LOG" 2>&1 &
CF_PID=$!

for _ in $(seq 1 45); do
  URL=$(strings "$CF_LOG" 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true)
  if [ -n "$URL" ]; then
    echo ""
    echo "=========================================="
    echo "  CAPEX public URL (cloudflared):"
    echo "  $URL"
    echo "=========================================="
    echo "  PID: $CF_PID  |  log: $CF_LOG"
    echo "  Stop: kill $CF_PID"
    exit 0
  fi
  sleep 1
done

echo "Tunnel started — check log:"
echo "  strings $CF_LOG | grep trycloudflare"
exit 0
