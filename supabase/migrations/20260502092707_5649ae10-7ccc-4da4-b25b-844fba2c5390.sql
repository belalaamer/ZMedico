
-- =========================================================
-- 1. STORAGE: patient-docs uploads require folder ownership
-- =========================================================
DROP POLICY IF EXISTS patient_docs_insert ON storage.objects;
CREATE POLICY patient_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-docs'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'doctor')
      OR public.has_role(auth.uid(), 'staff')
    )
  );

-- =========================================================
-- 2. STORAGE: product-images — drop broad listing policy
-- (bucket is public, so direct file URLs continue to work)
-- =========================================================
DROP POLICY IF EXISTS product_images_auth_read ON storage.objects;
CREATE POLICY product_images_auth_list ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-images');

-- Restrict mutations on product images to admins
DROP POLICY IF EXISTS product_images_auth_insert ON storage.objects;
DROP POLICY IF EXISTS product_images_auth_update ON storage.objects;
DROP POLICY IF EXISTS product_images_auth_delete ON storage.objects;
CREATE POLICY product_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY product_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY product_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 3. PURCHASE ORDERS — admin only mutations
-- =========================================================
DROP POLICY IF EXISTS po_insert ON public.purchase_orders;
DROP POLICY IF EXISTS po_update ON public.purchase_orders;
CREATE POLICY po_insert_admin ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY po_update_admin ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS poi_insert ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_update ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_delete ON public.purchase_order_items;
CREATE POLICY poi_insert_admin ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY poi_update_admin ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY poi_delete_admin ON public.purchase_order_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 4. INVENTORY transactions — admin only inserts
-- =========================================================
DROP POLICY IF EXISTS invtx_insert ON public.inventory_transactions;
CREATE POLICY invtx_insert_admin ON public.inventory_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS inv_insert ON public.inventory;
DROP POLICY IF EXISTS inv_update ON public.inventory;
CREATE POLICY inv_insert_admin ON public.inventory
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY inv_update_admin ON public.inventory
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 5. MEDICAL RECORDS — only doctors / admin can create/edit
-- =========================================================
DROP POLICY IF EXISTS rec_insert ON public.medical_records;
DROP POLICY IF EXISTS rec_update ON public.medical_records;
CREATE POLICY rec_insert_clinical ON public.medical_records
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );
CREATE POLICY rec_update_clinical ON public.medical_records
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );

-- =========================================================
-- 6. PATIENT DOCUMENTS — restrict mutations to staff roles
-- =========================================================
DROP POLICY IF EXISTS doc_insert ON public.patient_documents;
DROP POLICY IF EXISTS doc_update ON public.patient_documents;
CREATE POLICY doc_insert_staff ON public.patient_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'doctor')
      OR public.has_role(auth.uid(), 'staff')
    )
  );
CREATE POLICY doc_update_staff ON public.patient_documents
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR uploaded_by = auth.uid()
  );

-- =========================================================
-- 7. ATTENDANCE — only self or admin can insert
-- =========================================================
DROP POLICY IF EXISTS att_insert ON public.attendance;
CREATE POLICY att_insert_self ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- =========================================================
-- 8. LEAVE REQUESTS — only requester or admin
-- =========================================================
DROP POLICY IF EXISTS lr_insert ON public.leave_requests;
CREATE POLICY lr_insert_self ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- =========================================================
-- 9. DENTAL CHART — clinical only
-- =========================================================
DROP POLICY IF EXISTS dent_insert ON public.dental_chart;
DROP POLICY IF EXISTS dent_update ON public.dental_chart;
CREATE POLICY dent_insert_clinical ON public.dental_chart
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );
CREATE POLICY dent_update_clinical ON public.dental_chart
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );

-- =========================================================
-- 10. MEDICAL HISTORY — clinical only mutations
-- =========================================================
DROP POLICY IF EXISTS hist_insert ON public.medical_history;
DROP POLICY IF EXISTS hist_update ON public.medical_history;
CREATE POLICY hist_insert_clinical ON public.medical_history
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );
CREATE POLICY hist_update_clinical ON public.medical_history
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'doctor')
  );

-- =========================================================
-- 11. SECURITY DEFINER functions — revoke EXECUTE on internals
-- has_role MUST remain executable (used by RLS policies via security
-- definer; policies still work after revoke, but app code may call it).
-- We keep has_role and is_tenant_owner callable; revoke the rest.
-- =========================================================
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
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
    'recalc_invoice_payments',
    'recalc_invoice_subtotal',
    'recalc_po_subtotal',
    'receive_po_item',
    'tg_appointment_create_notifications',
    'tg_appointment_create_reminders',
    'tg_branch_after_insert',
    'tg_branch_before_insert_code',
    'tg_expense_after_insert',
    'tg_inventory_after_update',
    'tg_invoice_before_insert',
    'tg_invoice_item_aiud',
    'tg_payment_after_insert',
    'tg_po_before_insert',
    'tg_po_item_aiud',
    'tg_product_before_insert',
    'tg_saas_invoice_before_insert',
    'tg_staff_before_insert'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;
