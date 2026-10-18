-- ZMED-273: preserve a usable owner across role, staff and Auth writers.
-- Individually reviewed release; no existing account/status/role is repaired.
set local lock_timeout='2s';
set local statement_timeout='30s';
do $dependency$ begin
 if md5(pg_get_functiondef('public.settings_assign_user_role(uuid,public.app_role,uuid)'::regprocedure))<>'e14edc923706705b7c6cbc43865f1e80' then
  raise exception 'Reviewed canonical role writer required' using errcode='55000';
 end if;
 if to_regclass('zmedico_security.system_owner_invariant') is null
 or to_regprocedure('zmedico_security.check_system_owner_count()') is null then
  raise exception 'Reviewed all-writer owner-role invariant required' using errcode='55000';
 end if;
 if to_regclass('zmedico_security.usable_owner_revision') is not null
 or to_regprocedure('zmedico_security.has_usable_system_owner()') is not null then
  raise exception 'Usable-owner boundary already exists; reconcile release' using errcode='55000';
 end if;
 if not pg_catalog.pg_try_advisory_xact_lock(20781001,1) then
  raise exception 'Administrative writer active; retry reviewed migration later' using errcode='55P03';
 end if;
end $dependency$;
-- Fail immediately if an existing Auth/staff/role writer owns a table lock.
-- Do not hold the global lock while waiting on an older Auth cascade.
lock table auth.users,public.staff_profiles,public.user_roles in share row exclusive mode nowait;
do $counter$ begin
 if (select count(*) from zmedico_security.system_owner_invariant)<>1
 or (select owner_count from zmedico_security.system_owner_invariant where singleton)
    is distinct from (select count(*) from public.user_roles where role='system_owner') then
  raise exception 'Owner counter drift; review required' using errcode='55000';
 end if;
end $counter$;

-- Availability matches the ZMED-271 user/staff predicates, not active sessions:
-- owners may log out normally and sign in again.
create function zmedico_security.has_usable_system_owner() returns boolean
language sql stable security definer set search_path='' as $fn$
 select exists (
  select 1 from public.user_roles r join auth.users u on u.id=r.user_id
  where r.role='system_owner'::public.app_role
    and u.deleted_at is null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<=statement_timestamp())
    and not exists(select 1 from public.staff_profiles sp
      where (sp.linked_user_id=u.id or
        (sp.linked_user_id is null and sp.id=u.id and not exists
          (select 1 from public.staff_profiles explicit_link where explicit_link.linked_user_id=u.id)))
        and sp.status in ('suspended'::public.staff_status,'terminated'::public.staff_status))
 );
$fn$;
revoke all on function zmedico_security.has_usable_system_owner() from public,anon,authenticated,service_role;
do $preflight$ begin
 if to_regclass('zmedico_security.system_owner_invariant') is null then
  raise exception 'Reviewed owner-role invariant required' using errcode='55000';
 end if;
 if not zmedico_security.has_usable_system_owner() then
  raise exception 'No usable System Owner; reviewed recovery required' using errcode='55000';
 end if;
end $preflight$;

create table zmedico_security.usable_owner_revision(
 singleton boolean primary key default true check(singleton),
 revision bigint not null default 0
);
alter table zmedico_security.usable_owner_revision enable row level security;
revoke all on table zmedico_security.usable_owner_revision from public,anon,authenticated,service_role;
insert into zmedico_security.usable_owner_revision(singleton) values(true);

create function zmedico_security.lock_owner_availability_writers() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if TG_OP='TRUNCATE' then
  raise exception 'Audited account operations required' using errcode='42501';
 end if;
 -- Same lock as canonical role/link/deletion writers; before business row locks.
 perform pg_catalog.pg_advisory_xact_lock(20781001,1);
 -- A real write makes stale REPEATABLE READ snapshots fail serialization.
 update zmedico_security.usable_owner_revision set revision=revision+1 where singleton;
 if not found then raise exception 'Usable owner revision missing' using errcode='55000';end if;
 return null;
end $fn$;
revoke all on function zmedico_security.lock_owner_availability_writers() from public,anon,authenticated,service_role;

create function zmedico_security.check_usable_system_owner() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if not zmedico_security.has_usable_system_owner() then
  raise exception 'The last usable System Owner must remain' using errcode='PT409';
 end if;
 return null;
end $fn$;
revoke all on function zmedico_security.check_usable_system_owner() from public,anon,authenticated,service_role;
create constraint trigger check_usable_system_owner after update on zmedico_security.usable_owner_revision
 deferrable initially deferred for each row execute function zmedico_security.check_usable_system_owner();

create trigger lock_owner_availability_roles before insert or update or delete or truncate on public.user_roles
 for each statement execute function zmedico_security.lock_owner_availability_writers();
create trigger lock_owner_availability_staff_status before update of status,linked_user_id on public.staff_profiles
 for each statement execute function zmedico_security.lock_owner_availability_writers();
create trigger lock_owner_availability_staff_rows before insert or delete or truncate on public.staff_profiles
 for each statement execute function zmedico_security.lock_owner_availability_writers();
create trigger lock_owner_availability_auth_status before update of banned_until,deleted_at,is_anonymous on auth.users
 for each statement execute function zmedico_security.lock_owner_availability_writers();
create trigger lock_owner_availability_auth_rows before delete or truncate on auth.users
 for each statement execute function zmedico_security.lock_owner_availability_writers();
