-- ZMED-270: all role-table writers, including privileged Edge cleanup.
-- Reviewed individual release only. No existing role/account is changed.
set local lock_timeout='2s';
set local statement_timeout='30s';
do $preflight$ begin
 if md5(pg_get_functiondef('public.settings_assign_user_role(uuid,public.app_role,uuid)'::regprocedure)) <> 'e14edc923706705b7c6cbc43865f1e80' then
  raise exception 'Reviewed ZMED-258 role writer required' using errcode='55000';
 end if;
 if to_regclass('zmedico_security.system_owner_invariant') is not null then
  raise exception 'Owner invariant already exists; reconcile release' using errcode='55000';
 end if;
end $preflight$;

-- A statement trigger takes the canonical administrative lock BEFORE row locks.
-- Taking it in a row trigger would invert canonical-writer/Edge lock ordering.
lock table public.user_roles in share row exclusive mode;
create table zmedico_security.system_owner_invariant(
 singleton boolean primary key default true check(singleton),
 owner_count bigint not null check(owner_count>=0)
);
alter table zmedico_security.system_owner_invariant enable row level security;
revoke all on table zmedico_security.system_owner_invariant from public,anon,authenticated,service_role;
insert into zmedico_security.system_owner_invariant(singleton,owner_count)
 select true,count(*) from public.user_roles where role='system_owner';
do $seed$ begin
 if (select owner_count from zmedico_security.system_owner_invariant where singleton)<1 then
  raise exception 'No existing System Owner; reviewed recovery required' using errcode='55000';
 end if;
end $seed$;

create function zmedico_security.lock_role_writers() returns trigger
language plpgsql set search_path='' as $function$
begin
 if TG_OP='TRUNCATE' then
  raise exception 'Use audited role operations; role-table truncation is forbidden' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(20781001,1);
 return null;
end $function$;
revoke all on function zmedico_security.lock_role_writers() from public,anon,authenticated,service_role;

create function zmedico_security.track_system_owner_count() returns trigger
language plpgsql security definer set search_path='' as $function$
declare v_delta integer:=0;
begin
 if TG_OP in ('UPDATE','DELETE') then
  if OLD.role='system_owner'::public.app_role then v_delta:=v_delta-1;end if;
 end if;
 if TG_OP in ('INSERT','UPDATE') then
  if NEW.role='system_owner'::public.app_role then v_delta:=v_delta+1;end if;
 end if;
 if v_delta<>0 then
  update zmedico_security.system_owner_invariant set owner_count=owner_count+v_delta where singleton;
  if not found then raise exception 'Owner invariant state missing' using errcode='55000';end if;
 end if;
 return null;
end $function$;
revoke all on function zmedico_security.track_system_owner_count() from public,anon,authenticated,service_role;

-- This private row update also produces a serialization conflict for an older
-- REPEATABLE READ snapshot; a stale role-count SELECT cannot permit owner loss.
-- Deferred checking permits canonical DELETE+INSERT owner reaffirmation.
create function zmedico_security.check_system_owner_count() returns trigger
language plpgsql security definer set search_path='' as $function$
declare v_count bigint;v_actual bigint;
begin
 select owner_count into v_count from zmedico_security.system_owner_invariant where singleton;
 if v_count is null then raise exception 'Owner invariant state missing' using errcode='55000';end if;
 if v_count<1 then
  raise exception 'The last System Owner must remain' using errcode='PT409';
 end if;
 select count(*) into v_actual from public.user_roles where role='system_owner';
 if v_actual<>v_count then
  raise exception 'Owner invariant state drift; review required' using errcode='55000';
 end if;
 return null;
end $function$;
revoke all on function zmedico_security.check_system_owner_count() from public,anon,authenticated,service_role;

create trigger lock_role_writers before insert or update or delete or truncate on public.user_roles
 for each statement execute function zmedico_security.lock_role_writers();
create trigger track_system_owner_count after insert or update or delete on public.user_roles
 for each row execute function zmedico_security.track_system_owner_count();
create constraint trigger check_system_owner_count after update on zmedico_security.system_owner_invariant
 deferrable initially deferred for each row execute function zmedico_security.check_system_owner_count();
