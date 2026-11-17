-- PR-4/6: settlement-aware treasury shift RPCs.
--
-- This migration adds two RPCs, makes the close lock order match settlement,
-- and relaxes the closed-shift immutability guard so a signed close can receive
-- its one-time settlement facts. It does not delete rows, tables, columns, or
-- historical ledger entries.
--
-- Canonical lock order:
--   1. the advisory lock keyed by the shift id (the same key used by
--      transfer_treasury_funds),
--   2. the shift row,
--   3. treasury rows in UUID order,
--   4. re-read and revalidate all metadata after the locks.
--
-- close, settle, and close-and-settle read the shift id without a lock, take
-- the advisory reference, then lock the shift row and revalidate it. Transfer
-- has no shift row and is the shorter advisory -> treasury prefix. No path
-- takes a treasury row before the advisory lock, or a shift row after one.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. allow the zero-drawer settlement edge
-- ---------------------------------------------------------------------------

-- A shift with expected 0 and counted 0 has no money to move, so there is no
-- treasury transaction to point at. Every other settled shift still requires
-- settlement_tx_id. This is a forward relaxation, not a reverse migration.
alter table public.treasury_shifts
  drop constraint if exists treasury_shift_status_shape;

alter table public.treasury_shifts
  add constraint treasury_shift_status_shape check (
    (status = 'open'
      and closed_at is null
      and settled_at is null)
    or
    (status = 'closed'
      and closed_at is not null
      and settled_at is null)
    or
    (status in ('settled','handed_over')
      and closed_at is not null
      and settled_at is not null
      and (
        settlement_tx_id is not null
        or (expected_closing = 0 and closing_counted = 0)
      ))
  );

-- Idempotency identity for the close-and-settle wrapper. Null means a call
-- made through the old 4-argument signature, which deliberately has no retry.
alter table public.treasury_shifts
  add column if not exists close_request_id uuid;

create unique index if not exists treasury_shifts_close_request_uq
  on public.treasury_shifts(treasury_id, close_request_id)
  where close_request_id is not null;

-- ---------------------------------------------------------------------------
-- 2. signed shifts accept settlement once, and nothing after it
-- ---------------------------------------------------------------------------

create or replace function public._tg_treasury_shift_immutable()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'treasury_shifts rows are permanent -- a till handover is never erased (op=%)', TG_OP
      using errcode = '23514';
  end if;

  -- A signed close is final. The one permitted follow-up is the settlement
  -- that records where the counted drawer went and what variance it carried.
  if old.closed_at is not null then
    if old.settled_at is not null then
      raise exception 'a settled shift is permanent -- settlement cannot be rewritten'
        using errcode = '23514';
    end if;
    if coalesce(current_setting('app.allow_treasury_shift_settle', true), '') <> 'on' then
      raise exception 'a signed shift can only receive its settlement facts'
        using errcode = '23514';
    end if;
    if new.settled_at is null then
      raise exception 'settlement must set settled_at'
        using errcode = '23514';
    end if;
    if new.settlement_tx_id is null
       and not (new.expected_closing = 0 and new.closing_counted = 0) then
      raise exception 'settlement must carry a transaction unless the drawer is zero'
        using errcode = '23514';
    end if;
    if new.branch_id         is distinct from old.branch_id
       or new.treasury_id     is distinct from old.treasury_id
       or new.opened_at       is distinct from old.opened_at
       or new.opened_by       is distinct from old.opened_by
       or new.custodian_user_id is distinct from old.custodian_user_id
       or new.opening_counted is distinct from old.opening_counted
       or new.opening_book    is distinct from old.opening_book
       or new.inherited_from  is distinct from old.inherited_from
       or new.inherited_counted is distinct from old.inherited_counted
       or new.closed_at       is distinct from old.closed_at
       or new.closed_by       is distinct from old.closed_by
       or new.expected_closing is distinct from old.expected_closing
       or new.closing_counted is distinct from old.closing_counted
       or new.handed_over_to  is distinct from old.handed_over_to
       or new.close_request_id is distinct from old.close_request_id
       or new.notes           is distinct from old.notes then
      raise exception 'settlement can only add settlement facts'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if coalesce(current_setting('app.allow_treasury_shift_close', true), '') <> 'on' then
    raise exception 'treasury_shifts can only be changed through fn_treasury_shift_close'
      using errcode = '23514';
  end if;
  if new.branch_id         is distinct from old.branch_id
     or new.treasury_id     is distinct from old.treasury_id
     or new.opened_at       is distinct from old.opened_at
     or new.opened_by       is distinct from old.opened_by
     or new.custodian_user_id is distinct from old.custodian_user_id
     or new.opening_counted is distinct from old.opening_counted
     or new.opening_book    is distinct from old.opening_book
     or new.inherited_from  is distinct from old.inherited_from
     or new.inherited_counted is distinct from old.inherited_counted
     or new.settled_at is not null
     or new.settlement_tx_id is not null
     or new.variance_tx_id is not null then
    raise exception 'an open shift keeps the count it was opened with'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public._tg_treasury_shift_immutable()
  from public, anon, authenticated;

-- The existing audit trigger records every close as close/handover. Settlement
-- is a distinct, supervisory event and must not look like a second close.
create or replace function public.audit_treasury_shift_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    perform public._audit_write(
      'treasury_shift', NEW.id, 'treasury_shift.open', NULL,
      jsonb_build_object(
        'treasury_id', NEW.treasury_id, 'branch_id', NEW.branch_id,
        'opening_counted', NEW.opening_counted, 'opening_book', NEW.opening_book,
        'opening_gap', NEW.opening_gap, 'inherited_counted', NEW.inherited_counted,
        'opening_variance', NEW.opening_variance, 'opened_by', NEW.opened_by
      ),
      NEW.branch_id, NEW.opened_by
    );
    return NEW;
  end if;

  if OLD.settled_at is null and NEW.settled_at is not null then
    perform public._audit_write(
      'treasury_shift', NEW.id, 'treasury_shift.settle',
      jsonb_build_object(
        'closed_at', OLD.closed_at, 'expected_closing', OLD.expected_closing,
        'closing_counted', OLD.closing_counted, 'variance', OLD.variance
      ),
      jsonb_build_object(
        'treasury_id', NEW.treasury_id, 'settled_at', NEW.settled_at,
        'settlement_tx_id', NEW.settlement_tx_id,
        'variance_tx_id', NEW.variance_tx_id,
        'closed_by', NEW.closed_by, 'handed_over_to', NEW.handed_over_to
      ),
      NEW.branch_id, auth.uid()
    );
    return NEW;
  end if;

  perform public._audit_write(
    'treasury_shift', NEW.id,
    case when NEW.handed_over_to is not null then 'treasury_shift.handover' else 'treasury_shift.close' end,
    jsonb_build_object('closed_at', OLD.closed_at, 'closing_counted', OLD.closing_counted),
    jsonb_build_object(
      'treasury_id', NEW.treasury_id, 'expected_closing', NEW.expected_closing,
      'closing_counted', NEW.closing_counted, 'variance', NEW.variance,
      'closed_by', NEW.closed_by, 'handed_over_to', NEW.handed_over_to, 'notes', NEW.notes
    ),
    NEW.branch_id, NEW.closed_by
  );
  return NEW;
end;
$function$;

revoke all on function public.audit_treasury_shift_v1()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. replace close with the canonical lock order
-- ---------------------------------------------------------------------------

-- The public close signature and behaviour are unchanged. It reads the open
-- shift id without a lock, takes the advisory reference first, then locks the
-- shift row and the drawer. This is the same order the wrapper and settle use,
-- and transfer_treasury_funds is the shorter advisory -> treasury prefix.
create or replace function public.fn_treasury_shift_close(
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
  v_branch uuid;
  v_actor uuid := auth.uid();
  v_book numeric;
  v_shift_id uuid;
  v_shift public.treasury_shifts%rowtype;
begin
  v_branch := public._treasury_shift_authorize_treasury(_treasury_id, 'treasury.shift.use');

  if _closing_counted is null or _closing_counted::text in ('NaN','Infinity','-Infinity') then
    raise exception 'The counted amount must be a real amount' USING ERRCODE = '22023';
  end if;
  if _closing_counted < 0 then
    raise exception 'The counted amount cannot be negative' USING ERRCODE = '23514';
  end if;

  -- Read the id without a lock, then take the advisory lock it names, then
  -- lock the row and revalidate. The id can only be stale if another close won.
  select s.id into v_shift_id
    from public.treasury_shifts s
   where s.treasury_id = _treasury_id
     and s.closed_at is null
   order by s.opened_at desc
   limit 1;
  if v_shift_id is null then
    raise exception 'No open shift for this till' USING ERRCODE = '55000';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('treasury-transfer:' || v_shift_id::text, 0)
  );

  select * into v_shift
    from public.treasury_shifts s
   where s.id = v_shift_id
     and s.closed_at is null
     for update;
  if not found then
    raise exception 'No open shift for this till' USING ERRCODE = '55000';
  end if;

  select t.current_balance into v_book
    from public.treasury t
   where t.id = _treasury_id
     and t.branch_id = v_branch
     and t.deleted_at is null
     for update;
  if not found then
    raise exception 'Treasury not found' USING ERRCODE = '23503';
  end if;

  perform public._fn_treasury_shift_validate_handover(
    v_branch, _handed_over_to, v_actor
  );

  return public._fn_treasury_shift_close_locked(
    v_shift, v_book, _closing_counted, _handed_over_to, _notes, null
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3b. internal close core -- assumes advisory, shift, and drawer are locked
-- ---------------------------------------------------------------------------

create or replace function public._fn_treasury_shift_close_locked(
  _shift public.treasury_shifts,
  _book numeric,
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
begin
  perform set_config('app.allow_treasury_shift_close', 'on', true);

  update public.treasury_shifts s
     set expected_closing = s.opening_counted + _book - s.opening_book,
         closing_counted  = _closing_counted,
         closed_at        = statement_timestamp(),
         closed_by        = auth.uid(),
         handed_over_to   = _handed_over_to,
         notes            = coalesce(nullif(btrim(coalesce(_notes, '')), ''), s.notes),
         close_request_id = _request_id,
         updated_at       = statement_timestamp()
   where s.id = _shift.id;

  return _shift.id;
end;
$function$;

revoke all on function public._fn_treasury_shift_close_locked(
  public.treasury_shifts, numeric, numeric, uuid, text, uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3c. handover validation shared by close and the wrapper
-- ---------------------------------------------------------------------------

create or replace function public._fn_treasury_shift_validate_handover(
  _branch_id uuid,
  _handed_over_to uuid,
  _actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if _handed_over_to is null then
    return;
  end if;
  if _handed_over_to = _actor then
    raise exception 'Hand the drawer to another person, or close the till' USING ERRCODE = '23514';
  end if;
  if not exists (
    select 1
      from public.profiles p
      join public.staff_profiles sp on sp.linked_user_id = p.id
      join auth.users u on u.id = p.id
     where p.id = _handed_over_to
       and sp.branch_id = _branch_id
       and sp.deleted_at is null
       and u.deleted_at is null
       and sp.status not in ('suspended'::public.staff_status, 'terminated'::public.staff_status)
       and public.has_permission(_handed_over_to, 'treasury.shift.use')
  ) then
    raise exception 'The receiving person does not work this till' USING ERRCODE = '23503';
  end if;
end;
$function$;

revoke all on function public._fn_treasury_shift_validate_handover(uuid, uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. settle a closed drawer into its parent
-- ---------------------------------------------------------------------------

create or replace function public.fn_treasury_shift_settle(
  _treasury_id uuid,
  _notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_branch uuid;
  v_t public.treasury%rowtype;
  v_parent public.treasury%rowtype;
  v_parent_id uuid;
  v_shift_id uuid;
  v_shift public.treasury_shifts%rowtype;
begin
  v_branch := public._treasury_shift_authorize_treasury(_treasury_id, 'treasury.tx.write');

  select * into v_t
    from public.treasury t
   where t.id = _treasury_id and t.deleted_at is null;
  if not found then
    raise exception 'Treasury not found' using errcode = '23503';
  end if;
  if v_t.account_kind <> 'cash' then
    raise exception 'Only a cash drawer can be settled' using errcode = '23514';
  end if;
  if v_t.custodian_user_id is null or v_t.parent_treasury_id is null then
    raise exception 'Treasury is not a custody drawer' using errcode = '23514';
  end if;
  v_parent_id := v_t.parent_treasury_id;

  -- Read the id without a lock, then take the advisory reference, then lock
  -- and revalidate. This is the same order as close and the wrapper.
  select s.id into v_shift_id
    from public.treasury_shifts s
   where s.treasury_id = _treasury_id
     and s.closed_at is not null
   order by s.closed_at desc
   limit 1;
  if v_shift_id is null then
    raise exception 'No closed shift to settle for this drawer' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('treasury-transfer:' || v_shift_id::text, 0)
  );

  select * into v_shift
    from public.treasury_shifts s
   where s.id = v_shift_id
     and s.closed_at is not null
     for update;
  if not found then
    raise exception 'No closed shift to settle for this drawer' using errcode = '55000';
  end if;
  if v_shift.settled_at is not null then
    return v_shift.id;
  end if;

  perform 1
    from public.treasury t
   where t.id in (_treasury_id, v_parent_id)
     and t.deleted_at is null
   order by t.id
     for update;

  select * into v_t
    from public.treasury t
   where t.id = _treasury_id and t.branch_id = v_branch and t.deleted_at is null
     for update;
  if not found then
    raise exception 'Treasury not found after lock' using errcode = '23503';
  end if;
  if v_t.parent_treasury_id is distinct from v_parent_id then
    raise exception 'Drawer parent changed during settlement' using errcode = '23514';
  end if;
  if v_t.account_kind <> 'cash' or v_t.custodian_user_id is null then
    raise exception 'Treasury is no longer a cash custody drawer' using errcode = '23514';
  end if;

  select * into v_parent
    from public.treasury p
   where p.id = v_parent_id and p.deleted_at is null
     for update;
  if not found then
    raise exception 'Parent treasury not found after lock' using errcode = '23503';
  end if;
  if v_parent.branch_id <> v_branch
     or v_parent.account_kind <> 'cash'
     or v_parent.custodian_user_id is not null
     or v_parent.parent_treasury_id is not null then
    raise exception 'Parent must be a non-custody cash treasury in the same branch'
      using errcode = '23514';
  end if;
  if v_shift.custodian_user_id <> v_t.custodian_user_id then
    raise exception 'Shift custodian does not match the drawer custodian'
      using errcode = '23514';
  end if;

  return public._fn_treasury_shift_settle_locked(v_shift, v_t, v_parent, _notes);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4b. internal settle core -- assumes advisory, shift, and both treasuries are locked
-- ---------------------------------------------------------------------------

create or replace function public._fn_treasury_shift_settle_locked(
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
declare
  v_branch uuid := _drawer.branch_id;
  v_actor uuid := auth.uid();
  v_transfer jsonb;
  v_settlement_tx uuid;
  v_opening_tx uuid;
  v_variance_tx uuid;
  v_current numeric;
  v_opening_gap numeric;
  v_variance numeric;
  v_business_date date;
  v_cycle uuid;
  v_cycle_end date;
  v_today date;
  v_parent_before numeric;
  v_parent_after numeric;
  v_drawer_after numeric;
  v_note text := nullif(btrim(coalesce(_notes, '')), '');
begin
  if _shift.settled_at is not null then
    return _shift.id;
  end if;
  if _drawer.id = _parent.id then
    raise exception 'Drawer and parent must be different treasuries' using errcode = '23514';
  end if;
  if _drawer.branch_id <> v_branch
     or _parent.branch_id <> v_branch
     or _drawer.account_kind <> 'cash'
     or _parent.account_kind <> 'cash'
     or _drawer.custodian_user_id is null
     or _parent.custodian_user_id is not null
     or _parent.parent_treasury_id is not null then
    raise exception 'Settlement requires a cash custody drawer and a plain cash parent'
      using errcode = '23514';
  end if;
  if _shift.custodian_user_id <> _drawer.custodian_user_id then
    raise exception 'Shift custodian does not match the drawer custodian'
      using errcode = '23514';
  end if;
  if _shift.expected_closing is null
     or _shift.closing_counted is null
     or _shift.opening_counted is null
     or _shift.opening_book is null
     or _shift.opening_gap is null then
    raise exception 'Shift does not carry a complete close' using errcode = '23514';
  end if;

  -- current_balance is the book. The opening count is physical. The equation
  -- protects against later book movement without treating the opening gap as
  -- cash that is already inside current_balance.
  if (_shift.opening_counted + _drawer.current_balance - _shift.opening_book)
       is distinct from _shift.expected_closing then
    raise exception 'Drawer moved after the close; reconcile before settlement'
      using errcode = '23514';
  end if;

  v_current := _drawer.current_balance;
  v_opening_gap := _shift.opening_gap;
  v_variance := _shift.variance;
  v_business_date := (_shift.closed_at at time zone 'Africa/Cairo')::date;
  v_today := (statement_timestamp() at time zone 'Africa/Cairo')::date;

  if v_current < 0 then
    raise exception 'Drawer is negative; reconcile before settlement'
      using errcode = '23514';
  end if;
  if v_current + v_opening_gap + v_variance is distinct from _shift.closing_counted then
    raise exception 'Settlement accounting identity failed before posting'
      using errcode = '23514';
  end if;

  perform public._treasury_assert_open_period(v_branch, _drawer.id, v_business_date);
  perform public._treasury_assert_open_period(v_branch, _parent.id, v_business_date);

  v_cycle := public._financial_cycle_for_date(v_branch, v_business_date);
  if v_cycle is null then
    raise exception 'No financial cycle covers settlement date %', v_business_date
      using errcode = '23514';
  end if;
  select fc.end_date into v_cycle_end
    from public.financial_cycles fc
   where fc.id = v_cycle;
  if v_cycle_end is not null and v_cycle_end < v_today then
    raise exception 'Financial cycle % is archived; settlement is not allowed', v_cycle
      using errcode = '23514';
  end if;

  v_parent_before := _parent.current_balance;

  -- Move the book, not expected_closing. The opening gap and variance are
  -- separate, auditable postings so current_balance + gap + variance equals
  -- closing_counted exactly once.
  if v_current > 0 then
    v_transfer := public.transfer_treasury_funds(
      _drawer.id,
      _parent.id,
      v_current,
      _shift.id,
      coalesce(v_note, 'Shift settlement')
    );
    v_settlement_tx := (v_transfer->>'credit_id')::uuid;
  end if;

  if v_opening_gap <> 0 then
    if v_opening_gap > 0 then
      v_opening_tx := public.add_treasury_tx(
        _parent.id,
        'income'::public.treasury_tx_type,
        v_opening_gap,
        'treasury_shift_opening_gap',
        _shift.id,
        'Opening gap — over',
        'فرق افتتاحي — زيادة',
        v_actor,
        true
      );
    else
      v_opening_tx := public.add_treasury_tx(
        _parent.id,
        'expense'::public.treasury_tx_type,
        abs(v_opening_gap),
        'treasury_shift_opening_gap',
        _shift.id,
        'Opening gap — short',
        'فرق افتتاحي — عجز',
        v_actor,
        true
      );
    end if;
  end if;

  if v_variance is not null and v_variance <> 0 then
    if v_variance > 0 then
      v_variance_tx := public.add_treasury_tx(
        _parent.id,
        'income'::public.treasury_tx_type,
        v_variance,
        'treasury_shift_variance',
        _shift.id,
        'Shift variance — over',
        'فرق وردية — زيادة',
        v_actor,
        true
      );
    else
      v_variance_tx := public.add_treasury_tx(
        _parent.id,
        'expense'::public.treasury_tx_type,
        abs(v_variance),
        'treasury_shift_variance',
        _shift.id,
        'Shift variance — short',
        'فرق وردية — عجز',
        v_actor,
        true
      );
    end if;
  end if;

  if v_settlement_tx is null then
    v_settlement_tx := coalesce(v_opening_tx, v_variance_tx);
  end if;

  -- Runtime proof: the parent gained exactly the counted closing figure and
  -- the drawer retained nothing. If not, the whole settlement rolls back.
  select t.current_balance into v_parent_after
    from public.treasury t where t.id = _parent.id;
  select t.current_balance into v_drawer_after
    from public.treasury t where t.id = _drawer.id;
  if v_parent_after - v_parent_before is distinct from _shift.closing_counted then
    raise exception 'Settlement invariant failed: parent delta % != closing_counted %',
      v_parent_after - v_parent_before, _shift.closing_counted
      using errcode = '23514';
  end if;
  if v_drawer_after is distinct from 0 then
    raise exception 'Settlement invariant failed: drawer % != 0', v_drawer_after
      using errcode = '23514';
  end if;

  perform set_config('app.allow_treasury_shift_settle', 'on', true);

  update public.treasury_shifts s
     set settled_at = statement_timestamp(),
         settlement_tx_id = v_settlement_tx,
         variance_tx_id = v_variance_tx,
         updated_at = statement_timestamp()
   where s.id = _shift.id;

  return _shift.id;
end;
$function$;

revoke all on function public._fn_treasury_shift_settle_locked(
  public.treasury_shifts, public.treasury, public.treasury, text
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. one-step close + settlement for the desk
-- ---------------------------------------------------------------------------

-- Internal request-id-aware core. Public 5-arg requires a request id; the old
-- 4-arg delegates with null and therefore deliberately has no retry contract.
create or replace function public._fn_treasury_shift_close_and_settle_internal(
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
  v_branch uuid;
  v_actor uuid := auth.uid();
  v_t public.treasury%rowtype;
  v_parent public.treasury%rowtype;
  v_parent_id uuid;
  v_shift_id uuid;
  v_shift public.treasury_shifts%rowtype;
  v_closed public.treasury_shifts%rowtype;
  v_existing public.treasury_shifts%rowtype;
begin
  if _closing_counted is null or _closing_counted::text in ('NaN','Infinity','-Infinity') then
    raise exception 'The counted amount must be a real amount' USING ERRCODE = '22023';
  end if;
  if _closing_counted < 0 then
    raise exception 'The counted amount cannot be negative' USING ERRCODE = '23514';
  end if;

  v_branch := public._treasury_shift_authorize_treasury(_treasury_id, 'treasury.shift.use');
  perform public._treasury_shift_authorize_treasury(_treasury_id, 'treasury.tx.write');

  if _request_id is not null then
    select * into v_existing
      from public.treasury_shifts s
     where s.treasury_id = _treasury_id
       and s.close_request_id = _request_id;
    if found then
      if v_existing.settled_at is not null
         and v_existing.closing_counted = _closing_counted
         and v_existing.handed_over_to is not distinct from _handed_over_to then
        return v_existing.id;
      end if;
      raise exception 'Request id % was already used with different close facts', _request_id
        using errcode = '23505';
    end if;
  end if;

  select * into v_t
    from public.treasury t
   where t.id = _treasury_id and t.deleted_at is null;
  if not found then
    raise exception 'Treasury not found' using errcode = '23503';
  end if;
  if v_t.account_kind <> 'cash'
     or v_t.custodian_user_id is null
     or v_t.parent_treasury_id is null then
    raise exception 'Treasury is not a cash custody drawer' using errcode = '23514';
  end if;
  v_parent_id := v_t.parent_treasury_id;

  select s.id into v_shift_id
    from public.treasury_shifts s
   where s.treasury_id = _treasury_id
     and s.closed_at is null
   order by s.opened_at desc
   limit 1;
  if v_shift_id is null then
    if _request_id is not null then
      select * into v_existing
        from public.treasury_shifts s
       where s.treasury_id = _treasury_id
         and s.close_request_id = _request_id;
      if found
         and v_existing.settled_at is not null
         and v_existing.closing_counted = _closing_counted
         and v_existing.handed_over_to is not distinct from _handed_over_to then
        return v_existing.id;
      end if;
    end if;
    raise exception 'No open shift for this till' USING ERRCODE = '55000';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('treasury-transfer:' || v_shift_id::text, 0)
  );

  select * into v_shift
    from public.treasury_shifts s
   where s.id = v_shift_id
     and s.closed_at is null
     for update;
  if not found then
    if _request_id is not null then
      select * into v_existing
        from public.treasury_shifts s
       where s.treasury_id = _treasury_id
         and s.close_request_id = _request_id;
      if found
         and v_existing.settled_at is not null
         and v_existing.closing_counted = _closing_counted
         and v_existing.handed_over_to is not distinct from _handed_over_to then
        return v_existing.id;
      end if;
    end if;
    raise exception 'No open shift for this till' USING ERRCODE = '55000';
  end if;

  perform 1
    from public.treasury t
   where t.id in (_treasury_id, v_parent_id)
     and t.deleted_at is null
   order by t.id
     for update;

  select * into v_t
    from public.treasury t
   where t.id = _treasury_id and t.branch_id = v_branch and t.deleted_at is null
     for update;
  if not found then
    raise exception 'Treasury not found after lock' using errcode = '23503';
  end if;
  if v_t.parent_treasury_id is distinct from v_parent_id
     or v_t.account_kind <> 'cash'
     or v_t.custodian_user_id is null then
    raise exception 'Drawer metadata changed during close' using errcode = '23514';
  end if;

  select * into v_parent
    from public.treasury p
   where p.id = v_parent_id and p.deleted_at is null
     for update;
  if not found then
    raise exception 'Parent treasury not found after lock' using errcode = '23503';
  end if;
  if v_parent.branch_id <> v_branch
     or v_parent.account_kind <> 'cash'
     or v_parent.custodian_user_id is not null
     or v_parent.parent_treasury_id is not null then
    raise exception 'Parent must be a non-custody cash treasury in the same branch'
      using errcode = '23514';
  end if;
  if v_shift.custodian_user_id <> v_t.custodian_user_id then
    raise exception 'Shift custodian does not match the drawer custodian'
      using errcode = '23514';
  end if;

  perform public._fn_treasury_shift_validate_handover(
    v_branch, _handed_over_to, v_actor
  );

  -- One advisory, one shift lock, one ordered treasury lock: the cores below
  -- do not acquire any of them again.
  perform public._fn_treasury_shift_close_locked(
    v_shift, v_t.current_balance, _closing_counted, _handed_over_to, _notes, _request_id
  );

  select * into v_closed
    from public.treasury_shifts s
   where s.id = v_shift.id;

  return public._fn_treasury_shift_settle_locked(v_closed, v_t, v_parent, _notes);
end;
$function$;

revoke all on function public._fn_treasury_shift_close_and_settle_internal(
  uuid, numeric, uuid, text, uuid
) from public, anon, authenticated;

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
begin
  if _request_id is null then
    raise exception 'A close request id is required for idempotent close-and-settle'
      using errcode = '22023';
  end if;
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
begin
  -- Compatibility path: no request id, therefore no retry matching at all.
  return public._fn_treasury_shift_close_and_settle_internal(
    _treasury_id, _closing_counted, _handed_over_to, _notes, null
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. who may call what
-- ---------------------------------------------------------------------------

revoke all on function public.fn_treasury_shift_settle(uuid, text)
  from public, anon;
revoke all on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text)
  from public, anon;
revoke all on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text, uuid)
  from public, anon;

grant execute on function public.fn_treasury_shift_settle(uuid, text)
  to authenticated, service_role;
grant execute on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text)
  to authenticated, service_role;
grant execute on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text, uuid)
  to authenticated, service_role;
