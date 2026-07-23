# CAPEX monorepo — local dev shortcuts
# Usage: ./run setup && ./run   (Mac + Windows PowerShell 7+)
#        make setup && make run (Mac/Linux, requires make)

BE_DIR   := capexbe
FE_DIR   := capex-apps
BE_PORT  := 3001
FE_PORT  := 3000

.PHONY: help setup install env ensure-install run run-tunnel run-tunnel-demo run-public run-be run-fe stop check check-env logs infosec-verify public-url tunnel-help tunnel-cf

help:
	@echo "CAPEX dev commands:"
	@echo "  ./run           Start backend (:$(BE_PORT)) + frontend (:$(FE_PORT)) [Mac/Win]"
	@echo "  make setup      Copy env templates + npm install (first time)"
	@echo "  make install    npm install in backend + frontend"
	@echo "  make env        Copy .env.example → .env / .env.local (skip if exists)"
	@echo "  make check      Verify env files + Supabase connectivity"
	@echo "  make infosec-verify  Run InfoSec post-hardening smoke tests"
	@echo "  make run        Start backend (:$(BE_PORT)) + frontend (:$(FE_PORT))"
	@echo "  make run-tunnel     Dev mode for tunnel (HMR off, no WS errors)"
	@echo "  make run-tunnel-demo Production + cloudflared (best for sharing)"
	@echo "  make public-url Print access URLs for allowed devices"
	@echo "  make tunnel-help  Cursor port-forward setup (recommended)"
	@echo "  make tunnel-cf    Cloudflare quick tunnel (if Cursor tunnel fails)"
	@echo "  make run-be     Start backend only"
	@echo "  make run-fe     Start frontend only"
	@echo "  make stop       Kill processes on ports $(FE_PORT) and $(BE_PORT)"

setup: env install
	@echo "Setup done. Edit capexbe/.env and capex-apps/.env.local then: make check && make run"

env:
	@./scripts/setup-env.sh

install:
	@echo "==> Installing $(BE_DIR)..."
	@cd $(BE_DIR) && npm install
	@echo "==> Installing $(FE_DIR)..."
	@cd $(FE_DIR) && npm install
	@echo "Install complete."

ensure-install:
	@test -d $(BE_DIR)/node_modules || $(MAKE) install
	@test -d $(FE_DIR)/node_modules/.bin/next || $(MAKE) install

check: ensure-install check-env

check-env:
	@echo "==> Checking backend env..."
	@cd $(BE_DIR) && node -e "require('dotenv').config(); \
	  const u=process.env.SUPABASE_URL, a=process.env.SUPABASE_ANON_KEY, s=process.env.SUPABASE_SERVICE_ROLE_KEY; \
	  if(!u||!a||!s) { console.error('FAIL: missing SUPABASE_* in capexbe/.env'); process.exit(1); } \
	  console.log('OK  capexbe/.env —', u);"
	@echo "==> Checking frontend env..."
	@cd $(FE_DIR) && node -e " \
	  const fs=require('fs'); \
	  const parse=f=>{ if(!fs.existsSync(f)) return {}; return Object.fromEntries(fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()&&!l.startsWith('#')).map(l=>{ const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })); }; \
	  const m={...parse('.env'),...parse('.env.local')}; \
	  if(!m.NEXT_PUBLIC_CAPEXBE_URL) { console.error('FAIL: missing NEXT_PUBLIC_CAPEXBE_URL in capex-apps/.env or .env.local'); process.exit(1); } \
	  if(m.NEXT_PUBLIC_SUPABASE_URL||m.NEXT_PUBLIC_SUPABASE_ANON_KEY) { console.warn('WARN: NEXT_PUBLIC_SUPABASE_* no longer needed on FE — move to capexbe/.env only'); } \
	  console.log('OK  capex-apps env — BE', m.NEXT_PUBLIC_CAPEXBE_URL);"
	@echo "==> Testing Supabase (anon key)..."
	@cd $(BE_DIR) && node -e "require('dotenv').config(); \
	  fetch(process.env.SUPABASE_URL+'/auth/v1/health',{headers:{apikey:process.env.SUPABASE_ANON_KEY}}) \
	    .then(r=>console.log(r.status===200?'OK  Supabase Auth health':'WARN Supabase Auth', r.status)) \
	    .catch(e=>{ console.error('FAIL Supabase', e.message); process.exit(1); });"

run: stop ensure-install check-env
	@echo "Starting CAPEX — backend :$(BE_PORT), frontend :$(FE_PORT)"
	@echo "Press Ctrl+C to stop both."
	@trap 'echo; echo Stopping...; kill 0 2>/dev/null; exit 0' INT TERM; \
		(cd $(BE_DIR) && npm run start:dev) & \
		(cd $(FE_DIR) && npm run dev) & \
		wait

run-tunnel: stop ensure-install check-env
	@echo "Starting CAPEX for HTTPS tunnel (HMR disabled — no WebSocket errors)"
	@echo "Press Ctrl+C to stop both. Then: make tunnel-cf"
	@trap 'echo; echo Stopping...; kill 0 2>/dev/null; exit 0' INT TERM; \
		(cd $(BE_DIR) && npm run start:dev) & \
		(cd $(FE_DIR) && npm run dev:tunnel) & \
		wait

public-url:
	@chmod +x scripts/print-public-url.sh
	@./scripts/print-public-url.sh

run-public: stop ensure-install check-env public-url
	@echo ""
	@echo "Press Ctrl+C to stop both."
	@trap 'echo; echo Stopping...; kill 0 2>/dev/null; exit 0' INT TERM; \
		(cd $(BE_DIR) && npm run start:dev) & \
		(cd $(FE_DIR) && npm run dev) & \
		wait

run-be:
	@cd $(BE_DIR) && npm run start:dev

run-fe:
	@cd $(FE_DIR) && npm run dev

stop:
	@-lsof -ti:$(FE_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(BE_PORT) 2>/dev/null | xargs kill -9 2>/dev/null || true
	@echo "Stopped (if anything was running on :$(FE_PORT) / :$(BE_PORT))."

infosec-verify:
	@chmod +x scripts/infosec-verify.sh
	@./scripts/infosec-verify.sh

tunnel-help:
	@chmod +x scripts/cursor-tunnel-help.sh
	@./scripts/cursor-tunnel-help.sh

tunnel-cf:
	@chmod +x scripts/start-public-tunnel.sh
	@./scripts/start-public-tunnel.sh 3000

run-tunnel-demo:
	@chmod +x scripts/run-tunnel-demo.sh
	@./scripts/run-tunnel-demo.sh 3000
