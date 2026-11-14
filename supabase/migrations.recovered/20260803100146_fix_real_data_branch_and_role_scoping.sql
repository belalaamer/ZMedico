-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260803100146
-- name: fix_real_data_branch_and_role_scoping
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.


-- ============================================================
-- إصلاح ثغرة حقيقية على البيانات الحية: سياسة "branch_isolation"
-- كانت بتدي ANY موظف مربوط بالفرع صلاحية كاملة (ALL) من غير فحص الدور،
-- والسياسات التانية (patients_select_scoped ...) كانت بتدي أي دور
-- (admin/doctor/nurse/receptionist/hr) صلاحية كاملة من غير فحص الفرع.
-- الاتنين مع بعض كانوا بيلغوا بعض. الحل: ندمج فحص الدور + فحص الفرع مع بعض.
-- ============================================================

-- patients
DROP POLICY IF EXISTS branch_isolation ON public.patients;
DROP POLICY IF EXISTS patients_select_scoped ON public.patients;
CREATE POLICY patients_select_scoped ON public.patients
FOR SELECT USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'doctor'::app_role)
   OR has_role(auth.uid(),'nurse'::app_role) OR has_role(auth.uid(),'receptionist'::app_role)
   OR has_role(auth.uid(),'hr'::app_role))
  AND user_has_branch_access(branch_id)
);

-- appointments
DROP POLICY IF EXISTS branch_isolation ON public.appointments;
DROP POLICY IF EXISTS appts_select_scoped ON public.appointments;
CREATE POLICY appts_select_scoped ON public.appointments
FOR SELECT USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'doctor'::app_role)
   OR has_role(auth.uid(),'nurse'::app_role) OR has_role(auth.uid(),'receptionist'::app_role)
   OR has_role(auth.uid(),'hr'::app_role))
  AND user_has_branch_access(branch_id)
);

-- medical_records
DROP POLICY IF EXISTS branch_isolation ON public.medical_records;
DROP POLICY IF EXISTS rec_select_clinical ON public.medical_records;
CREATE POLICY rec_select_clinical ON public.medical_records
FOR SELECT USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'doctor'::app_role)
   OR has_role(auth.uid(),'nurse'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  AND user_has_branch_access(branch_id)
);

-- invoices: منزود فحص الفرع على admin/receptionist/accountant (manager أصلا محقق)
DROP POLICY IF EXISTS branch_isolation ON public.invoices;
DROP POLICY IF EXISTS invoices_select_billing ON public.invoices;
CREATE POLICY invoices_select_billing ON public.invoices
FOR SELECT USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'receptionist'::app_role)
   OR has_role(auth.uid(),'accountant'::app_role)
   OR (has_role(auth.uid(),'manager'::app_role) AND (branch_id IS NULL OR branch_id = current_user_branch_id())))
  AND user_has_branch_access(branch_id)
);

-- payments: نفس المبدأ
DROP POLICY IF EXISTS branch_isolation ON public.payments;
DROP POLICY IF EXISTS pay_select_billing ON public.payments;
CREATE POLICY pay_select_billing ON public.payments
FOR SELECT USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'receptionist'::app_role)
   OR has_role(auth.uid(),'accountant'::app_role)
   OR (has_role(auth.uid(),'manager'::app_role) AND (branch_id IS NULL OR branch_id = current_user_branch_id())))
  AND user_has_branch_access(branch_id)
);

