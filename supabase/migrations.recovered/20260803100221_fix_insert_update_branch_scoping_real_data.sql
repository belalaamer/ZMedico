-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260803100221
-- name: fix_insert_update_branch_scoping_real_data
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.


-- appointments
DROP POLICY IF EXISTS appts_insert_roles ON public.appointments;
CREATE POLICY appts_insert_roles ON public.appointments
FOR INSERT WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'doctor'::app_role)
   OR has_role(auth.uid(),'nurse'::app_role) OR has_role(auth.uid(),'receptionist'::app_role))
  AND user_has_branch_access(branch_id)
);
DROP POLICY IF EXISTS nurse_appts_insert ON public.appointments;
CREATE POLICY nurse_appts_insert ON public.appointments
FOR INSERT WITH CHECK (has_role(auth.uid(),'nurse'::app_role) AND user_has_branch_access(branch_id));

DROP POLICY IF EXISTS appts_update_roles ON public.appointments;
CREATE POLICY appts_update_roles ON public.appointments
FOR UPDATE USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'doctor'::app_role)
   OR has_role(auth.uid(),'nurse'::app_role) OR has_role(auth.uid(),'receptionist'::app_role))
  AND user_has_branch_access(branch_id)
);
DROP POLICY IF EXISTS nurse_appts_update ON public.appointments;
CREATE POLICY nurse_appts_update ON public.appointments
FOR UPDATE USING (has_role(auth.uid(),'nurse'::app_role) AND user_has_branch_access(branch_id));

-- patients
DROP POLICY IF EXISTS patients_insert_frontdesk ON public.patients;
CREATE POLICY patients_insert_frontdesk ON public.patients
FOR INSERT WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'receptionist'::app_role))
  AND user_has_branch_access(branch_id)
);
DROP POLICY IF EXISTS patients_update_frontdesk ON public.patients;
CREATE POLICY patients_update_frontdesk ON public.patients
FOR UPDATE USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'receptionist'::app_role))
  AND user_has_branch_access(branch_id)
);

-- medical_records
DROP POLICY IF EXISTS rec_insert_clinical ON public.medical_records;
CREATE POLICY rec_insert_clinical ON public.medical_records
FOR INSERT WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'doctor'::app_role))
  AND user_has_branch_access(branch_id)
);

-- invoices
DROP POLICY IF EXISTS invoices_insert_admin_reception ON public.invoices;
CREATE POLICY invoices_insert_admin_reception ON public.invoices
FOR INSERT WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'receptionist'::app_role))
  AND user_has_branch_access(branch_id)
);
DROP POLICY IF EXISTS acct_invoices_insert ON public.invoices;
CREATE POLICY acct_invoices_insert ON public.invoices
FOR INSERT WITH CHECK (has_role(auth.uid(),'accountant'::app_role) AND user_has_branch_access(branch_id));

DROP POLICY IF EXISTS invoices_update_admin ON public.invoices;
CREATE POLICY invoices_update_admin ON public.invoices
FOR UPDATE USING (has_role(auth.uid(),'admin'::app_role) AND user_has_branch_access(branch_id));
DROP POLICY IF EXISTS acct_invoices_update ON public.invoices;
CREATE POLICY acct_invoices_update ON public.invoices
FOR UPDATE USING (has_role(auth.uid(),'accountant'::app_role) AND user_has_branch_access(branch_id));

-- payments
DROP POLICY IF EXISTS pay_insert_admin_reception ON public.payments;
CREATE POLICY pay_insert_admin_reception ON public.payments
FOR INSERT WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'receptionist'::app_role))
  AND user_has_branch_access(branch_id)
);
DROP POLICY IF EXISTS acct_payments_insert ON public.payments;
CREATE POLICY acct_payments_insert ON public.payments
FOR INSERT WITH CHECK (has_role(auth.uid(),'accountant'::app_role) AND user_has_branch_access(branch_id));

DROP POLICY IF EXISTS acct_payments_update ON public.payments;
CREATE POLICY acct_payments_update ON public.payments
FOR UPDATE USING (has_role(auth.uid(),'accountant'::app_role) AND user_has_branch_access(branch_id));
DROP POLICY IF EXISTS pay_update_own_or_admin ON public.payments;
CREATE POLICY pay_update_own_or_admin ON public.payments
FOR UPDATE USING (
  (received_by = auth.uid())
  OR (has_role(auth.uid(),'admin'::app_role) AND user_has_branch_access(branch_id))
);

-- delete policies: تأكيد فحص الفرع
DROP POLICY IF EXISTS patients_delete_admin ON public.patients;
CREATE POLICY patients_delete_admin ON public.patients
FOR DELETE USING (has_role(auth.uid(),'admin'::app_role) AND user_has_branch_access(branch_id));

DROP POLICY IF EXISTS appts_delete_admin ON public.appointments;
CREATE POLICY appts_delete_admin ON public.appointments
FOR DELETE USING (has_role(auth.uid(),'admin'::app_role) AND user_has_branch_access(branch_id));

DROP POLICY IF EXISTS rec_delete ON public.medical_records;
CREATE POLICY rec_delete ON public.medical_records
FOR DELETE USING (has_role(auth.uid(),'admin'::app_role) AND user_has_branch_access(branch_id));

DROP POLICY IF EXISTS invoices_delete_admin ON public.invoices;
CREATE POLICY invoices_delete_admin ON public.invoices
FOR DELETE USING (has_role(auth.uid(),'admin'::app_role) AND user_has_branch_access(branch_id));

DROP POLICY IF EXISTS pay_delete_admin ON public.payments;
CREATE POLICY pay_delete_admin ON public.payments
FOR DELETE USING (has_role(auth.uid(),'admin'::app_role) AND user_has_branch_access(branch_id));

