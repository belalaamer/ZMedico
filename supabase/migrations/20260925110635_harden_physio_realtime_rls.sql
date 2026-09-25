-- Close branch and RBAC drift on Realtime-published physio child tables.
--
-- physio_cases already has a RESTRICTIVE branch policy. Its child tables did
-- not, which left admin SELECT/UPDATE/DELETE branches globally reachable via
-- permissive role policies. SELECT also still named manager explicitly even
-- though canonical RBAC no longer grants medical_records.view to manager.

DROP POLICY IF EXISTS physio_sessions_branch_isolation
  ON public.physio_sessions;
CREATE POLICY physio_sessions_branch_isolation
ON public.physio_sessions
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.user_has_branch_access_via_physio_case(case_id)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.user_has_branch_access_via_physio_case(case_id)
);

DROP POLICY IF EXISTS physio_reassessments_branch_isolation
  ON public.physio_reassessments;
CREATE POLICY physio_reassessments_branch_isolation
ON public.physio_reassessments
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.user_has_branch_access_via_physio_case(case_id)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.user_has_branch_access_via_physio_case(case_id)
);

DROP POLICY IF EXISTS physio_sessions_select ON public.physio_sessions;
CREATE POLICY physio_sessions_select
ON public.physio_sessions
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);

DROP POLICY IF EXISTS physio_reassessments_select ON public.physio_reassessments;
CREATE POLICY physio_reassessments_select
ON public.physio_reassessments
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
);
