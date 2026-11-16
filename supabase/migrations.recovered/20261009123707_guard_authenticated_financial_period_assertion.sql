-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261009123707
-- name: guard_authenticated_financial_period_assertion
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Payment's SECURITY INVOKER trigger calls this existing SECURITY DEFINER
-- helper. Previous grant hardening revoked authenticated EXECUTE and broke
-- ordinary payment inserts. Do not elevate the trigger or expose an unguarded
-- definer RPC: authorize the existing helper before granting its exact signature.
do $preflight$
begin
  if md5(pg_get_functiondef('public._treasury_assert_open_period(uuid,uuid,date)'::regprocedure))
     is distinct from '4a445f0142394584a077ce7b72a27503' then
    raise exception 'Financial-period helper definition drift: review before applying';
  end if;
end;
$preflight$;

create or replace function public._treasury_assert_open_period(
  _branch_id uuid, _treasury_id uuid, _business_date date
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt()->>'role', '');
  v_trusted_internal boolean;
  v_scope_branch uuid := _branch_id;
  v_treasury_branch uuid;
  v_last_close date;
begin
  -- Preserve already-privileged server/maintenance callers; never infer this
  -- from user-editable user_metadata. Normal API calls use actual user JWTs.
  v_trusted_internal := v_role = 'service_role'
    or (v_role = '' and session_user in ('postgres','supabase_admin'));
  if not v_trusted_internal then
    if v_actor is null then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    if not (
      public.has_permission(v_actor, 'invoices.create')
      or public.has_permission(v_actor, 'expenses.create')
      or public.has_permission(v_actor, 'treasury.tx.write')
      or public.has_role(v_actor, 'accountant'::public.app_role)
    ) then
      raise exception 'Financial permission required' using errcode = '42501';
    end if;
    if _branch_id is not null and not public.user_has_branch_access(_branch_id) then
      raise exception 'Financial period outside caller scope' using errcode = '42501';
    end if;
  end if;

  if _treasury_id is not null then
    select t.branch_id into v_treasury_branch
    from public.treasury t
    where t.id = _treasury_id and t.deleted_at is null;
    if not found then
      raise exception 'Treasury not found' using errcode = '23503';
    end if;
    if _branch_id is not null and _branch_id is distinct from v_treasury_branch then
      raise exception 'Treasury and branch do not match' using errcode = '42501';
    end if;
    v_scope_branch := v_treasury_branch;
  end if;
  if not v_trusted_internal and (
    v_scope_branch is null or not public.user_has_branch_access(v_scope_branch)
  ) then
    raise exception 'Financial period outside caller scope' using errcode = '42501';
  end if;

  if _business_date is null then return; end if;
  select max(c.business_date) into v_last_close
  from public.treasury_daily_closes c
  where (_treasury_id is not null and c.treasury_id = _treasury_id)
     or (_treasury_id is null and v_scope_branch is not null and c.branch_id = v_scope_branch);
  if v_last_close is not null and _business_date <= v_last_close then
    raise exception 'Financial period is closed' using errcode = '23514';
  end if;
end;
$function$;

revoke all on function public._treasury_assert_open_period(uuid,uuid,date)
from public, anon;
grant execute on function public._treasury_assert_open_period(uuid,uuid,date)
to authenticated, service_role;
notify pgrst, 'reload schema';

