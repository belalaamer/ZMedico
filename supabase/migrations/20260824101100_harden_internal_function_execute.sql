-- Least-privilege hardening for internal SECURITY DEFINER functions.
-- Public booking, public self-check-in, domain resolution, and authenticated
-- operational RPCs are intentionally not changed here.

-- This trigger function has no schema-dependent references; an empty search_path
-- removes search_path hijacking risk while preserving its append-only guard.
ALTER FUNCTION public._platform_change_log_append_only()
  SET search_path = '';
REVOKE EXECUTE ON FUNCTION public._platform_change_log_append_only()
  FROM PUBLIC, anon, authenticated;

-- The plan-audit trigger is internal and is invoked by its trigger only.
REVOKE EXECUTE ON FUNCTION public._subscription_plan_change_audit()
  FROM PUBLIC, anon, authenticated;

-- Regression tests are an internal maintenance helper, not an end-user RPC.
REVOKE EXECUTE ON FUNCTION public.run_financial_regression_tests()
  FROM PUBLIC, anon, authenticated;

-- Trigger-only SECURITY DEFINER functions do not need direct PostgREST EXECUTE
-- grants. Keep postgres/service_role ownership privileges intact.
DO $migration$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS arguments
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND (p.proname LIKE 'tg_%' OR p.proname LIKE 'trg_%')
       AND EXISTS (
         SELECT 1
           FROM pg_trigger t
          WHERE t.tgfoid = p.oid
            AND NOT t.tgisinternal
       )
     LIMIT 200
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.schema_name,
      r.function_name,
      r.arguments
    );
  END LOOP;
END
$migration$;
