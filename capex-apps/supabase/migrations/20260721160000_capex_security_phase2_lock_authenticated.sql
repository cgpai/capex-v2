-- =============================================================================
-- CAPEX Security — Phase 2 (schema-preserving, CAPEX tables only)
-- Run AFTER Phase 1 (20260721140000) and AFTER FE is BE-only (no browser Supabase).
--
-- PREREQUISITES:
--   - capexbe uses SUPABASE_SERVICE_ROLE_KEY for data access (default when no user JWT)
--   - Browser never calls PostgREST with anon/authenticated keys for data
--
-- GOALS:
--   1. Remove wide-open authenticated RLS policies (authenticated_full_access)
--   2. Block direct PostgREST reads/writes as role `authenticated` (stolen user JWT)
--   3. Revoke table grants from `authenticated` on CAPEX public tables
--   4. Keep service_role path for capexbe BFF (RLS bypass — AuthZ enforced in app)
--
-- SAFE:
--   - Does NOT drop tables/columns
--   - Does NOT touch tor_* tables
--   - Does NOT change business functions (except grants on helpers)
--
-- ROLLBACK: drop policies sec_deny_authenticated_direct; re-grant authenticated if needed
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Helper grants — not callable by anon/public
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.app_current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO service_role;

-- ---------------------------------------------------------------------------
-- B) Drop permissive "full access" policies on CAPEX tables (InfoSec finding)
--    Only drops policies whose USING/WITH CHECK is literally true for authenticated.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
      AND (
        policyname = 'authenticated_full_access'
        OR policyname ILIKE '%authenticated%full%access%'
        OR policyname ILIKE '%enable%access%for%authenticated%'
      )
      AND roles && ARRAY['authenticated']::name[]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
    RAISE NOTICE 'Dropped policy % on %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- Extra safety: drop exact name even if role array differs (legacy Supabase UI policies)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON public.%I', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- C) Deny authenticated direct table access (RESTRICTIVE — additive)
--    service_role bypasses RLS (capexbe BFF). authenticated JWT cannot read DB via API.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
    ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'sec_deny_authenticated_direct'
    ) THEN
      EXECUTE format(
        'CREATE POLICY sec_deny_authenticated_direct ON public.%I '
        'AS RESTRICTIVE FOR ALL TO authenticated USING (false)',
        t
      );
    END IF;

    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- D) Re-assert anon lock from Phase 1 (idempotent)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'sec_deny_anon_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY sec_deny_anon_all ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false)',
        t
      );
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- E) Sequences: authenticated/anon should not insert via serial exposure
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  s text;
BEGIN
  FOR s IN
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', s);
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM authenticated', s);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', s);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- F) Default privileges — new CAPEX tables should not auto-grant to anon/authenticated
--    (Supabase migrations / manual DDL run as postgres owner)
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (run separately — see scripts/audit_rls_state.sql section Phase 2)
-- ---------------------------------------------------------------------------
-- 1) No authenticated_full_access left:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname = 'public' AND policyname ILIKE '%full%access%';
--
-- 2) sec_deny_authenticated_direct count (= CAPEX table count):
-- SELECT COUNT(*) FROM pg_policies WHERE policyname = 'sec_deny_authenticated_direct';
--
-- 3) authenticated grants on users (should be empty):
-- SELECT * FROM information_schema.role_table_grants
-- WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'users';
--
-- 4) Smoke — anon must fail:
-- curl "$SUPABASE_URL/rest/v1/users?select=id&limit=1" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--
-- 5) Smoke — authenticated user JWT must fail direct REST (even after login):
-- curl "$SUPABASE_URL/rest/v1/projects?select=id&limit=1" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_ACCESS_JWT"
