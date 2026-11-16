-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260902213533
-- name: handle_new_user_require_branch
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

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

    -- RBAC-09 fix: every operational role must resolve to a branch through
    -- staff_branches -- there is no cross-branch bypass for any role
    -- (including admin) inside public.user_has_branch_access(), which
    -- every branches/staff_profiles/etc. RLS policy calls. Before this
    -- check, an invite row created with role='admin' and branch_id NULL
    -- (the exact shape the pre-fix UI produced) completed signup with
    -- user_roles='admin' but no staff_profiles/staff_branches row at all --
    -- a silently locked-out identity. system_owner is the only legitimate
    -- exception -- it is platform-wide by design.
    if assigned_role <> 'system_owner'::public.app_role and invite_branch_id is null then
      raise exception 'Sign-up not permitted: % (role %) has no branch assigned. An administrator must assign a branch before this invitation can be completed.', new.email, assigned_role
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
