-- PR-4/6: settlement-aware treasury shift RPCs.
--
-- This migration adds two RPCs and relaxes the closed-shift immutability guard
-- so a signed close can receive its one-time settlement facts. It does not
-- delete rows, tables, columns, or historical ledger entries.
--
-- Existing fn_treasury_shift_open and fn_treasury_shift_close stay compatible:
-- open still starts a custody record, close still signs the count and optional
-- handover, and settlement is a separate, explicit money movement.

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
-- 3. settle a closed drawer into its parent
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
  v_actor uuid := auth.uid();
  v_t public.treasury%rowtype;
  v_parent public.treasury%rowtype;
  v_shift public.treasury_shifts%rowtype;
  v_transfer jsonb;
  v_settlement_tx uuid;
  v_variance_tx uuid;
  v_amount numeric;
  v_variance numeric;
  v_note text := nullif(btrim(coalesce(_notes, '')), '');
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

  select * into v_parent
    from public.treasury p
   where p.id = v_t.parent_treasury_id and p.deleted_at is null;
  if not found then
    raise exception 'Parent treasury not found' using errcode = '23503';
  end if;
  if v_parent.branch_id <> v_t.branch_id then
    raise exception 'Parent treasury belongs to another branch' using errcode = '23514';
  end if;

  -- Lock the two treasuries in UUID order, the same order used by
  -- transfer_treasury_funds, and then lock the shift. This keeps settlement
  -- from deadlocking against an ordinary transfer.
  perform 1
    from public.treasury t
   where t.id in (_treasury_id, v_t.parent_treasury_id)
     and t.deleted_at is null
   order by t.id
     for update;

  select * into v_t
    from public.treasury t
   where t.id = _treasury_id and t.deleted_at is null
     for update;
  select * into v_parent
    from public.treasury p
   where p.id = v_t.parent_treasury_id and p.deleted_at is null
     for update;

  select * into v_shift
    from public.treasury_shifts s
   where s.treasury_id = _treasury_id
     and s.closed_at is not null
   order by s.closed_at desc
   limit 1
     for update;

  if not found then
    raise exception 'No closed shift to settle for this drawer' using errcode = '55000';
  end if;
  if v_shift.settled_at is not null then
    return v_shift.id;
  end if;
  if v_shift.custodian_user_id <> v_t.custodian_user_id then
    raise exception 'Shift custodian does not match the drawer custodian'
      using errcode = '23514';
  end if;
  if v_shift.expected_closing is null or v_shift.closing_counted is null then
    raise exception 'Shift does not carry a complete close' using errcode = '23514';
  end if;
  if v_t.current_balance is distinct from v_shift.expected_closing then
    raise exception 'Drawer balance changed after the close; reconcile before settlement'
      using errcode = '23514';
  end if;

  v_amount := v_shift.expected_closing;
  v_variance := v_shift.variance;

  if v_amount < 0 then
    raise exception 'Drawer is negative; reconcile before settlement'
      using errcode = '23514';
  end if;

  if v_amount > 0 then
    v_transfer := public.transfer_treasury_funds(
      _treasury_id,
      v_parent.id,
      v_amount,
      v_shift.id,
      coalesce(v_note, 'Shift settlement')
    );
    v_settlement_tx := (v_transfer->>'credit_id')::uuid;
  end if;

  -- The parent receives what was counted, not merely what the books expected.
  -- A positive variance is income; a negative variance is a shortage expense.
  if v_variance is not null and v_variance <> 0 then
    if v_variance > 0 then
      v_variance_tx := public.add_treasury_tx(
        v_parent.id,
        'income'::public.treasury_tx_type,
        v_variance,
        'treasury_shift_variance',
        v_shift.id,
        'Shift variance — over',
        'فرق وردية — زيادة',
        v_actor,
        true
      );
    else
      v_variance_tx := public.add_treasury_tx(
        v_parent.id,
        'expense'::public.treasury_tx_type,
        abs(v_variance),
        'treasury_shift_variance',
        v_shift.id,
        'Shift variance — short',
        'فرق وردية — عجز',
        v_actor,
        true
      );
    end if;
  end if;

  -- A zero drawer has no transfer. If it has a variance, that variance
  -- transaction is the only settlement fact available.
  if v_settlement_tx is null then
    v_settlement_tx := v_variance_tx;
  end if;

  perform set_config('app.allow_treasury_shift_settle', 'on', true);

  update public.treasury_shifts s
     set settled_at = statement_timestamp(),
         settlement_tx_id = v_settlement_tx,
         variance_tx_id = v_variance_tx,
         updated_at = statement_timestamp()
   where s.id = v_shift.id;

  return v_shift.id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. one-step close + settlement for the desk
-- ---------------------------------------------------------------------------

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
  v_shift_id uuid;
begin
  v_shift_id := public.fn_treasury_shift_close(
    _treasury_id, _closing_counted, _handed_over_to, _notes
  );
  perform public.fn_treasury_shift_settle(_treasury_id, _notes);
  return v_shift_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. who may call what
-- ---------------------------------------------------------------------------

revoke all on function public.fn_treasury_shift_settle(uuid, text)
  from public, anon;
revoke all on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text)
  from public, anon;

grant execute on function public.fn_treasury_shift_settle(uuid, text)
  to authenticated, service_role;
grant execute on function public.fn_treasury_shift_close_and_settle(uuid, numeric, uuid, text)
  to authenticated, service_role;
