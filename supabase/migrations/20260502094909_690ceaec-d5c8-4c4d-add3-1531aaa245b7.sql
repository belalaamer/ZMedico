
-- 1. invoice_items: remove conflicting permissive policies
DROP POLICY IF EXISTS items_insert_auth ON public.invoice_items;
DROP POLICY IF EXISTS items_update_auth ON public.invoice_items;
DROP POLICY IF EXISTS items_delete_auth ON public.invoice_items;

-- 2. clinic_settings: restrict SELECT to public rows or admin
DROP POLICY IF EXISTS cs_select ON public.clinic_settings;
CREATE POLICY cs_select ON public.clinic_settings
  FOR SELECT TO authenticated
  USING (is_public = true OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3. user_roles: restrict SELECT to own row or admin
DROP POLICY IF EXISTS roles_select_auth ON public.user_roles;
CREATE POLICY roles_select_auth ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 4. storage: remove public listing on product-images bucket
DROP POLICY IF EXISTS product_images_auth_list ON storage.objects;

-- 5. SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated/PUBLIC dynamically
DO $$
DECLARE
  r record;
  keep_names text[] := ARRAY['has_role', 'apply_inventory_tx'];
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND NOT (p.proname = ANY(keep_names))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END$$;
