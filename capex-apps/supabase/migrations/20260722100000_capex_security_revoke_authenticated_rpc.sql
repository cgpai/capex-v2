-- =============================================================================
-- CAPEX security — revoke authenticated EXECUTE on app context RPCs
-- PostgREST must not allow browser JWT to set/read app user context.
-- Apply after 20260721190000_capex_security_restore_steady_state.sql
-- =============================================================================

REVOKE ALL ON FUNCTION public.set_current_user_id(integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.app_current_user_id() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.set_current_user_id(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_id() TO service_role;
