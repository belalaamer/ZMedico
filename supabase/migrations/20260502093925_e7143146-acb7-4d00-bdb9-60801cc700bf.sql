
DROP POLICY IF EXISTS staff_select ON public.staff_profiles;
CREATE POLICY staff_select_self_or_admin ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS pr_select ON public.performance_reviews;
CREATE POLICY pr_select_self_or_admin ON public.performance_reviews
  FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS pay_select ON public.payroll;
CREATE POLICY pay_select_self_or_admin ON public.payroll
  FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS sa_select ON public.salary_adjustments;
CREATE POLICY sa_select_self_or_admin ON public.salary_adjustments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.payroll p
      WHERE p.id = salary_adjustments.payroll_id AND p.staff_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS al_insert ON public.audit_logs;

DROP POLICY IF EXISTS ual_insert ON public.user_activity_logs;
CREATE POLICY ual_insert_self ON public.user_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS rproc_all ON public.record_procedures;
CREATE POLICY rproc_select ON public.record_procedures
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rproc_write ON public.record_procedures
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));
CREATE POLICY rproc_update ON public.record_procedures
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));
CREATE POLICY rproc_delete ON public.record_procedures
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));

DROP POLICY IF EXISTS rdx_all ON public.record_diagnoses;
CREATE POLICY rdx_select ON public.record_diagnoses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rdx_write ON public.record_diagnoses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));
CREATE POLICY rdx_update ON public.record_diagnoses
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));
CREATE POLICY rdx_delete ON public.record_diagnoses
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));

DROP POLICY IF EXISTS rxi_all ON public.prescription_items;
CREATE POLICY rxi_select ON public.prescription_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rxi_write ON public.prescription_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));
CREATE POLICY rxi_update ON public.prescription_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));
CREATE POLICY rxi_delete ON public.prescription_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));

DROP POLICY IF EXISTS rx_insert ON public.prescriptions;
DROP POLICY IF EXISTS rx_update ON public.prescriptions;
CREATE POLICY rx_insert_clinical ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));
CREATE POLICY rx_update_clinical ON public.prescriptions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor'));

DROP POLICY IF EXISTS vit_insert ON public.vital_signs;
DROP POLICY IF EXISTS vit_update ON public.vital_signs;
CREATE POLICY vit_insert_clinical ON public.vital_signs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'staff')
  );
CREATE POLICY vit_update_clinical ON public.vital_signs
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'staff')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'staff')
  );

DROP POLICY IF EXISTS ii_insert ON public.invoice_items;
DROP POLICY IF EXISTS ii_update ON public.invoice_items;
DROP POLICY IF EXISTS ii_delete ON public.invoice_items;
CREATE POLICY ii_insert_billing ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'receptionist')
  );
CREATE POLICY ii_update_billing ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'receptionist')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'receptionist')
  );
CREATE POLICY ii_delete_billing ON public.invoice_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS patient_docs_read ON storage.objects;
CREATE POLICY patient_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-docs' AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'doctor')
      OR EXISTS (
        SELECT 1 FROM public.patient_documents pd
        WHERE storage.objects.name = ANY (string_to_array(pd.file_url, '/'))
          AND pd.uploaded_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Product images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS product_images_public_select ON storage.objects;
DROP POLICY IF EXISTS product_images_select ON storage.objects;
DROP POLICY IF EXISTS product_images_list ON storage.objects;
DROP POLICY IF EXISTS product_images_read ON storage.objects;
CREATE POLICY product_images_admin_manage ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(),'admin'));

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.add_treasury_tx(uuid,treasury_tx_type,numeric,text,uuid,text,text,uuid)',
    'public.apply_inventory_tx(uuid,uuid,inventory_tx_type,numeric,numeric,text,uuid,text,text,date,text,uuid)',
    'public.receive_po_item(uuid,numeric,date,text,uuid)',
    'public.recalc_invoice_subtotal(uuid)',
    'public.recalc_invoice_payments(uuid)',
    'public.recalc_po_subtotal(uuid)',
    'public.generate_invoice_number()',
    'public.generate_po_number()',
    'public.generate_product_sku()',
    'public.generate_employee_id()',
    'public.generate_saas_invoice_number()',
    'public.default_treasury_for_branch(uuid)',
    'public.check_expiry_alerts()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;
