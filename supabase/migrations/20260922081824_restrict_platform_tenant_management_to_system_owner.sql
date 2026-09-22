-- Platform lifecycle mutations are platform-owner operations.
-- Tenant admins must not be able to create arbitrary tenants or modify any
-- tenant's subscription by calling SECURITY DEFINER RPCs directly.

DO $migration$
DECLARE
  v_ddl text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.platform_create_tenant_onboarding(jsonb)'::regprocedure)
    INTO v_ddl;

  v_old := $old$
  IF NOT (public.has_role((select auth.uid()), 'system_owner'::public.app_role) OR public.has_role((select auth.uid()), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'platform onboarding requires administrator access' USING ERRCODE = '42501';
  END IF;
$old$;

  v_new := $new$
  IF NOT public.has_role((select auth.uid()), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'platform onboarding requires System Owner access' USING ERRCODE = '42501';
  END IF;
$new$;

  IF position(v_old in v_ddl) = 0 THEN
    RAISE EXCEPTION 'platform_create_tenant_onboarding authorization block not found';
  END IF;

  EXECUTE replace(v_ddl, v_old, v_new);

  SELECT pg_get_functiondef('public.platform_update_tenant_subscription(jsonb)'::regprocedure)
    INTO v_ddl;

  v_old := $old$
  IF NOT (
    public.has_role((select auth.uid()), 'system_owner'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'platform subscription management requires administrator access'
      USING ERRCODE = '42501';
  END IF;
$old$;

  v_new := $new$
  IF NOT public.has_role((select auth.uid()), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'platform subscription management requires System Owner access'
      USING ERRCODE = '42501';
  END IF;
$new$;

  IF position(v_old in v_ddl) = 0 THEN
    RAISE EXCEPTION 'platform_update_tenant_subscription authorization block not found';
  END IF;

  EXECUTE replace(v_ddl, v_old, v_new);
END;
$migration$;
