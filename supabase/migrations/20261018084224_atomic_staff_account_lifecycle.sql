-- Individually reviewed release only; requires ZMED-258 first. No data repair.
set local lock_timeout='2s';
set local statement_timeout='30s';
do $preflight$ begin
 if md5(pg_get_functiondef('public.settings_assign_user_role(uuid,public.app_role,uuid)'::regprocedure)) <> 'e14edc923706705b7c6cbc43865f1e80' then
  raise exception 'Reviewed role-assignment dependency required' using errcode='55000';
 end if;
 if md5(pg_get_functiondef('zmedico_security.session_is_active()'::regprocedure)) <> '4a77243167edf154de0192c7105f8bde' then
  raise exception 'Live-session dependency drift; review required' using errcode='55000';
 end if;
 if (select relacl::text from pg_class where oid='public.user_roles'::regclass) is distinct from '{postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwdDxtm/postgres}' then
  raise exception 'Role-table privilege drift; review required' using errcode='55000';
 end if;
 if to_regprocedure('public.hr_set_staff_user_link(uuid,uuid)') is not null then
  raise exception 'Legacy unversioned staff endpoint exists; reconcile release' using errcode='55000';
 end if;
 if to_regprocedure('public.hr_manage_staff_user_link(uuid,uuid,jsonb,uuid,jsonb,public.app_role,boolean)') is not null then
  raise exception 'Staff lifecycle endpoint already exists; reconcile release' using errcode='55000';
 end if;
end $preflight$;

create function public.hr_manage_staff_user_link(
 p_staff_id uuid, p_new_user_id uuid, p_expected_staff jsonb,
 p_previous_staff_id uuid default null, p_expected_previous_staff jsonb default null,
 p_new_role public.app_role default null, p_apply_role boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 v_actor uuid := auth.uid();
 v_staff public.staff_profiles%rowtype;
 v_previous public.staff_profiles%rowtype;
 v_old_user uuid;
 v_owner boolean;
 v_action text;
 v_target_branch uuid;
 v_target_tenant uuid;
begin
 if current_setting('role',true) is distinct from 'authenticated'
    or not coalesce(zmedico_security.session_is_active(),false) then
  raise exception 'Active authenticated session required' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(20781001,1);
 if not coalesce(zmedico_security.session_is_active(),false)
    or not public.has_permission(v_actor,'settings.edit') then
  raise exception 'Staff-account management not authorized' using errcode='42501';
 end if;
 v_owner := public.has_role(v_actor,'system_owner'::public.app_role);
 if p_staff_id is null or p_expected_staff is null
    or not (p_expected_staff ? 'linked_user_id') or p_expected_staff->>'updated_at' is null then
  raise exception 'Observed staff link and version required' using errcode='22004';
 end if;
 if p_previous_staff_id is not null and (p_previous_staff_id=p_staff_id or p_new_user_id is null
   or p_expected_previous_staff is null or not (p_expected_previous_staff ? 'linked_user_id')
   or p_expected_previous_staff->>'updated_at' is null) then
  raise exception 'Observed source staff link and version required for move' using errcode='22004';
 end if;
 -- Canonical administrative lock first; lock both staff rows in UUID order.
 perform 1 from public.staff_profiles where id in (p_staff_id,p_previous_staff_id) order by id for update;
 select * into v_staff from public.staff_profiles where id=p_staff_id and deleted_at is null;
 if not found then raise exception 'Active staff profile not found' using errcode='23503'; end if;
 if not v_owner and (v_staff.branch_id is null or not public.user_has_branch_access(v_staff.branch_id)) then
  raise exception 'Staff branch outside caller scope' using errcode='42501';
 end if;
 if v_staff.linked_user_id is distinct from (p_expected_staff->>'linked_user_id')::uuid
    or v_staff.updated_at is distinct from (p_expected_staff->>'updated_at')::timestamptz then
  raise exception 'Staff link changed; refresh before retry' using errcode='PT409';
 end if;
 if p_new_user_id is not null and v_staff.status in ('terminated','suspended') then
  raise exception 'Inactive employee cannot receive account access' using errcode='23514';
 end if;
 if p_previous_staff_id is not null then
  select * into v_previous from public.staff_profiles where id=p_previous_staff_id and deleted_at is null;
  if not found then raise exception 'Source staff profile not found' using errcode='23503'; end if;
  if not v_owner and (v_previous.branch_id is null or not public.user_has_branch_access(v_previous.branch_id)) then
   raise exception 'Source staff branch outside caller scope' using errcode='42501';
  end if;
  if v_previous.linked_user_id is distinct from p_new_user_id
     or v_previous.linked_user_id is distinct from (p_expected_previous_staff->>'linked_user_id')::uuid
     or v_previous.updated_at is distinct from (p_expected_previous_staff->>'updated_at')::timestamptz then
   raise exception 'Source staff link changed; refresh before retry' using errcode='PT409';
  end if;
  if v_staff.linked_user_id is not null then
   raise exception 'Move destination already linked' using errcode='23505';
  end if;
 end if;
 if p_apply_role and (p_new_user_id is null or p_new_role is null) then
  raise exception 'Target account and role required' using errcode='22004';
 end if;
 if p_new_user_id is not null then
  -- The Auth-row lock serializes eligibility with ban/delete writers.
  perform 1 from auth.users where id=p_new_user_id and deleted_at is null
   and (banned_until is null or banned_until<=clock_timestamp()) for share;
  if not found then raise exception 'Target account unavailable' using errcode='23514'; end if;
  select default_branch_id into v_target_branch from public.profiles where id=p_new_user_id for update;
  if not found then raise exception 'Target account profile not found' using errcode='23503'; end if;
  select tenant_id into v_target_tenant from public.branches where id=v_staff.branch_id;
  if not v_owner and (exists (
    select 1 from public.staff_branches sb join public.branches b on b.id=sb.branch_id
     where sb.user_id=p_new_user_id and b.tenant_id is distinct from v_target_tenant
   ) or exists (select 1 from public.branches where id=v_target_branch and tenant_id is distinct from v_target_tenant)) then
   raise exception 'Target account belongs to another tenant' using errcode='42501';
  end if;
  if exists(select 1 from public.staff_profiles where linked_user_id=p_new_user_id
     and id<>p_staff_id and id is distinct from p_previous_staff_id and deleted_at is null) then
   raise exception 'Target account already linked' using errcode='23505';
  end if;
 end if;
 -- Recheck after all row waits, before any side effect.
 if not coalesce(zmedico_security.session_is_active(),false)
    or not public.has_permission(v_actor,'settings.edit') then
  raise exception 'Staff-account authority no longer active' using errcode='42501';
 end if;
 v_owner := public.has_role(v_actor,'system_owner'::public.app_role);
 if not v_owner and (not public.user_has_branch_access(v_staff.branch_id)
    or (p_previous_staff_id is not null and not public.user_has_branch_access(v_previous.branch_id))) then
  raise exception 'Staff branch authority withdrawn while waiting' using errcode='42501';
 end if;
 if p_new_user_id is not null and not v_owner
    and public.has_role(p_new_user_id,'system_owner'::public.app_role) then
  raise exception 'Only a System Owner may link a System Owner account' using errcode='42501';
 end if;
 v_old_user := v_staff.linked_user_id;
 if v_old_user is not null and v_old_user is distinct from p_new_user_id then
  perform public.settings_assign_user_role(v_old_user,null::public.app_role,null::uuid);
 end if;
 if p_previous_staff_id is not null then
  update public.staff_profiles set linked_user_id=null,updated_at=clock_timestamp() where id=p_previous_staff_id;
  insert into public.audit_logs(user_id,branch_id,action,entity_type,entity_id,old_values,new_values)
   values(v_actor,v_previous.branch_id,'employee_unlinked','user_employee_link',p_new_user_id,
    jsonb_build_object('staff_id',p_previous_staff_id,'linked_user_id',p_new_user_id),
    jsonb_build_object('staff_id',p_previous_staff_id,'linked_user_id',null,'moved_to',p_staff_id));
 end if;
 update public.staff_profiles set linked_user_id=p_new_user_id,updated_at=clock_timestamp() where id=p_staff_id;
 if p_apply_role then
  -- Link trigger establishes membership before the canonical role writer.
  perform public.settings_assign_user_role(p_new_user_id,p_new_role,null::uuid);
 end if;
 v_action := case when v_old_user is null and p_new_user_id is not null then 'employee_linked'
  when v_old_user is not null and p_new_user_id is null then 'employee_unlinked'
  when v_old_user is distinct from p_new_user_id then 'employee_replaced' else 'employee_link_reaffirmed' end;
 insert into public.audit_logs(user_id,branch_id,action,entity_type,entity_id,old_values,new_values)
 values(v_actor,v_staff.branch_id,v_action,'user_employee_link',coalesce(p_new_user_id,v_old_user,p_staff_id),
  jsonb_build_object('staff_id',p_staff_id,'employee_id',v_staff.employee_id,'linked_user_id',v_old_user),
  jsonb_build_object('staff_id',p_staff_id,'linked_user_id',p_new_user_id,'moved_from',p_previous_staff_id,'role_applied',p_apply_role));
 return jsonb_build_object('staff_id',p_staff_id,'previous_user_id',v_old_user,'linked_user_id',p_new_user_id,'action',v_action);
end $function$;
revoke all on function public.hr_manage_staff_user_link(uuid,uuid,jsonb,uuid,jsonb,public.app_role,boolean) from public,anon,service_role;
grant execute on function public.hr_manage_staff_user_link(uuid,uuid,jsonb,uuid,jsonb,public.app_role,boolean) to authenticated;

-- Preserve profile edits but route client link changes through the transaction.
create function zmedico_security.guard_staff_account_link() returns trigger language plpgsql set search_path='' as $function$
begin
 if current_user in ('authenticated','anon') and
  ((TG_OP='INSERT' and NEW.linked_user_id is not null) or
   (TG_OP='UPDATE' and NEW.linked_user_id is distinct from OLD.linked_user_id)) then
  raise exception 'Use staff-account lifecycle operation' using errcode='42501';
 end if;
 return NEW;
end $function$;
revoke all on function zmedico_security.guard_staff_account_link() from public,anon,authenticated,service_role;
create trigger guard_staff_account_link before insert or update of linked_user_id on public.staff_profiles
 for each row execute function zmedico_security.guard_staff_account_link();

drop policy if exists roles_admin_write on public.user_roles;
drop policy if exists roles_admin_update_delete on public.user_roles;
drop policy if exists roles_admin_manage on public.user_roles;
revoke insert,update,delete on public.user_roles from authenticated;
