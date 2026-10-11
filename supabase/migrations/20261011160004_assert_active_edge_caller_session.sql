-- ZMED-185 phase 1: dependency for the reviewed normal-user Edge entry guards.
-- Production candidate for rqcmnfzfytyyicelvifk only; NOT a global API/RLS hook.
-- No role/permission, financial, Storage, Realtime or pre-request config changes.
-- The private definer only reads protected Auth metadata for the caller's own
-- validated user/session pair; it does not grant business-data privileges.
do $preflight$
begin
  if to_regnamespace('zmedico_security') is not null
     or to_regprocedure('public.assert_active_session()') is not null then
    raise exception 'Session assertion objects already exist; review before applying';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='is_anonymous')
     or not exists (select 1 from information_schema.columns
    where table_schema='auth' and table_name='sessions' and column_name='not_after') then
    raise exception 'Required Auth metadata contract unavailable';
  end if;
end;
$preflight$;

create schema zmedico_security;
revoke all on schema zmedico_security from public, anon, authenticated, service_role;
grant usage on schema zmedico_security to authenticated;

create function zmedico_security.session_is_active()
returns boolean language sql stable security definer set search_path = ''
as $guard$
  with claims as (select auth.jwt() as jwt)
  select case
    when current_setting('role', true) = 'authenticated'
      and jwt->>'role' = 'authenticated'
      and jwt->>'iss' = 'https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1'
      and jwt->>'sub' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jwt->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jwt->>'exp' ~ '^[0-9]{1,11}$'
    then (case when jwt->>'exp' ~ '^[0-9]{1,11}$'
      then (jwt->>'exp')::bigint else 0 end) > extract(epoch from statement_timestamp())
      and exists (
        select 1 from auth.users u
        join auth.sessions s on s.user_id = u.id
        -- Each cast has its own guard: the planner can evaluate a subquery
        -- before its enclosing CASE, so outer validation alone is not enough.
        where u.id = case when jwt->>'sub' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then auth.uid() else null end
          and s.id = case when jwt->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (jwt->>'session_id')::uuid else null end
          and u.deleted_at is null
          and not coalesce(u.is_anonymous, false)
          and (u.banned_until is null or u.banned_until <= statement_timestamp())
          and (s.not_after is null or s.not_after > statement_timestamp())
      )
    else false
  end from claims;
$guard$;
revoke all on function zmedico_security.session_is_active() from public, anon, authenticated, service_role;
grant execute on function zmedico_security.session_is_active() to authenticated;

create function public.assert_active_session()
returns void language plpgsql security invoker set search_path = ''
as $assertion$
begin
  if current_user <> 'authenticated' or not coalesce(zmedico_security.session_is_active(), false) then
    raise exception 'Authentication session is no longer active' using errcode='42501';
  end if;
end;
$assertion$;
revoke all on function public.assert_active_session() from public, anon, authenticated, service_role;
grant execute on function public.assert_active_session() to authenticated;
notify pgrst, 'reload schema';
