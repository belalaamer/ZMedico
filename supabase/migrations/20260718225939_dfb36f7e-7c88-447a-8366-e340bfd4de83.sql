
-- Tighten HR read policies to branch scope using user_has_branch_access().
-- Rows with a NULL branch remain visible (global records like unassigned staff).

DROP POLICY IF EXISTS hr_attendance_select ON public.attendance;
CREATE POLICY hr_attendance_select ON public.attendance
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND (branch_id IS NULL OR user_has_branch_access(branch_id))
  );

DROP POLICY IF EXISTS hr_payroll_select ON public.payroll;
CREATE POLICY hr_payroll_select ON public.payroll
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND (branch_id IS NULL OR user_has_branch_access(branch_id))
  );

DROP POLICY IF EXISTS hr_staff_select ON public.staff_profiles;
CREATE POLICY hr_staff_select ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND (branch_id IS NULL OR user_has_branch_access(branch_id))
  );

-- leave_requests has no branch_id — derive it via staff_profiles.
DROP POLICY IF EXISTS hr_leave_select ON public.leave_requests;
CREATE POLICY hr_leave_select ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = leave_requests.staff_id
        AND (sp.branch_id IS NULL OR user_has_branch_access(sp.branch_id))
    )
  );

-- performance_reviews has no branch_id — derive it via staff_profiles.
DROP POLICY IF EXISTS hr_reviews_select ON public.performance_reviews;
CREATE POLICY hr_reviews_select ON public.performance_reviews
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'hr'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = performance_reviews.staff_id
        AND (sp.branch_id IS NULL OR user_has_branch_access(sp.branch_id))
    )
  );
