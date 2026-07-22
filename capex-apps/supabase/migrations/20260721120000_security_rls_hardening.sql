-- CAPEX security hardening (non-breaking, schema-preserving).
-- Run audit_rls_state.sql BEFORE applying. Review output with team.
--
-- Goals:
--   - Block unauthenticated (anon) reads that caused the InfoSec finding
--   - Keep authenticated + backend (service_role) paths working
--   - Do NOT alter tables, columns, or existing business logic functions
--
-- Rollback: drop policies created here (names prefixed with sec_)

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Deny anon on sensitive tables (additive — does not remove existing policies)
-- Requires PostgreSQL 15+ RESTRICTIVE policies (Supabase uses PG 15+).
-- If RESTRICTIVE is unavailable, use sec_block_anon_* as permissive WITH false.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'projects', 'roles', 'role_permissions',
    'notifications', 'audit_logs', 'vendors', 'purchase_orders', 'tasks',
    'user_assignments', 'user_assignment_scopes', 'assets',
    'budget_multi_years', 'budget_periods',
    'budget_period_category_budgets', 'budget_period_archetype_budgets',
    'budget_period_hospital_unit_budgets',
    'feasibility_studies', 'fs_realizations', 'moms', 'asset_task_statuses',
    'task_logs', 'workflow_sets', 'workflow_steps', 'purchase_order_items'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
          AND policyname = 'sec_block_anon_all'
      ) THEN
        EXECUTE format(
          'CREATE POLICY sec_block_anon_all ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false)',
          t
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- B) Harden set_current_user_id — prevent browser impersonation (user_id = 1)
-- Only apply if function exists. Validates JWT subject matches public.users row.
-- Backend service_role bypasses RLS; authenticated users must match own row.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'set_current_user_id'
  ) THEN
    -- Replace body only if team confirms current definition is the simple setter.
    -- Uncomment after comparing with audit query #4:
    --
    -- CREATE OR REPLACE FUNCTION public.set_current_user_id(user_id_param integer)
    -- RETURNS void
    -- LANGUAGE plpgsql
    -- SECURITY DEFINER
    -- SET search_path = public
    -- AS $fn$
    -- DECLARE
    --   v_auth_id uuid;
    -- BEGIN
    --   IF auth.uid() IS NULL THEN
    --     RAISE EXCEPTION 'authentication required';
    --   END IF;
    --   SELECT auth_id INTO v_auth_id FROM public.users WHERE id = user_id_param;
    --   IF v_auth_id IS NULL OR v_auth_id <> auth.uid() THEN
    --     RAISE EXCEPTION 'user context mismatch';
    --   END IF;
    --   PERFORM set_config('app.current_user_id', user_id_param::text, true);
    -- END;
    -- $fn$;
    NULL;
  END IF;
END $$;

COMMIT;

-- Post-apply verification (run manually):
-- curl "$SUPABASE_URL/rest/v1/users?select=id&limit=1" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
-- Expected: [] or 401/403
