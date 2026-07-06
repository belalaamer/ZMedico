-- Wave 3E — Pattern P4 (Manager Branch Equality) — Batch A
-- Substitute has_role(auth.uid(),'manager') with has_permission(auth.uid(),'<verb-key>')
-- Preserves branch predicates verbatim. Semantic equivalence proven pre-flight
-- (added permission holders are already covered by adjacent permissive policies).

-- ============================================================
-- appointments.manager_appts_insert  (INSERT / WITH CHECK)
-- BEFORE: has_role(manager) AND (branch_id IS NULL OR branch_id = current_user_branch_id())
-- AFTER : has_permission('appointments.create') AND (branch_id IS NULL OR branch_id = current_user_branch_id())
-- ============================================================
DROP POLICY IF EXISTS manager_appts_insert ON public.appointments;
CREATE POLICY manager_appts_insert
  ON public.appointments
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'appointments.create')
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

-- ============================================================
-- appointments.manager_appts_update  (UPDATE / USING)
-- ============================================================
DROP POLICY IF EXISTS manager_appts_update ON public.appointments;
CREATE POLICY manager_appts_update
  ON public.appointments
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'appointments.edit')
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

-- ============================================================
-- patients.manager_patients_insert  (INSERT / WITH CHECK)
-- ============================================================
DROP POLICY IF EXISTS manager_patients_insert ON public.patients;
CREATE POLICY manager_patients_insert
  ON public.patients
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'patients.create')
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

-- ============================================================
-- patients.manager_patients_update  (UPDATE / USING)
-- ============================================================
DROP POLICY IF EXISTS manager_patients_update ON public.patients;
CREATE POLICY manager_patients_update
  ON public.patients
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'patients.edit')
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );