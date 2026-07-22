# CAPEX — Security Audit Runbook (post-hardening)

Verifikasi steady state setelah migration `20260721190000` + `20260722100000`.
Arsitektur: browser → Next.js BFF → capexbe (JWT + AuthZ) → Postgres (`service_role`).

---

## 1. SQL verification (Supabase SQL Editor — production)

Jalankan **`scripts/audit_infosec_post_hardening.sql`** — semua baris harus **PASS**.

Ringkas manual (CAPEX tables only; abaikan `tor_*` — app lain):

```sql
-- Grant anon/authenticated SELECT pada tabel sensitif CAPEX (harus 0 baris)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type = 'SELECT'
  AND table_name IN (
    'users','projects','roles','notifications','audit_logs',
    'vendors','purchase_orders','tasks','assets','budget_periods'
  );

-- Policy qual=true untuk anon/authenticated pada tabel CAPEX (harus 0 baris)
SELECT tablename, policyname, roles, qual::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
  AND qual::text = 'true'
  AND roles && ARRAY['anon','authenticated']::name[];
```

Opsional: **`scripts/audit_rls_state.sql`** untuk inventori RLS.

---

## 2. curl — direct PostgREST harus gagal

```bash
# Anon read users → [] atau permission denied (BUKAN 200 dengan rows)
curl -s "$SUPABASE_URL/rest/v1/users?select=id,email&limit=3" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"

# BE tanpa JWT → 401
curl -s -o /dev/null -w "%{http_code}" "$CAPEXBE_URL/bootstrap" \
  -X POST -H "Content-Type: application/json" -d '{}'
```

---

## 3. Urutan deploy yang benar

```
1. Deploy FE (BFF) + capexbe bersamaan
2. Smoke: Network tab tidak ada *.supabase.co/rest/v1/
3. SQL hardening sudah applied di prod
4. Re-run audit_infosec_post_hardening.sql → PASS 1–8
```

---

## 4. Migration files (steady state)

| File | Fungsi |
|------|--------|
| `20260721140000_capex_security_foundation.sql` | Phase 1 |
| `20260721160000_capex_security_phase2_lock_authenticated.sql` | Phase 2 |
| `20260721190000_capex_security_restore_steady_state.sql` | Steady state (idempotent) |
| `20260722100000_capex_security_revoke_authenticated_rpc.sql` | Revoke context RPCs |
| `scripts/audit_infosec_post_hardening.sql` | PASS 1–8 verification |
| `scripts/audit_rls_state.sql` | RLS inventory |

---

## 5. Middleware stack — checklist

```
Browser
  → Edge middleware (session, rate limit, CSRF, allowlist)
  → BFF /api/be (POST-only, cookie auth)
  → capexbe (JwtAuthGuard + ThrottlerGuard + AuthZ)
  → Postgres (service_role)
```

### Verifikasi otomatis

```bash
# Dari repo root
make infosec-verify

# Atau per app
cd capex-apps && npm run verify:middleware && npm run build:secure
cd capexbe && npm run verify:query-safety && npm test -- --testPathPatterns=postgrest-filter
```

### Manual curl BFF (harus 401 / 403 / 404)

```bash
curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/be/bootstrap" -X POST
curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/internal/foo"
```

---

## 6. Prod env

**capex-web (runtime):**
```env
JWT_ACCESS_SECRET=<same as capexbe>
NEXT_PUBLIC_CAPEXBE_URL=https://...
NEXT_PUBLIC_USE_BACKEND_SESSION=true
```

**capexbe:**
```env
JWT_ACCESS_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
CORS_ORIGINS=...
```

`tor_*` tables: tidak diubah oleh migration CAPEX (app lain di project Supabase yang sama).
