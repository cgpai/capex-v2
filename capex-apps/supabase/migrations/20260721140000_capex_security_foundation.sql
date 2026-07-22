-- =============================================================================
-- CAPEX Security Foundation — Phase 1 (schema-preserving, CAPEX tables only)
-- Run in Supabase SQL Editor on project: abbgvfuanefrnxtttllo
--
-- SAFE TO RUN NOW:
--   - Does NOT drop tables/columns
--   - Does NOT touch tor_* tables (other app in same project)
--   - Does NOT remove authenticated_full_access (app still works)

-- FIXES:
--   1. set_current_user_id — stop impersonation (was: anyone sets user_id=1)
--   2. sec_deny_anon — RESTRICTIVE deny for role anon (defense in depth)
--   3. Revoke anon grants on CAPEX tables
--   4. Lock sensitive RPCs to service_role + authenticated only
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::integer;
$$;

COMMENT ON FUNCTION public.app_current_user_id() IS
  'Returns app user id set by set_current_user_id() for current transaction.';

-- ---------------------------------------------------------------------------
-- B) Harden set_current_user_id (CRITICAL — was fully open)
-- Old: any caller could set any user_id, errors silently swallowed
-- New: service_role (BFF) OR authenticated JWT must match public.users.auth_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_current_user_id(user_id_param integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF user_id_param IS NULL OR user_id_param <= 0 THEN
    RAISE EXCEPTION 'invalid user_id_param';
  END IF;

  -- Backend BFF (service_role) sets context after AuthZ check
  IF auth.role() = 'service_role' THEN
    PERFORM set_config('app.current_user_id', user_id_param::text, true);
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = user_id_param
      AND u.auth_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'user context mismatch';
  END IF;

  PERFORM set_config('app.current_user_id', user_id_param::text, true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_current_user_id(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_current_user_id(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_user_id(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- C) Deny anon on all CAPEX tables (RESTRICTIVE — additive, keeps existing policies)
-- Skips tor_* tables (other app)
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
        AND policyname = 'sec_deny_anon_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY sec_deny_anon_all ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false)',
        t
      );
    END IF;

    -- Remove any direct table grants to anon (API Disabled should already block, belt+suspenders)
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- D) Lock permission-check RPC — backend only (service_role)
-- Frontend must not call user_has_permission_for_hierarchy directly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'user_has_permission_for_hierarchy'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.user_has_permission_for_hierarchy(%s) FROM PUBLIC',
      sig
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.user_has_permission_for_hierarchy(%s) TO service_role',
      sig
    );
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY (run separately after commit)
-- ---------------------------------------------------------------------------
-- 1) set_current_user_id grants (should NOT include PUBLIC)
-- SELECT grantee FROM information_schema.routine_privileges
-- WHERE routine_name = 'set_current_user_id' ORDER BY grantee;
--
-- 2) sec_deny_anon_all count (should = 48 CAPEX tables)
-- SELECT COUNT(*) FROM pg_policies WHERE policyname = 'sec_deny_anon_all';
--
-- 3) anon table grants on users (should be empty)
-- SELECT * FROM information_schema.role_table_grants
-- WHERE grantee = 'anon' AND table_name = 'users';
