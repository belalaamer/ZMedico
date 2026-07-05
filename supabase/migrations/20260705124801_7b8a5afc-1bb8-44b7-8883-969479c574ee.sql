
-- Restrict physio SELECT policies to clinical roles only (matches medical_records pattern)
DROP POLICY IF EXISTS physio_cases_select ON public.physio_cases;
CREATE POLICY physio_cases_select ON public.physio_cases
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    user_has_branch_access(branch_id)
    AND (
      has_role(auth.uid(), 'doctor'::app_role)
      OR has_role(auth.uid(), 'nurse'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
    )
  )
);

DROP POLICY IF EXISTS physio_sessions_select ON public.physio_sessions;
CREATE POLICY physio_sessions_select ON public.physio_sessions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    user_has_branch_access_via_physio_case(case_id)
    AND (
      has_role(auth.uid(), 'doctor'::app_role)
      OR has_role(auth.uid(), 'nurse'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
    )
  )
);

DROP POLICY IF EXISTS physio_reassessments_select ON public.physio_reassessments;
CREATE POLICY physio_reassessments_select ON public.physio_reassessments
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    user_has_branch_access_via_physio_case(case_id)
    AND (
      has_role(auth.uid(), 'doctor'::app_role)
      OR has_role(auth.uid(), 'nurse'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
    )
  )
);
