-- =====================================================================
-- Governance alignment, driven by recognised standards rather than by what
-- the system happens to do today.
--
-- Standards applied:
--   * Minimum necessary / need-to-know -- HIPAA 45 CFR 164.502(b) and 164.514(d),
--     GDPR Art.5(1)(c) data minimisation, Egypt PDPL 151/2018 (health data is a
--     special category), ISO/IEC 27001:2022 A.5.15 access control.
--   * Segregation of duties -- COSO, COBIT, ISO/IEC 27001:2022 A.5.3. The person
--     who oversees must not also originate; the person who holds the asset must
--     not also adjust the record of it.
--   * Tenant / branch isolation -- ISO/IEC 27001:2022 A.8.2 privileged access,
--     enforced on WRITES and not only on reads.
--
-- Every change below was driven by an empirical probe against the live database
-- (all probes ran inside savepoints and were rolled back).
-- =====================================================================


-- =====================================================================
-- 1. CRITICAL -- one clinic could write into another clinic's records.
--
-- PROVEN: an admin who belongs ONLY to clinic B successfully inserted
--   * a payment against clinic A's invoice
--   * an invoice for clinic A's patient
--   * an appointment for clinic A's patient
--   * a medical record about clinic A's patient
--   * a physiotherapy case about clinic A's patient
-- simply by stamping their OWN branch_id on the new row.
--
-- Root cause: user_has_branch_access() is applied to the branch column of the
-- row being written, and nothing checks that the referenced parent (patient,
-- invoice) belongs to that same branch. A read-only isolation test cannot see
-- this -- reads were correctly returning zero rows the whole time.
--
-- Impact under the rental model: clinic B settles clinic A's receivable, the cash
-- lands in clinic B's treasury, and clinic A's books move without clinic A doing
-- anything. It also allows a clinical record to be attached to another clinic's
-- patient, which is a patient-safety issue, not merely an accounting one.
--
-- Fix: a child row must live in the same branch as its parent. Enforced by
-- trigger rather than by policy so the error message names the problem.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_enforce_branch_referential_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_parent_branch uuid;
  v_parent_label  text;
BEGIN
  -- A NULL branch means "not branch-scoped"; leave those alone.
  IF NEW.branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'payments' THEN
    IF NEW.invoice_id IS NOT NULL THEN
      SELECT branch_id INTO v_parent_branch FROM public.invoices WHERE id = NEW.invoice_id;
      v_parent_label := 'invoice';
      IF v_parent_branch IS NOT NULL AND v_parent_branch <> NEW.branch_id THEN
        RAISE EXCEPTION 'A payment recorded in one branch cannot be applied to an % that belongs to a different branch.', v_parent_label
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    IF NEW.patient_id IS NOT NULL THEN
      SELECT branch_id INTO v_parent_branch FROM public.patients WHERE id = NEW.patient_id;
      IF v_parent_branch IS NOT NULL AND v_parent_branch <> NEW.branch_id THEN
        RAISE EXCEPTION 'A payment recorded in one branch cannot be applied to a patient who belongs to a different branch.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- invoices, appointments, medical_records, physio_cases, treatment_plans:
  -- all hang off a patient, and must sit in that patient's branch.
  IF NEW.patient_id IS NOT NULL THEN
    SELECT branch_id INTO v_parent_branch FROM public.patients WHERE id = NEW.patient_id;
    IF v_parent_branch IS NOT NULL AND v_parent_branch <> NEW.branch_id THEN
      RAISE EXCEPTION 'This % belongs to branch %, but the patient belongs to a different branch. Records cannot be created across branches.',
        TG_TABLE_NAME, NEW.branch_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_branch_ref_payments ON public.payments;
CREATE TRIGGER trg_branch_ref_payments
  BEFORE INSERT OR UPDATE OF branch_id, invoice_id, patient_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_branch_referential_integrity();

DROP TRIGGER IF EXISTS trg_branch_ref_invoices ON public.invoices;
CREATE TRIGGER trg_branch_ref_invoices
  BEFORE INSERT OR UPDATE OF branch_id, patient_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_branch_referential_integrity();

DROP TRIGGER IF EXISTS trg_branch_ref_appointments ON public.appointments;
CREATE TRIGGER trg_branch_ref_appointments
  BEFORE INSERT OR UPDATE OF branch_id, patient_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_branch_referential_integrity();

DROP TRIGGER IF EXISTS trg_branch_ref_medical_records ON public.medical_records;
CREATE TRIGGER trg_branch_ref_medical_records
  BEFORE INSERT OR UPDATE OF branch_id, patient_id ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_branch_referential_integrity();

DROP TRIGGER IF EXISTS trg_branch_ref_physio_cases ON public.physio_cases;
CREATE TRIGGER trg_branch_ref_physio_cases
  BEFORE INSERT OR UPDATE OF branch_id, patient_id ON public.physio_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_branch_referential_integrity();

DROP TRIGGER IF EXISTS trg_branch_ref_treatment_plans ON public.treatment_plans;
CREATE TRIGGER trg_branch_ref_treatment_plans
  BEFORE INSERT OR UPDATE OF branch_id, patient_id ON public.treatment_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_branch_referential_integrity();


-- =====================================================================
-- 2. notification_settings could not be read by ANY role, including
-- system_owner.
--
-- The table has INSERT, UPDATE and DELETE policies but no SELECT policy at all.
-- With RLS enabled that means zero rows for everyone, so the communication
-- settings screen can never load the row it is meant to edit. A systematic sweep
-- of all 111 RLS-enabled tables found this was the only table in that state.
-- =====================================================================
DROP POLICY IF EXISTS ns_select ON public.notification_settings;
CREATE POLICY ns_select
  ON public.notification_settings
  FOR SELECT
  USING (
    public.has_permission(auth.uid(), 'settings.view')
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  );


-- =====================================================================
-- 3. Minimum necessary: HR had full read access to every patient record.
--
-- PROVEN: the hr role could read all 38 patients and all 31 appointments.
-- The declared permission bundle grants hr NOTHING on patients -- the RLS policy
-- simply had 'hr' hard-coded in its role list.
--
-- HR administers people, payroll and leave. No part of that function requires
-- a patient's identity, diagnosis or appointment history. Under HIPAA's minimum
-- necessary standard and GDPR data minimisation this access has no lawful basis,
-- and Egyptian PDPL 151/2018 treats health data as a special category requiring
-- a specific justification.
--
-- Also fixed in the same policy: the accountant was MISSING even though the
-- bundle grants patients.view. An accountant who cannot see whose invoice they
-- are collecting cannot do the job -- the invoices screen joins to patients and
-- was rendering blank names. Accountants keep zero access to clinical tables,
-- so identity-for-billing satisfies minimum necessary.
-- =====================================================================
DROP POLICY IF EXISTS patients_select_scoped ON public.patients;
CREATE POLICY patients_select_scoped
  ON public.patients
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'doctor'::public.app_role)
      OR public.has_role(auth.uid(), 'nurse'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)   -- added: billing needs identity
      -- 'hr' deliberately removed: no lawful basis for patient data
    )
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS appts_select_scoped ON public.appointments;
CREATE POLICY appts_select_scoped
  ON public.appointments
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'doctor'::public.app_role)
      OR public.has_role(auth.uid(), 'nurse'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR public.has_role(auth.uid(), 'accountant'::public.app_role)   -- added: bundle grants appointments.view
      -- 'hr' deliberately removed
    )
    AND public.user_has_branch_access(branch_id)
  );


-- =====================================================================
-- 4. Minimum necessary: clinical records were readable by non-clinical roles,
-- while a doctor was restricted to their own.
--
-- medical_records was readable by 'manager'. treatment_plans was readable by
-- 'manager', 'receptionist' AND 'accountant', yet a doctor could only see plans
-- where doctor_id = themselves.
--
-- That is inverted. A covering doctor must be able to read the plan of a
-- colleague's patient -- continuity of care depends on it, and withholding it is
-- a patient-safety risk. Meanwhile a receptionist scheduling an appointment needs
-- the appointment, not the clinical plan, and an accountant needs the invoice,
-- not the diagnosis. Managers get aggregate reporting, which is what the
-- reports_medical permission is for.
-- =====================================================================
DROP POLICY IF EXISTS rec_select_clinical ON public.medical_records;
CREATE POLICY rec_select_clinical
  ON public.medical_records
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'doctor'::public.app_role)
      OR public.has_role(auth.uid(), 'nurse'::public.app_role)
      -- 'manager' removed: aggregate reporting, not individual clinical notes
    )
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS "tp select" ON public.treatment_plans;
CREATE POLICY "tp select"
  ON public.treatment_plans
  FOR SELECT
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'doctor'::public.app_role)   -- branch-wide: continuity of care
      OR public.has_role(auth.uid(), 'nurse'::public.app_role)
      -- 'manager', 'receptionist', 'accountant' removed: clinical content
    )
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS physio_cases_select ON public.physio_cases;
CREATE POLICY physio_cases_select
  ON public.physio_cases
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.user_has_branch_access(branch_id)
      AND (
        public.has_role(auth.uid(), 'doctor'::public.app_role)
        OR public.has_role(auth.uid(), 'nurse'::public.app_role)
        -- 'manager' removed, consistent with medical_records
      )
    )
  );


-- =====================================================================
-- 5. Segregation of duties: the manager could originate invoices.
--
-- PROVEN: the manager role successfully inserted an invoice, even though the
-- declared bundle grants manager only invoices.view and invoices.export.
--
-- A manager's function is oversight -- reviewing takings, approving the daily
-- close, reading financial reports. Allowing the same person to originate the
-- billing document they later review removes the second pair of eyes, which is
-- the entire point of segregation of duties (COSO; ISO 27001 A.5.3). Invoice
-- origination stays with reception and the accountant.
-- =====================================================================
DROP POLICY IF EXISTS manager_invoices_insert ON public.invoices;


-- =====================================================================
-- 6. HR could not do its own job: work schedules were unwritable and unreadable.
--
-- PROVEN: hr writing a work_schedules row was refused with 42501, and the SELECT
-- policy is (staff_id = auth.uid() OR admin), so HR could not even see the roster.
-- Staff rostering is HR's core responsibility. This is a MISSING permission, the
-- opposite of the problems above -- least privilege means the right privileges,
-- not merely few.
-- =====================================================================
DROP POLICY IF EXISTS ws_select ON public.work_schedules;
CREATE POLICY ws_select
  ON public.work_schedules
  FOR SELECT
  USING (
    (
      staff_id = auth.uid()                                          -- see your own roster
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'hr'::public.app_role)          -- added: rostering is HR's job
      OR public.has_role(auth.uid(), 'manager'::public.app_role)     -- added: branch staffing oversight
    )
    AND public.user_has_branch_access(branch_id)
  );

DROP POLICY IF EXISTS ws_hr_write ON public.work_schedules;
CREATE POLICY ws_hr_write
  ON public.work_schedules
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'hr'::public.app_role)
    AND public.user_has_branch_access(branch_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hr'::public.app_role)
    AND public.user_has_branch_access(branch_id)
  );


-- =====================================================================
-- 7. Platform-level records were reachable by a tenant administrator.
--
-- tenants, subscriptions and system_backups were readable and writable by the
-- admin role. Under the rental model those are the LANDLORD's records, not the
-- tenant's: a clinic administrator must not be able to read or alter their own
-- subscription, create tenants, or enumerate platform backups.
--
-- Worse, tenants_authenticated_insert allowed ANY authenticated user -- down to a
-- receptionist -- to create a tenant row naming themselves as owner.
-- =====================================================================
DROP POLICY IF EXISTS tenants_authenticated_insert ON public.tenants;
DROP POLICY IF EXISTS tenants_admin_all ON public.tenants;
DROP POLICY IF EXISTS tenants_owner_read ON public.tenants;
DROP POLICY IF EXISTS tenants_owner_update ON public.tenants;
CREATE POLICY tenants_system_owner_only
  ON public.tenants
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));

DROP POLICY IF EXISTS subs_admin_write ON public.subscriptions;
DROP POLICY IF EXISTS subs_owner_read ON public.subscriptions;
CREATE POLICY subs_system_owner_only
  ON public.subscriptions
  FOR ALL
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));

DROP POLICY IF EXISTS sb_read_admin ON public.system_backups;
CREATE POLICY sb_read_system_owner
  ON public.system_backups
  FOR SELECT
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role));
