
-- 1. notification_settings: admin-only SELECT
DROP POLICY IF EXISTS ns_select ON public.notification_settings;
CREATE POLICY ns_select_admin ON public.notification_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. saas_invoice_counters: enable RLS, admin-only access
ALTER TABLE public.saas_invoice_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS counter_admin_only ON public.saas_invoice_counters;
CREATE POLICY counter_admin_only ON public.saas_invoice_counters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. patient-docs storage: ownership check via patient_documents table
DROP POLICY IF EXISTS patient_docs_auth_read ON storage.objects;
DROP POLICY IF EXISTS patient_docs_auth_insert ON storage.objects;
DROP POLICY IF EXISTS patient_docs_auth_update ON storage.objects;
DROP POLICY IF EXISTS patient_docs_auth_delete ON storage.objects;

CREATE POLICY patient_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.patient_documents pd
        WHERE pd.file_url LIKE '%' || storage.objects.name || '%'
      )
    )
  );

CREATE POLICY patient_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-docs');

CREATE POLICY patient_docs_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.patient_documents pd
        WHERE pd.file_url LIKE '%' || storage.objects.name || '%'
          AND pd.uploaded_by = auth.uid()
      )
    )
  );

CREATE POLICY patient_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.patient_documents pd
        WHERE pd.file_url LIKE '%' || storage.objects.name || '%'
          AND pd.uploaded_by = auth.uid()
      )
    )
  );

-- 4. product-images: limit listing/reading to authenticated users
DROP POLICY IF EXISTS product_images_public_read ON storage.objects;
CREATE POLICY product_images_auth_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-images');

-- 5. Revoke EXECUTE from public/anon/authenticated on internal helpers
-- These are called by triggers (run as table owner) or by other SECURITY DEFINER fns,
-- so callers don't need direct EXECUTE.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'add_treasury_tx',
    'apply_inventory_tx',
    'check_expiry_alerts',
    'default_treasury_for_branch',
    'generate_employee_id',
    'generate_invoice_number',
    'generate_po_number',
    'generate_product_sku',
    'generate_saas_invoice_number',
    'handle_new_user',
    'is_tenant_owner',
    'recalc_invoice_payments',
    'recalc_invoice_subtotal',
    'recalc_po_subtotal',
    'receive_po_item'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END$$;
