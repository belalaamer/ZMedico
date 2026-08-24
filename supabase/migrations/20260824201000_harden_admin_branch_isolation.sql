-- Harden tenant/branch isolation for Clinic Admins.
-- System Owner remains global and is intentionally not a Clinic Admin.
-- No clinic data is created or modified by this migration.

BEGIN;

-- Remove only the redundant clinic membership for the confirmed global System Owner.
-- The account remains fully authorized through the system_owner role and explicit
-- Platform Workspace handoff; BranchContext does not require staff_branches for it.
DELETE FROM public.staff_branches sb
USING auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE sb.user_id = u.id
  AND lower(u.email) = lower('belalaamer@outlook.com')
  AND ur.role = 'system_owner'::public.app_role;

-- Clinic Admin access must be granted by explicit staff_branches membership.
-- System Owner is the only global bypass.
CREATE OR REPLACE FUNCTION public.user_has_branch_access(_branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _branch IS NULL
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.staff_branches sb
        JOIN public.branches b ON b.id = sb.branch_id
        WHERE sb.user_id = auth.uid()
          AND sb.branch_id = _branch
          AND public.tenant_has_active_subscription(b.tenant_id)
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.staff_branches sb
      JOIN public.branches b ON b.id = sb.branch_id
      WHERE sb.user_id = auth.uid()
        AND sb.branch_id = _branch
        AND public.tenant_has_active_subscription(b.tenant_id)
    );
$$;

COMMIT;
