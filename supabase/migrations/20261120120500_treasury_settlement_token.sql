-- Settlement is the only path allowed to move cash out of a custody drawer
-- whose shift is closed and unsettled. The guard in the previous migration
-- reads a transaction-local token; this migration sets that token only inside
-- the settlement core, not for a generic transfer.
--
-- The existing settlement body is kept intact by renaming it to *_base and
-- wrapping it. This avoids copying the accounting logic into a second place.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter function public._fn_treasury_shift_settle_locked(
  public.treasury_shifts, public.treasury, public.treasury, text
) rename to _fn_treasury_shift_settle_locked_base;

create function public._fn_treasury_shift_settle_locked(
  _shift public.treasury_shifts,
  _drawer public.treasury,
  _parent public.treasury,
  _notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- transaction-local: the guard sees these settings only for the transfer
  -- posted by the settlement core in this same transaction.
  perform set_config('app.treasury_settle_shift', _shift.id::text, true);
  perform set_config('app.allow_treasury_shift_settle', 'on', true);
  return public._fn_treasury_shift_settle_locked_base(_shift, _drawer, _parent, _notes);
end;
$function$;

revoke all on function public._fn_treasury_shift_settle_locked(
  public.treasury_shifts, public.treasury, public.treasury, text
) from public, anon, authenticated, service_role;

commit;
