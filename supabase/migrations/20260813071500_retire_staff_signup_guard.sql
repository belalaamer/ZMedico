-- Complete the `staff` role retirement (RBAC audit, Phase H1.01-F)
--
-- The `staff` app_role value was retired on 2026-08-05 via the
-- trg_reject_retired_roles trigger on public.user_roles, which rejects any
-- INSERT/UPDATE assigning role = 'staff'. That trigger is correct and is
-- NOT modified here.
--
-- handle_new_user() (the AFTER INSERT trigger on auth.users that bootstraps
-- profiles/user_roles for a new signup) was never updated to match: its
-- fallback for an invitation with no explicit role was
-- `coalesce(invite_role, 'staff'::app_role)`. Since `staff` is now rejected
-- by trg_reject_retired_roles, any invitation left with a NULL role in
-- allowed_signup_emails (the `role` column is nullable) caused the entire
-- sign-up transaction to abort with an opaque, unrelated-looking error
-- surfaced through Supabase Auth -- instead of a clear explanation of what
-- an administrator needs to do.
--
-- This migration changes ONLY that one fallback. Every other statement in
-- the function -- total_users bootstrap-admin path, the
-- allowed_signup_emails pre-authorization lookup and its existing 42501
-- rejection, resolved_name resolution, the profiles insert, the user_roles
-- insert, and the allowed_signup_emails cleanup delete -- is reproduced
-- byte-for-byte unchanged.
--
-- New behavior:
--   invite_role IS NOT NULL -> assigned_role := invite_role (unchanged path)
--   invite_role IS NULL     -> RAISE EXCEPTION with SQLSTATE 42501 and an
--                              explicit message, instead of silently
--                              falling through to the now-retired 'staff'
--                              value and a generic trigger rejection.
--
-- Not touched by this migration: app_role enum, trg_reject_retired_roles /
-- tg_reject_retired_roles(), any RLS policy, has_role(),
-- user_has_branch_access(), any user_has_branch_access_via_* function
-- (J-14), role_permissions, authz_role_bundles, authz_bundle_permissions,
-- or any previously completed J-06..J-15 remediation.

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
  norm_email text := lower(coalesce(new.email, ''));
  assigned_role public.app_role;
  resolved_name text;
begin
  select count(*) into total_users from public.user_roles;

  if total_users > 0 then
    select id, role, full_name
      into invite_id, invite_role, invite_full_name
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
    delete from public.allowed_signup_emails where lower(email) = norm_email;
  end if;

  return new;
end;
$function$;
