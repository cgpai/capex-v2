-- =============================================================================
-- CAPEX Security — Restore steady state (post-audit cleanup)
--
-- Idempotent steady-state hardening (safe to re-run).
-- Idempotent: safe to run even if Phase 1+2 were partially applied.
--
-- EFFECT:
--   - Removes audit/rollback vulnerable policies (audit_anon_read_all, authenticated_full_access)
--   - Phase 1: harden RPCs, deny anon, revoke anon grants
--   - Phase 2: deny authenticated direct PostgREST, revoke authenticated grants
--   - capexbe (service_role) continues to work
--
-- Does NOT touch tor_* tables.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Remove audit window + legacy wide-open policies
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  t text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
      AND policyname IN (
        'audit_anon_read_all',
        'authenticated_full_access',
        'sec_block_anon_all'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  END LOOP;

  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'tor\_%' ESCAPE '\'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS audit_anon_read_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON public.%I', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Phase 1 — helpers + RPC hardening
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_current_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::integer;
$$;

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
      'REVOKE ALL ON FUNCTION public.user_has_permission_for_hierarchy(%s) FROM anon',
      sig
    );
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.user_has_permission_for_hierarchy(%s) FROM authenticated',
      sig
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.user_has_permission_for_hierarchy(%s) TO service_role',
      sig
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Phase 1 — deny anon on CAPEX tables
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

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Phase 2 — deny authenticated direct PostgREST
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.app_current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO service_role;

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
-- 4) Sequences + default privileges
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

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;

COMMIT;

-- VERIFY (scripts/audit_rls_state.sql Phase 2 section):
--   - 0 rows: authenticated_full_access, audit_anon_read_all
--   - sec_deny_anon_all + sec_deny_authenticated_direct = CAPEX table count
--   - curl anon → [] or 403; capexbe app still works via service_role
