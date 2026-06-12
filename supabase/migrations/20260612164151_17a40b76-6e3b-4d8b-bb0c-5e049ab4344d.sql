
-- =====================================================================
-- 1. Mapping table: staff_branches
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.staff_branches (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (user_id, branch_id)
);

GRANT SELECT ON public.staff_branches TO authenticated;
GRANT ALL    ON public.staff_branches TO service_role;

ALTER TABLE public.staff_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sb_select_self_or_admin ON public.staff_branches;
CREATE POLICY sb_select_self_or_admin ON public.staff_branches
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
  );

DROP POLICY IF EXISTS sb_admin_write ON public.staff_branches;
CREATE POLICY sb_admin_write ON public.staff_branches
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS staff_branches_user_idx   ON public.staff_branches(user_id);
CREATE INDEX IF NOT EXISTS staff_branches_branch_idx ON public.staff_branches(branch_id);

-- =====================================================================
-- 2. Backfill from staff_profiles.branch_id (if column exists)
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='staff_profiles' AND column_name='branch_id'
  ) THEN
    INSERT INTO public.staff_branches(user_id, branch_id)
    SELECT sp.id, sp.branch_id
      FROM public.staff_profiles sp
     WHERE sp.branch_id IS NOT NULL
       AND sp.id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END$$;

-- =====================================================================
-- 3. Helper functions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_has_branch_access(_branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Allow rows without a branch (legacy / global rows)
    _branch IS NULL
    -- Admins and HR are global
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
    -- Explicit mapping
    OR EXISTS (
      SELECT 1 FROM public.staff_branches
       WHERE user_id = auth.uid() AND branch_id = _branch
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_patient(_patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _patient IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'hr'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.patients WHERE id = _patient));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_invoice(_invoice uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _invoice IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'hr'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.invoices WHERE id = _invoice));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_medical_record(_rec uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _rec IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'hr'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.medical_records WHERE id = _rec));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_treatment_plan(_plan uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _plan IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'hr'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.treatment_plans WHERE id = _plan));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_prescription(_rx uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _rx IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'hr'::public.app_role)
    OR public.user_has_branch_access_via_medical_record((SELECT medical_record_id FROM public.prescriptions WHERE id = _rx));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_treasury(_treasury uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _treasury IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'hr'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.treasury WHERE id = _treasury));
$$;

GRANT EXECUTE ON FUNCTION public.user_has_branch_access(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_patient(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_invoice(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_medical_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_treatment_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_prescription(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_treasury(uuid)       TO authenticated;

-- =====================================================================
-- 4. RESTRICTIVE branch-isolation policies (additive; existing perms unchanged)
--    Each table gets ONE restrictive FOR ALL policy that forces every read
--    or write through user_has_branch_access(...). Admin/HR pass globally.
-- =====================================================================

-- Direct branch_id tables ----------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'patients','appointments','invoices','payments','expenses',
      'treasury_daily_closes','medical_records','treatment_plans',
      'reminders','patient_wallet_transactions','doctor_commissions',
      'inventory','inventory_transactions','stock_alerts'
    ]) AS t
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS branch_isolation ON public.%I', r.t);
    EXECUTE format(
      'CREATE POLICY branch_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (public.user_has_branch_access(branch_id))
         WITH CHECK (public.user_has_branch_access(branch_id))',
      r.t
    );
  END LOOP;
END$$;

-- Child tables (branch resolved via parent) -----------------------------
DROP POLICY IF EXISTS branch_isolation ON public.invoice_items;
CREATE POLICY branch_isolation ON public.invoice_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_invoice(invoice_id))
  WITH CHECK (public.user_has_branch_access_via_invoice(invoice_id));

DROP POLICY IF EXISTS branch_isolation ON public.patient_wallets;
CREATE POLICY branch_isolation ON public.patient_wallets AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_patient(patient_id))
  WITH CHECK (public.user_has_branch_access_via_patient(patient_id));

DROP POLICY IF EXISTS branch_isolation ON public.patient_documents;
CREATE POLICY branch_isolation ON public.patient_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_patient(patient_id))
  WITH CHECK (public.user_has_branch_access_via_patient(patient_id));

DROP POLICY IF EXISTS branch_isolation ON public.medical_history;
CREATE POLICY branch_isolation ON public.medical_history AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_patient(patient_id))
  WITH CHECK (public.user_has_branch_access_via_patient(patient_id));

DROP POLICY IF EXISTS branch_isolation ON public.dental_chart;
CREATE POLICY branch_isolation ON public.dental_chart AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_patient(patient_id))
  WITH CHECK (public.user_has_branch_access_via_patient(patient_id));

DROP POLICY IF EXISTS branch_isolation ON public.vital_signs;
CREATE POLICY branch_isolation ON public.vital_signs AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_medical_record(medical_record_id))
  WITH CHECK (public.user_has_branch_access_via_medical_record(medical_record_id));

DROP POLICY IF EXISTS branch_isolation ON public.record_diagnoses;
CREATE POLICY branch_isolation ON public.record_diagnoses AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_medical_record(medical_record_id))
  WITH CHECK (public.user_has_branch_access_via_medical_record(medical_record_id));

DROP POLICY IF EXISTS branch_isolation ON public.record_procedures;
CREATE POLICY branch_isolation ON public.record_procedures AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_medical_record(medical_record_id))
  WITH CHECK (public.user_has_branch_access_via_medical_record(medical_record_id));

DROP POLICY IF EXISTS branch_isolation ON public.prescriptions;
CREATE POLICY branch_isolation ON public.prescriptions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_medical_record(medical_record_id))
  WITH CHECK (public.user_has_branch_access_via_medical_record(medical_record_id));

DROP POLICY IF EXISTS branch_isolation ON public.prescription_items;
CREATE POLICY branch_isolation ON public.prescription_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_prescription(prescription_id))
  WITH CHECK (public.user_has_branch_access_via_prescription(prescription_id));

DROP POLICY IF EXISTS branch_isolation ON public.treatment_sessions;
CREATE POLICY branch_isolation ON public.treatment_sessions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_treatment_plan(treatment_plan_id))
  WITH CHECK (public.user_has_branch_access_via_treatment_plan(treatment_plan_id));

DROP POLICY IF EXISTS branch_isolation ON public.treasury_transactions;
CREATE POLICY branch_isolation ON public.treasury_transactions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access_via_treasury(treasury_id))
  WITH CHECK (public.user_has_branch_access_via_treasury(treasury_id));

-- treasury itself has branch_id directly
DROP POLICY IF EXISTS branch_isolation ON public.treasury;
CREATE POLICY branch_isolation ON public.treasury AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_has_branch_access(branch_id))
  WITH CHECK (public.user_has_branch_access(branch_id));
