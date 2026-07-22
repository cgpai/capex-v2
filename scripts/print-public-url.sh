#!/usr/bin/env bash
set -euo pipefail

PUBLIC_IP="$(curl -sS --max-time 5 https://api.ipify.org 2>/dev/null || echo "?")"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "?")"
FE_PORT="${FE_PORT:-3000}"

echo "=========================================="
echo "  CAPEX Public Demo Access"
echo "=========================================="
echo ""
echo "  Link (share to allowed devices):"
echo "    http://${PUBLIC_IP}:${FE_PORT}"
echo ""
echo "  Allowed client IPs:"
echo "    139.255.41.162"
echo "    ${PUBLIC_IP}"
echo ""
echo "  Router port forward (if behind NAT):"
echo "    WAN ${FE_PORT}  ->  ${LAN_IP}:${FE_PORT}"
echo ""
echo "  Login: /  (password)  |  Demo: /sabet"
echo "=========================================="
