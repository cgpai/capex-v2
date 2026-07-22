-- CAPEX security audit (read-only). Run in Supabase SQL Editor on the CAPEX project.
-- No schema changes. Safe to run anytime.

-- 1) RLS enabled on tables exposed in InfoSec report
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'projects', 'roles', 'role_permissions',
    'notifications', 'audit_logs', 'vendors', 'purchase_orders', 'tasks',
    'user_assignments', 'user_assignment_scopes',
    'assets', 'budget_multi_years', 'budget_periods'
  )
ORDER BY tablename;

-- 2) Active policies (look for qual = true on anon/public)
SELECT tablename, policyname, roles, cmd, permissive, qual::text AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3) Policies that allow anyone (red flag)
SELECT tablename, policyname, roles, cmd, qual::text
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual::text = 'true' OR qual IS NULL)
  AND roles && ARRAY['anon', 'public']::name[]
ORDER BY tablename;

-- 4) set_current_user_id definition + grants
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('set_current_user_id', 'user_has_permission_for_hierarchy', 'get_current_user_id');

-- 5) Tables in public schema WITHOUT RLS (potential leak if anon key is exposed)
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND NOT rowsecurity
ORDER BY tablename;

-- 6) Table grants to anon (Supabase PostgREST uses these roles)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
  AND table_name IN (
    'users', 'projects', 'roles', 'notifications', 'audit_logs',
    'vendors', 'purchase_orders', 'tasks'
  )
ORDER BY table_name, grantee, privilege_type;

-- =============================================================================
-- Phase 2 verification (after 20260721160000_capex_security_phase2_lock_authenticated.sql)
-- =============================================================================

-- 7) Wide-open authenticated policies (should return 0 rows)
SELECT tablename, policyname, roles, qual::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
  AND (
    policyname = 'authenticated_full_access'
    OR policyname ILIKE '%authenticated%full%access%'
  );

-- 8) sec_deny_authenticated_direct coverage
SELECT COUNT(*) AS deny_authenticated_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname = 'sec_deny_authenticated_direct';

-- 9) Policies with qual=true still granted to anon/authenticated (red flag)
SELECT tablename, policyname, roles, cmd, qual::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
  AND qual::text = 'true'
  AND roles && ARRAY['anon', 'authenticated']::name[]
ORDER BY tablename;

-- 10) Compare CAPEX table count vs deny policy counts
SELECT
  (SELECT COUNT(*) FROM pg_tables
   WHERE schemaname = 'public' AND tablename NOT LIKE 'tor\_%' ESCAPE '\') AS capex_tables,
  (SELECT COUNT(*) FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'sec_deny_anon_all') AS anon_deny_policies,
  (SELECT COUNT(*) FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'sec_deny_authenticated_direct') AS auth_deny_policies;
