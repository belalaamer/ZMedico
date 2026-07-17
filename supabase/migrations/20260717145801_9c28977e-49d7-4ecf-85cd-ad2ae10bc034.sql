-- 1) Notification settings: restrict read policy to admins only (not settings.export)
DROP POLICY IF EXISTS ns_select_admin ON public.notification_settings;
CREATE POLICY ns_select_admin ON public.notification_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) Convert remaining SECURITY DEFINER views to security_invoker
ALTER VIEW public.v_authz_shadow_matrix_medical_records SET (security_invoker = true);
ALTER VIEW public.v_authz_shadow_matrix_settings        SET (security_invoker = true);
ALTER VIEW public.v_authz_shadow_matrix_hr              SET (security_invoker = true);
ALTER VIEW public.v_authz_shadow_matrix_patients        SET (security_invoker = true);
ALTER VIEW public.v_authz_shadow_matrix_invoices        SET (security_invoker = true);
ALTER VIEW public.v_authz_shadow_exit_criteria          SET (security_invoker = true);

-- 4) Defense-in-depth: revoke public/anon EXECUTE on all public SECURITY DEFINER functions,
--    grant EXECUTE to authenticated only. (Current ACLs already exclude public/anon;
--    this locks the default in case a future migration widens grants.)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',   r.proname, r.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
  END LOOP;
END $$;