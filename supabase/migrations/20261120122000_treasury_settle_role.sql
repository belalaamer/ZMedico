-- Separate the custody settlement duty from cash collection.
--
-- Reception holds treasury.tx.write because it posts the payment-derived
-- ledger row; that must not also let reception settle a drawer. Accountant
-- gets treasury.shift.settle instead, and settlement elevates treasury.tx.write
-- only for the duration of its own transaction, after the permission check.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into public.authz_permissions
  (key, group_key, display_name, description, risk_level, default_scope, introduced_in)
values
  ('treasury.shift.settle', 'treasury',
   'Settle a closed custody shift',
   'Move a closed drawer count into the parent treasury and post its variance once.',
   'high', 'branch', 'PR-7')
on conflict (key) do update
  set deprecated = false,
      display_name = excluded.display_name,
      description = excluded.description,
      updated_at = now();

insert into public.authz_bundle_permissions (bundle_key, permission_key)
values
  ('bundle.role.accountant', 'treasury.shift.settle'),
  ('bundle.role.admin', 'treasury.shift.settle')
on conflict (bundle_key, permission_key) do nothing;

-- Scoped elevation: has_permission(tx.write) is true only while the settlement
-- wrapper has set this transaction-local token and the caller actually holds
-- treasury.shift.settle. A direct add_treasury_tx / transfer call has no token.
create or replace function public.has_permission(_user_id uuid, _permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  SELECT public._authz_probe_allowed(_user_id)
     AND (
       public._has_permission_core(_user_id, _permission_key)
       OR (
         _permission_key = 'treasury.tx.write'
         AND current_setting('app.allow_treasury_shift_settle', true) = 'on'
         AND public._has_permission_core(_user_id, 'treasury.shift.settle')
       )
     );
$$;

-- Keep the old body as an internal base, then gate it behind the new duty.
alter function public.fn_treasury_shift_settle(uuid, text)
  rename to fn_treasury_shift_settle_base;

create function public.fn_treasury_shift_settle(
  _treasury_id uuid,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if not coalesce(zmedico_security.session_is_active(), false) then
    raise exception 'Authentication session is no longer active' using errcode = '42501';
  end if;
  if v_actor is null
     or not public.has_permission(v_actor, 'treasury.shift.settle')
     or not public.has_permission(v_actor, 'treasury.shift.use') then
    raise exception 'Forbidden: missing permission treasury.shift.settle' using errcode = '42501';
  end if;
  perform set_config('app.allow_treasury_shift_settle', 'on', true);
  return public.fn_treasury_shift_settle_base(_treasury_id, _notes);
end;
$function$;

revoke all on function public.fn_treasury_shift_settle_base(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_treasury_shift_settle(uuid, text)
  from public, anon;
grant execute on function public.fn_treasury_shift_settle(uuid, text)
  to authenticated, service_role;

-- The combined close-and-settle endpoint must not be a back door around the
-- two-step duty split. It remains available to callers holding the settlement
-- permission; it refuses reception before it reaches the internal close core.
create or replace function public.fn_treasury_shift_close_and_settle(
  _treasury_id uuid,
  _closing_counted numeric,
  _handed_over_to uuid,
  _notes text,
  _request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if _request_id is null then
    raise exception 'A close request id is required for idempotent close-and-settle'
      using errcode = '22023';
  end if;
  if not coalesce(zmedico_security.session_is_active(), false) then
    raise exception 'Authentication session is no longer active' using errcode = '42501';
  end if;
  if v_actor is null
     or not public.has_permission(v_actor, 'treasury.shift.settle')
     or not public.has_permission(v_actor, 'treasury.shift.use') then
    raise exception 'Forbidden: missing permission treasury.shift.settle' using errcode = '42501';
  end if;
  perform set_config('app.allow_treasury_shift_settle', 'on', true);
  return public._fn_treasury_shift_close_and_settle_internal(
    _treasury_id, _closing_counted, _handed_over_to, _notes, _request_id
  );
end;
$function$;

create or replace function public.fn_treasury_shift_close_and_settle(
  _treasury_id uuid,
  _closing_counted numeric,
  _handed_over_to uuid default null,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if not coalesce(zmedico_security.session_is_active(), false) then
    raise exception 'Authentication session is no longer active' using errcode = '42501';
  end if;
  if v_actor is null
     or not public.has_permission(v_actor, 'treasury.shift.settle')
     or not public.has_permission(v_actor, 'treasury.shift.use') then
    raise exception 'Forbidden: missing permission treasury.shift.settle' using errcode = '42501';
  end if;
  perform set_config('app.allow_treasury_shift_settle', 'on', true);
  return public._fn_treasury_shift_close_and_settle_internal(
    _treasury_id, _closing_counted, _handed_over_to, _notes, null
  );
end;
$function$;

revoke all on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text)
  from public, anon;
revoke all on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text, uuid)
  from public, anon;
grant execute on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text)
  to authenticated, service_role;
grant execute on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text, uuid)
  to authenticated, service_role;

commit;
