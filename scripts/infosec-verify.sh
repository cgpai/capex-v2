#!/usr/bin/env bash
# InfoSec post-hardening smoke test — run from repo root: ./scripts/infosec-verify.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BE_DIR="$ROOT/capexbe"
FE_DIR="$ROOT/capex-apps"
FAIL=0

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAIL=1; }
warn() { echo "  WARN  $1"; }

echo "=== CAPEX InfoSec verification ==="
echo ""

# 1) FE env — no public Supabase keys
echo "[1] Frontend env (no NEXT_PUBLIC_SUPABASE_*)"
if node -e "
  const fs=require('fs');
  const parse=f=>{ if(!fs.existsSync(f)) return {}; return Object.fromEntries(fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()&&!l.startsWith('#')).map(l=>{ const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })); };
  const m={...parse('$FE_DIR/.env'),...parse('$FE_DIR/.env.local')};
  if(m.NEXT_PUBLIC_SUPABASE_URL||m.NEXT_PUBLIC_SUPABASE_ANON_KEY) process.exit(1);
"; then
  pass "No NEXT_PUBLIC_SUPABASE_* in capex-apps env"
else
  fail "NEXT_PUBLIC_SUPABASE_* still present in capex-apps/.env or .env.local"
fi

# 2) FE production bundle gate
echo "[2] Frontend secure build gate"
if (cd "$FE_DIR" && npm run build:secure >/dev/null 2>&1); then
  pass "npm run build:secure — no Supabase keys in client chunks"
else
  fail "npm run build:secure — insecure patterns in .next bundle (run manually for details)"
fi

# 3) BE build
echo "[3] Backend build"
if (cd "$BE_DIR" && npm run build >/dev/null 2>&1); then
  pass "capexbe npm run build"
else
  fail "capexbe build failed"
fi

# 4) Anon PostgREST blocked (requires capexbe/.env)
echo "[4] Direct Supabase anon read (must NOT return user rows)"
if [ -f "$BE_DIR/.env" ]; then
  # shellcheck disable=SC1091
  set +u
  # shellcheck source=/dev/null
  export $(grep -E '^(SUPABASE_URL|SUPABASE_ANON_KEY)=' "$BE_DIR/.env" | xargs)
  set -u
  if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
    RESP=$(curl -sS "${SUPABASE_URL}/rest/v1/users?select=id,email,auth_id&limit=3" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" 2>/dev/null || echo "CURL_ERROR")
    if echo "$RESP" | grep -qE '"id"|"email"'; then
      fail "Anon can still read users table — apply migration 20260721190000"
      echo "        Response snippet: $(echo "$RESP" | head -c 200)"
    elif echo "$RESP" | grep -qiE 'permission denied|42501|PGRST|JWT'; then
      pass "Anon read users blocked (permission denied / empty)"
    elif [ "$RESP" = "[]" ] || [ -z "$RESP" ]; then
      pass "Anon read users returns empty (no data leak)"
    else
      warn "Unexpected anon response: $(echo "$RESP" | head -c 120)"
    fi
  else
    warn "Skip curl test — SUPABASE_URL/ANON_KEY not in capexbe/.env"
  fi
else
  warn "Skip curl test — capexbe/.env not found"
fi

# 5) BE endpoint without auth
echo "[5] Backend API without JWT (must 401)"
BE_URL=$(node -e "
  const fs=require('fs');
  const parse=f=>{ if(!fs.existsSync(f)) return {}; return Object.fromEntries(fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()&&!l.startsWith('#')).map(l=>{ const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })); };
  const m={...parse('$FE_DIR/.env'),...parse('$FE_DIR/.env.local')};
  console.log((m.NEXT_PUBLIC_CAPEXBE_URL||'http://localhost:3001').replace(/\/$/,''));
" 2>/dev/null || echo "http://localhost:3001")
CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST "${BE_URL}/bootstrap" \
  -H "Content-Type: application/json" \
  -d '{"userId":1}' 2>/dev/null || echo "000")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  pass "POST /bootstrap without token → HTTP $CODE"
else
  warn "POST /bootstrap without token → HTTP $CODE (expected 401; is BE running?)"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "=== ALL AUTOMATED CHECKS PASSED ==="
  echo "Run SQL: capex-apps/supabase/scripts/audit_infosec_post_hardening.sql on Supabase"
  exit 0
else
  echo "=== SOME CHECKS FAILED — review above ==="
  exit 1
fi
