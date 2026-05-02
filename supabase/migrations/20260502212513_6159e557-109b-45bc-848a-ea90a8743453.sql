
DROP POLICY IF EXISTS patients_insert_auth ON public.patients;
DROP POLICY IF EXISTS patients_update_auth ON public.patients;

CREATE POLICY patients_insert_roles ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  );

CREATE POLICY patients_update_roles ON public.patients
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  );

DROP POLICY IF EXISTS appts_insert_auth ON public.appointments;
DROP POLICY IF EXISTS appts_update_auth ON public.appointments;

CREATE POLICY appts_insert_roles ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  );

CREATE POLICY appts_update_roles ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  );

DROP POLICY IF EXISTS tre_select_auth ON public.treasury;

CREATE POLICY manager_treasury_select ON public.treasury
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

CREATE POLICY manager_treasury_tx_select ON public.treasury_transactions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.treasury t
      WHERE t.id = treasury_transactions.treasury_id
        AND (t.branch_id IS NULL OR t.branch_id = public.current_user_branch_id())
    )
  );

DROP POLICY IF EXISTS invoices_select_auth ON public.invoices;
DROP POLICY IF EXISTS items_select_auth     ON public.invoice_items;
DROP POLICY IF EXISTS pay_select_auth       ON public.payments;
DROP POLICY IF EXISTS exp_select_auth       ON public.expenses;

CREATE POLICY invoices_select_billing ON public.invoices
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::app_role)
      AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
    )
  );

CREATE POLICY items_select_billing ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id
          AND (i.branch_id IS NULL OR i.branch_id = public.current_user_branch_id())
      )
    )
  );

CREATE POLICY pay_select_billing ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::app_role)
      AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
    )
  );

CREATE POLICY exp_select_billing ON public.expenses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::app_role)
      AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
    )
  );

DROP POLICY IF EXISTS rec_select   ON public.medical_records;
DROP POLICY IF EXISTS hist_select  ON public.medical_history;
DROP POLICY IF EXISTS rx_select    ON public.prescriptions;
DROP POLICY IF EXISTS rxi_select   ON public.prescription_items;
DROP POLICY IF EXISTS vit_select   ON public.vital_signs;
DROP POLICY IF EXISTS dent_select  ON public.dental_chart;
DROP POLICY IF EXISTS rdx_select   ON public.record_diagnoses;
DROP POLICY IF EXISTS rproc_select ON public.record_procedures;

CREATE POLICY rec_select_clinical ON public.medical_records
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY hist_select_clinical ON public.medical_history
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY rx_select_clinical ON public.prescriptions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY rxi_select_clinical ON public.prescription_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY vit_select_clinical ON public.vital_signs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY dent_select_clinical ON public.dental_chart
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY rdx_select_clinical ON public.record_diagnoses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY rproc_select_clinical ON public.record_procedures
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY manager_patients_select ON public.patients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

CREATE POLICY manager_appts_select ON public.appointments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );
