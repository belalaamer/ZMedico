-- Ensure branch administration also obeys the central subscription gate.
DROP POLICY IF EXISTS branches_admin_all ON public.branches;
CREATE POLICY branches_admin_all ON public.branches FOR ALL TO authenticated
  USING (has_permission(auth.uid(), 'settings.edit') AND public.user_has_branch_access(id))
  WITH CHECK (has_permission(auth.uid(), 'settings.edit') AND public.user_has_branch_access(id));
