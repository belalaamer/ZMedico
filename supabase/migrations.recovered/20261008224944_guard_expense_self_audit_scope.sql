-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261008224944
-- name: guard_expense_self_audit_scope
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

do $migration$
declare
 v_definition text; v_body text; v_guarded_body text; v_begin integer;
 v_guard text := $guard$
  if coalesce(auth.jwt()->>'role', '') = 'service_role'
     or (coalesce(auth.jwt()->>'role', '') = ''
         and session_user in ('postgres', 'supabase_admin')
         and coalesce(current_setting('role', true), 'none') in ('none', '')) then
    null;
  else
    if v_user is null
       or not (public.has_role(v_user, 'admin'::public.app_role)
               or public.has_role(v_user, 'system_owner'::public.app_role)) then
      raise exception 'Administrator role required for financial self-audit' using errcode = '42501';
    end if;
    if not public.has_role(v_user, 'system_owner'::public.app_role)
       and (_branch_id is null or not public.user_has_branch_access(_branch_id)) then
      raise exception 'Financial self-audit branch is outside caller scope' using errcode = '42501';
    end if;
  end if;
$guard$;
begin
 select pg_get_functiondef(p.oid), p.prosrc into v_definition, v_body
 from pg_proc p where p.oid = 'public.expense_treasury_self_audit(uuid)'::regprocedure;
 if md5(v_definition) is distinct from 'a7113cbf4ca380c397a9371e354c4d15' then
  raise exception 'Financial audit definition drifted; review before applying';
 end if;
 v_begin := strpos(v_body, 'BEGIN');
 if v_begin = 0 then raise exception 'Expected financial audit body not found'; end if;
 v_guarded_body := left(v_body, v_begin + 4) || v_guard || substr(v_body, v_begin + 5);
 execute replace(v_definition, v_body, v_guarded_body);
end;
$migration$;
revoke all on function public.expense_treasury_self_audit(uuid) from public, anon;
grant execute on function public.expense_treasury_self_audit(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
