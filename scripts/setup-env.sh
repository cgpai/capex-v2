#!/usr/bin/env bash
# Bootstrap local env files for CAPEX (frontend + backend).
# Usage: ./scripts/setup-env.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS="$ROOT/capex-apps"
BE="$ROOT/capexbe"

copy_if_missing() {
  local src="$1"
  local dest="$2"
  if [[ -f "$dest" ]]; then
    echo "  skip (exists): $dest"
  else
    cp "$src" "$dest"
    echo "  created: $dest"
  fi
}

echo "== CAPEX env setup =="
echo

if [[ ! -d "$APPS" || ! -d "$BE" ]]; then
  echo "Error: run from repo root (expected capex-apps/ and capexbe/)"
  exit 1
fi

echo "[1/2] Frontend → capex-apps/.env.local"
copy_if_missing "$APPS/.env.example" "$APPS/.env.local"

echo
echo "[2/2] Backend → capexbe/.env"
copy_if_missing "$BE/.env.example" "$BE/.env"

echo
echo "Done. Next steps:"
echo "  1. Edit capex-apps/.env.local — set NEXT_PUBLIC_CAPEXBE_URL"
echo "  2. Edit capexbe/.env — set SUPABASE_* + JWT_ACCESS_SECRET + SUPABASE_JWT_SECRET + FRONTEND_URL"
echo "  3. Terminal 1: cd capexbe && npm install && npm run start:dev"
echo "  4. Terminal 2: cd capex-apps && npm install && npm run dev"
echo
echo "Get Supabase values: Dashboard → Project Settings → API"
echo "  - Project URL        → SUPABASE_URL (capexbe only)"
echo "  - anon public        → SUPABASE_ANON_KEY (capexbe only)"
echo "  - service_role       → SUPABASE_SERVICE_ROLE_KEY (backend ONLY)"
echo "  - JWT Secret         → SUPABASE_JWT_SECRET"
echo "  - Redirect URL       → {FRONTEND_URL}/api/auth/azure/callback (Supabase Auth settings)"
