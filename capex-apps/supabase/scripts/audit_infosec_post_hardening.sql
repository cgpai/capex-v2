-- =============================================================================
-- CAPEX InfoSec — POST-HARDENING verification (expected: ALL PASS)
-- Run after migration 20260721190000_capex_security_restore_steady_state.sql
-- Attach output to response email for Yuan / InfoSec team.
-- =============================================================================

-- PASS 1 — No anon SELECT on sensitive tables
SELECT 'PASS 1 anon grants' AS check_id,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(table_name || '(' || grantee || ')', ', '), 'none') AS detail
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND privilege_type = 'SELECT'
  AND table_name IN (
    'users', 'projects', 'roles', 'notifications', 'audit_logs',
    'vendors', 'purchase_orders', 'tasks', 'assets', 'budget_periods'
  );

-- PASS 2 — No authenticated SELECT (browser JWT cannot read DB via PostgREST)
SELECT 'PASS 2 authenticated grants' AS check_id,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(table_name, ', '), 'none') AS tables_with_grant
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND privilege_type = 'SELECT'
  AND table_name IN (
    'users', 'projects', 'roles', 'notifications', 'audit_logs',
    'vendors', 'purchase_orders', 'tasks', 'assets'
  );

-- PASS 3 — sec_deny_anon_all on all CAPEX tables
SELECT 'PASS 3 sec_deny_anon_all' AS check_id,
       CASE WHEN missing = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       missing AS tables_missing_policy
FROM (
  SELECT COUNT(*) AS missing
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'tor\_%' ESCAPE '\'
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = t.tablename
        AND p.policyname = 'sec_deny_anon_all'
    )
) x;

-- PASS 4 — sec_deny_authenticated_direct on all CAPEX tables
SELECT 'PASS 4 sec_deny_authenticated_direct' AS check_id,
       CASE WHEN missing = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       missing AS tables_missing_policy
FROM (
  SELECT COUNT(*) AS missing
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'tor\_%' ESCAPE '\'
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = t.tablename
        AND p.policyname = 'sec_deny_authenticated_direct'
    )
) x;

-- PASS 5 — No legacy wide-open policies
SELECT 'PASS 5 legacy policies removed' AS check_id,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(tablename || ':' || policyname, ', '), 'none') AS remaining
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('audit_anon_read_all', 'authenticated_full_access');

-- PASS 6 — set_current_user_id NOT callable by anon
SELECT 'PASS 6 set_current_user_id anon revoked' AS check_id,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(grantee, ', '), 'none') AS anon_or_public_grants
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'set_current_user_id'
  AND grantee IN ('anon', 'PUBLIC');

-- PASS 7 — RLS enabled on sensitive tables
SELECT 'PASS 7 RLS enabled' AS check_id,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(tablename, ', '), 'none') AS rls_disabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'projects', 'roles', 'notifications', 'audit_logs',
    'vendors', 'purchase_orders', 'tasks', 'assets'
  )
  AND NOT rowsecurity;

-- PASS 8 — context RPCs NOT callable by authenticated (browser JWT)
SELECT 'PASS 8 authenticated RPC revoked' AS check_id,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(routine_name || '(' || grantee || ')', ', '), 'none') AS detail
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('set_current_user_id', 'app_current_user_id')
  AND grantee = 'authenticated';

-- =============================================================================
-- MANUAL CURL (attach to audit — all should FAIL to return data)
-- =============================================================================
-- A) Anon read users → expect [] or 401/403 (NOT 200 with rows):
-- curl -s "$SUPABASE_URL/rest/v1/users?select=id,email,auth_id&limit=3" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--
-- B) Authenticated JWT read projects → expect permission denied:
-- curl -s "$SUPABASE_URL/rest/v1/projects?select=id&limit=1" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
--
-- C) Public capex web bundle — no Supabase keys (run in capex-apps):
-- npm run build:secure
--
-- D) BE without JWT → expect 401:
-- curl -s -o /dev/null -w "%{http_code}" "$CAPEXBE_URL/budget-hu/config-bundle" \
--   -X POST -H "Content-Type: application/json" -d '{"userId":1}'
-- =============================================================================
