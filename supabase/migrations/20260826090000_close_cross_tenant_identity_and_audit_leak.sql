-- Close cross-tenant identity and audit-log visibility gaps.
-- No clinical or financial rows are deleted or modified.
-- System Owner remains global; Clinic Admin and all other roles are branch-scoped.

BEGIN;

-- Invitations must carry the branch they belong to. Existing NULL rows are
-- intentionally not assigned automatically; they remain visible only to the
-- global System Owner until reviewed.
ALTER TABLE public.allowed_signup_emails
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS allowed_signup_emails_branch_idx
  ON public.allowed_signup_emails(branch_id, created_at DESC);

-- A branch-scoped user may only see audit entries attached to a branch they
-- can access. Historical/global entries with branch_id NULL are platform-only.
DROP POLICY IF EXISTS al_select_admin ON public.audit_logs;
CREATE POLICY al_select_scoped ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'settings.export')
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
    )
  );

-- Profiles were previously globally readable by anyone with the admin role.
-- Restrict them to the same branch membership, while preserving the user's
-- ability to read their own profile and the System Owner's global access.
DROP POLICY IF EXISTS profiles_select_same_branch ON public.profiles;
CREATE POLICY profiles_select_same_branch ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_permission(auth.uid(), 'settings.view')
      AND EXISTS (
        SELECT 1
        FROM public.staff_branches actor_sb
        JOIN public.staff_branches target_sb
          ON target_sb.branch_id = actor_sb.branch_id
        WHERE actor_sb.user_id = auth.uid()
          AND target_sb.user_id = profiles.id
          AND public.user_has_branch_access(actor_sb.branch_id)
      )
    )
  );

-- Role rows have no branch_id of their own; scope them through the user's
-- explicit staff_branches memberships.
-- The legacy `roles_admin_manage` was FOR ALL and therefore also granted
-- global SELECT to any admin with settings.edit. Replace it with a scoped
-- write policy and keep reads in the branch-aware SELECT policy below.
DROP POLICY IF EXISTS roles_admin_manage ON public.user_roles;
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

DROP POLICY IF EXISTS roles_select_auth ON public.user_roles;
CREATE POLICY roles_select_auth ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_permission(auth.uid(), 'settings.view')
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
  );

-- Staff rows with a NULL branch are not clinic data and must not be exposed to
-- a Clinic Admin. System Owner remains able to inspect them globally.
DROP POLICY IF EXISTS staff_admin ON public.staff_profiles;
CREATE POLICY staff_admin ON public.staff_profiles
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'settings.edit')
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
    )
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'settings.edit')
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
    )
  );

-- The allowlist is platform-global unless a branch is explicitly attached.
-- This prevents a branch admin from reading or managing another clinic's
-- pending invitations.
DROP POLICY IF EXISTS "admins manage allowlist" ON public.allowed_signup_emails;
DROP POLICY IF EXISTS allowed_signup_emails_select_none ON public.allowed_signup_emails;
CREATE POLICY allowlist_system_owner ON public.allowed_signup_emails
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));
CREATE POLICY allowlist_branch_admin ON public.allowed_signup_emails
  FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'settings.edit')
    AND branch_id IS NOT NULL
    AND public.user_has_branch_access(branch_id)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'settings.edit')
    AND branch_id IS NOT NULL
    AND public.user_has_branch_access(branch_id)
  );

-- Keep the registration path branch-aware. This is only used for users who
-- complete a pre-authorized invitation; it does not affect existing users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  total_users int;
  invite_id uuid;
  invite_role public.app_role;
  invite_full_name text;
  invite_branch_id uuid;
  norm_email text := lower(coalesce(new.email, ''));
  assigned_role public.app_role;
  resolved_name text;
  v_emp_code text;
  v_next bigint;
begin
  select count(*) into total_users from public.user_roles;

  if total_users > 0 then
    select id, role, full_name, branch_id
      into invite_id, invite_role, invite_full_name, invite_branch_id
      from public.allowed_signup_emails
      where lower(email) = norm_email
      limit 1;
    if invite_id is null then
      raise exception 'Sign-up not permitted: % is not pre-authorized by an administrator', new.email
        using errcode = '42501';
    end if;
  end if;

  resolved_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    invite_full_name,
    split_part(new.email,'@',1)
  );

  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    resolved_name,
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );

  if total_users = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    if invite_role is not null then
      assigned_role := invite_role;
    else
      raise exception 'Sign-up not permitted: % has no role assigned. An administrator must assign an explicit role before this invitation can be completed.', new.email
        using errcode = '42501';
    end if;
    insert into public.user_roles (user_id, role) values (new.id, assigned_role);

    -- Branch-attached invitations provision the identity's staff row. The
    -- existing sync trigger then creates the matching staff_branches row.
    if invite_branch_id is not null then
      insert into public.employee_id_counter (id, last_value)
        values (1, 1)
        on conflict (id) do update
          set last_value = public.employee_id_counter.last_value + 1
        returning last_value into v_next;
      v_emp_code := 'EMP-' || lpad(v_next::text, 4, '0');

      insert into public.staff_profiles
        (id, linked_user_id, branch_id, employee_id, status)
      values
        (new.id, new.id, invite_branch_id, v_emp_code, 'active'::public.staff_status)
      on conflict (id) do update
        set linked_user_id = excluded.linked_user_id,
            branch_id = excluded.branch_id,
            status = excluded.status;
    end if;

    delete from public.allowed_signup_emails where lower(email) = norm_email;
  end if;

  return new;
end;
$function$;

COMMIT;
