-- Admins may manage settings for every branch. Other roles remain scoped
-- to explicit staff_branches membership (or system_owner global access).
CREATE OR REPLACE FUNCTION public.user_has_branch_access(_branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _branch IS NULL
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.staff_branches
      WHERE user_id = auth.uid()
        AND branch_id = _branch
    );
$$;
