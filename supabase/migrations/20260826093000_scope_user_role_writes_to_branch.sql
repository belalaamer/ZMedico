-- Remove the legacy global user_roles FOR ALL policy that allowed any admin
-- with settings.edit to read or mutate role rows across all clinics.
-- System Owner remains global; branch admins can only manage non-owner roles
-- belonging to a user sharing at least one assigned branch.

BEGIN;

DROP POLICY IF EXISTS roles_admin_manage ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_write ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_update_delete ON public.user_roles;

CREATE POLICY roles_admin_write ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'settings.edit')
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR (
        role <> 'system_owner'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.staff_branches actor_sb
          JOIN public.staff_branches target_sb
            ON target_sb.branch_id = actor_sb.branch_id
          WHERE actor_sb.user_id = auth.uid()
            AND target_sb.user_id = user_roles.user_id
            AND public.user_has_branch_access(actor_sb.branch_id)
        )
      )
    )
  );

CREATE POLICY roles_admin_update_delete ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'settings.edit')
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR (
        role <> 'system_owner'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.staff_branches actor_sb
          JOIN public.staff_branches target_sb
            ON target_sb.branch_id = actor_sb.branch_id
          WHERE actor_sb.user_id = auth.uid()
            AND target_sb.branch_id = actor_sb.branch_id
            AND target_sb.user_id = user_roles.user_id
            AND public.user_has_branch_access(actor_sb.branch_id)
        )
      )
    )
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'settings.edit')
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR (
        role <> 'system_owner'::public.app_role
        AND EXISTS (
          SELECT 1
          FROM public.staff_branches actor_sb
          JOIN public.staff_branches target_sb
            ON target_sb.branch_id = actor_sb.branch_id
          WHERE actor_sb.user_id = auth.uid()
            AND target_sb.branch_id = actor_sb.branch_id
            AND target_sb.user_id = user_roles.user_id
            AND public.user_has_branch_access(actor_sb.branch_id)
        )
      )
    )
  );

COMMIT;
