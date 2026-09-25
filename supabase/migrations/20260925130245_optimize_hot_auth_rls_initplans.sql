-- Optimize auth.uid() evaluation on the hottest remaining RLS policies.
-- Semantics are unchanged: wrapping auth.uid() in a scalar SELECT lets
-- PostgreSQL evaluate it once per statement instead of once per candidate row.

ALTER POLICY rls_hardening_notifications_recipient ON public.notifications
USING (
  user_id = (SELECT auth.uid())
  OR public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
);

ALTER POLICY notif_select_own ON public.notifications
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    user_id = (SELECT auth.uid())
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  )
  OR (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  )
);

ALTER POLICY notif_insert_own ON public.notifications
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
);

ALTER POLICY notif_update_own ON public.notifications
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    user_id = (SELECT auth.uid())
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  )
  OR (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  )
);

ALTER POLICY notif_delete_own ON public.notifications
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    user_id = (SELECT auth.uid())
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  )
  OR (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
  )
);

ALTER POLICY rls_hardening_branch_scope ON public.staff_branches
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
);

ALTER POLICY sb_admin_write ON public.staff_branches
USING (
  (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'hr'::public.app_role)
  )
  AND public.user_has_branch_access(branch_id)
)
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'hr'::public.app_role)
  )
  AND public.user_has_branch_access(branch_id)
);

ALTER POLICY sb_select_self_or_admin ON public.staff_branches
USING (
  (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'hr'::public.app_role)
  )
  AND public.user_has_branch_access(branch_id)
);

ALTER POLICY roles_admin_write ON public.user_roles
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'settings.edit')
  AND (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR (
      role <> 'system_owner'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.staff_branches actor_sb
        JOIN public.staff_branches target_sb
          ON target_sb.branch_id = actor_sb.branch_id
        WHERE actor_sb.user_id = (SELECT auth.uid())
          AND target_sb.user_id = user_roles.user_id
          AND public.user_has_branch_access(actor_sb.branch_id)
      )
    )
  )
);

ALTER POLICY roles_select_auth ON public.user_roles
USING (
  user_id = (SELECT auth.uid())
  OR public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.has_permission((SELECT auth.uid()), 'settings.view')
    AND EXISTS (
      SELECT 1
      FROM public.staff_branches actor_sb
      JOIN public.staff_branches target_sb
        ON target_sb.branch_id = actor_sb.branch_id
      WHERE actor_sb.user_id = (SELECT auth.uid())
        AND target_sb.user_id = user_roles.user_id
        AND public.user_has_branch_access(actor_sb.branch_id)
    )
  )
);

ALTER POLICY roles_admin_update_delete ON public.user_roles
USING (
  public.has_permission((SELECT auth.uid()), 'settings.edit')
  AND (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR (
      role <> 'system_owner'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.staff_branches actor_sb
        JOIN public.staff_branches target_sb
          ON target_sb.branch_id = actor_sb.branch_id
        WHERE actor_sb.user_id = (SELECT auth.uid())
          AND target_sb.branch_id = actor_sb.branch_id
          AND target_sb.user_id = user_roles.user_id
          AND public.user_has_branch_access(actor_sb.branch_id)
      )
    )
  )
)
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'settings.edit')
  AND (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR (
      role <> 'system_owner'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM public.staff_branches actor_sb
        JOIN public.staff_branches target_sb
          ON target_sb.branch_id = actor_sb.branch_id
        WHERE actor_sb.user_id = (SELECT auth.uid())
          AND target_sb.branch_id = actor_sb.branch_id
          AND target_sb.user_id = user_roles.user_id
          AND public.user_has_branch_access(actor_sb.branch_id)
      )
    )
  )
);
