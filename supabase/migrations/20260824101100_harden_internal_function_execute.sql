-- Least-privilege hardening for internal SECURITY DEFINER functions.
-- Public booking, public self-check-in, domain resolution, and authenticated
-- operational RPCs are intentionally not changed here.

-- These helpers may be absent in a clean local migration history. Harden each
-- one when present, without making the database bootstrap depend on optional
-- historical features.
DO $migration$
BEGIN
  IF to_regprocedure('public._platform_change_log_append_only()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public._platform_change_log_append_only() SET search_path = ''''';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public._platform_change_log_append_only() FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public._subscription_plan_change_audit()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public._subscription_plan_change_audit() FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regprocedure('public.run_financial_regression_tests()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.run_financial_regression_tests() FROM PUBLIC, anon, authenticated';
  END IF;
END
$migration$;

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
