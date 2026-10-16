-- ZMED-250 candidate only. Apply individually after security review/approval.
-- Keep platform Authz catalogs owner-only. Expose only the current caller's
-- effective keys, never management rows, a supplied identity, or business data.
do $preflight$
begin
  if to_regprocedure('public.assert_active_session()') is null
     or to_regprocedure('zmedico_security.session_is_active()') is null then
    raise exception 'Reviewed active-session prerequisite is required';
  end if;
  if to_regnamespace('zmedico_authz_self') is not null
     or to_regprocedure('public.current_user_effective_permissions()') is not null then
    raise exception 'Self-permission objects already exist; review before applying';
  end if;
end;
$preflight$;

create schema zmedico_authz_self;
revoke all on schema zmedico_authz_self from public, anon, authenticated, service_role;
grant usage on schema zmedico_authz_self to authenticated;

create function zmedico_authz_self.effective_permissions()
returns table(user_id uuid, permission_key text)
language plpgsql stable security definer set search_path = ''
as $self_permissions$
declare
  v_user uuid;
begin
  -- Recheck inside the private privileged boundary as well as the invoker RPC.
  -- The reviewed guard validates live Auth user/session, issuer and expiry.
  if current_setting('role', true) <> 'authenticated'
     or not coalesce(zmedico_security.session_is_active(), false) then
    raise exception 'Authentication session is no longer active' using errcode='42501';
  end if;
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Authenticated caller required' using errcode='42501';
  end if;
  -- Preserve the existing UI linkage rule: admins bootstrap without a staff
  -- record; other roles require their own non-terminated staff link.
  if not public.has_role(v_user, 'admin'::public.app_role)
     and not exists (select 1 from public.staff_profiles sp
       where sp.linked_user_id = v_user and sp.status <> 'terminated') then
    raise exception 'Active staff linkage required' using errcode='42501';
  end if;
  -- Same role/bundle/implication/deprecation semantics as the existing view.
  -- UNION (not UNION ALL) terminates cycles; no role defaults are invented.
  return query
    with recursive user_bundles as (
      select rb.bundle_key
      from public.user_roles ur
      join public.authz_role_bundles rb on rb.role = ur.role
      where ur.user_id = v_user
      union
      select bi.child_bundle_key
      from user_bundles ub
      join public.authz_bundle_implies bi on bi.parent_bundle_key = ub.bundle_key
    )
    select distinct v_user, bp.permission_key
    from user_bundles ub
    join public.authz_bundle_permissions bp on bp.bundle_key = ub.bundle_key
    join public.authz_permissions p on p.key = bp.permission_key
    where not p.deprecated;
end;
$self_permissions$;
revoke all on function zmedico_authz_self.effective_permissions() from public, anon, authenticated, service_role;
grant execute on function zmedico_authz_self.effective_permissions() to authenticated;

create function public.current_user_effective_permissions()
returns table(user_id uuid, permission_key text)
language plpgsql stable security invoker set search_path = ''
as $rpc$
begin
  perform public.assert_active_session();
  return query select p.user_id, p.permission_key
    from zmedico_authz_self.effective_permissions() p;
end;
$rpc$;
revoke all on function public.current_user_effective_permissions() from public, anon, authenticated, service_role;
grant execute on function public.current_user_effective_permissions() to authenticated;
notify pgrst, 'reload schema';
