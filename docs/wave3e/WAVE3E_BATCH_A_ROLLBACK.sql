-- Rollback for Wave 3E Batch A (Pattern P4)
-- Restores has_role('manager') predicates verbatim.

DROP POLICY IF EXISTS manager_appts_insert ON public.appointments;
CREATE POLICY manager_appts_insert
  ON public.appointments
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND (branch_id IS NULL OR branch_id = current_user_branch_id())
  );

DROP POLICY IF EXISTS manager_appts_update ON public.appointments;
CREATE POLICY manager_appts_update
  ON public.appointments
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND (branch_id IS NULL OR branch_id = current_user_branch_id())
  );

DROP POLICY IF EXISTS manager_patients_insert ON public.patients;
CREATE POLICY manager_patients_insert
  ON public.patients
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND (branch_id IS NULL OR branch_id = current_user_branch_id())
  );

DROP POLICY IF EXISTS manager_patients_update ON public.patients;
CREATE POLICY manager_patients_update
  ON public.patients
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND (branch_id IS NULL OR branch_id = current_user_branch_id())
  );
