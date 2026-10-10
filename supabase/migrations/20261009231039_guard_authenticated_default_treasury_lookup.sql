-- ZMED-201: an existing invoker payment trigger calls this definer helper.
-- Authorize the existing scalar lookup before restoring its exact EXECUTE grant.
do $preflight$
begin
  if md5(pg_get_functiondef('public.default_treasury_for_branch(uuid)'::regprocedure))
    is distinct from '7997e5b68169c179817b122ffa27fb38' then
    raise exception 'Default treasury helper drift: review before applying';
  end if;
end;
$preflight$;

create or replace function public.default_treasury_for_branch(_branch_id uuid)
returns uuid language plpgsql security definer set search_path='' as $function$
declare
  v_actor uuid:=auth.uid();
  v_claim_role text:=coalesce(auth.jwt()->>'role','');
  v_sql_role text:=coalesce(current_setting('role',true),'none');
  v_trusted_internal boolean;
  v_treasury uuid;
begin
  -- Neither user_metadata nor current_user (always the definer) grants trust.
  v_trusted_internal:=(v_claim_role='service_role' and v_sql_role='service_role')
    or (v_claim_role='' and session_user in ('postgres','supabase_admin')
      and v_sql_role in ('none','postgres','supabase_admin'));
  if not v_trusted_internal then
    if v_actor is null then raise exception 'Authentication required' using errcode='42501';end if;
    if not (
      public.has_permission(v_actor,'invoices.create')
      or public.has_permission(v_actor,'expenses.create')
      or public.has_permission(v_actor,'expenses.view')
      or public.has_permission(v_actor,'treasury.view')
      or public.has_permission(v_actor,'treasury.tx.write')
      or public.has_role(v_actor,'accountant'::public.app_role)
      or public.has_role(v_actor,'manager'::public.app_role)
    ) then raise exception 'Financial permission required' using errcode='42501';end if;
    if _branch_id is null or not public.user_has_branch_access(_branch_id) then
      raise exception 'Default treasury outside caller scope' using errcode='42501';
    end if;
  end if;
  select t.id into v_treasury from public.treasury t
    where t.branch_id=_branch_id and t.is_active and t.deleted_at is null
    order by t.created_at,t.id limit 1;
  return v_treasury;
end;
$function$;
revoke all on function public.default_treasury_for_branch(uuid) from public,anon;
grant execute on function public.default_treasury_for_branch(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
