-- Fix Treasury branch helper execution and preserve strict branch isolation.
-- System Owner is handled by user_has_branch_access(); Clinic Admin requires
-- explicit staff_branches membership through the same canonical helper.

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_treasury(_treasury uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _treasury IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id FROM public.treasury WHERE id = _treasury)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_treasury(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_treasury(uuid) TO authenticated;

COMMENT ON FUNCTION public.user_has_branch_access_via_treasury(uuid)
IS 'Treasury branch scope helper; delegates to canonical user_has_branch_access so System Owner is global and tenant admins require explicit branch membership.';
