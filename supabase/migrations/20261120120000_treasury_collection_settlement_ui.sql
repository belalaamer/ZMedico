-- PR-7: make the cashier desk use the drawer collection contract, expose
-- closed-but-unsettled custody, and keep the generic transfer from replacing
-- shift settlement.
--
-- Scope of this file:
--   1. an explicit per-branch collection mode: a branch is on the drawer path
--      only after it has an active cash route that requires a shift. Branches
--      without that route stay on the existing payments.insert path.
--   2. a read model that separates open / closed_pending_settlement / settled.
--   3. a server-side guard that refuses a generic transfer out of a custody
--      drawer whose closed shift has not been settled. Settlement itself uses
--      the shift id as its transfer reference, so it remains allowed.
--
-- This file does not move money, does not rewrite payment rows, and does not
-- change any existing route, treasury or shift row.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Collection mode
-- ---------------------------------------------------------------------------
create or replace function public.fn_treasury_collection_mode(_branch_id uuid)
returns text
language plpgsql
stable
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
     or _branch_id is null
     or not public.user_has_branch_access(_branch_id)
     or not public.has_permission(v_actor, 'invoices.create') then
    raise exception 'Forbidden: missing branch or payment permission' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.treasury_payment_routes r
     where r.branch_id = _branch_id
       and r.is_active
       and r.payment_method = 'cash'::public.payment_method
       and r.requires_shift
  ) then
    return 'drawer';
  end if;
  return 'legacy';
end;
$function$;

revoke all on function public.fn_treasury_collection_mode(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_treasury_collection_mode(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Shift state with custody settlement state
-- ---------------------------------------------------------------------------
create or replace function public.fn_treasury_shift_state_v2(_branch_id uuid)
returns table (
  treasury_id uuid, name_en text, name_ar text, currency text,
  shift_id uuid, shift_status text, opened_at timestamptz, opened_by uuid,
  opener_name text, opening_counted numeric, opening_book numeric, opening_gap numeric,
  inherited_counted numeric, opening_variance numeric, shift_cash_income numeric,
  shift_cash_outflow numeric, shift_non_cash_income numeric, shift_non_cash_outflow numeric,
  shift_entries integer, expected_cash numeric, cumulative_cash numeric,
  unexplained_book_movement numeric, last_closed_at timestamptz,
  last_closer_name text, last_counted numeric, last_variance numeric,
  last_handed_over_name text,
  last_shift_id uuid, last_expected_closing numeric, last_settled_at timestamptz,
  last_status text,
  shift_collected_cash numeric, shift_collected_non_cash numeric, shift_collected_entries integer
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    s.treasury_id, s.name_en, s.name_ar, s.currency,
    s.shift_id, s.shift_status, s.opened_at, s.opened_by,
    s.opener_name, s.opening_counted, s.opening_book, s.opening_gap,
    s.inherited_counted, s.opening_variance, s.shift_cash_income,
    s.shift_cash_outflow, s.shift_non_cash_income, s.shift_non_cash_outflow,
    s.shift_entries, s.expected_cash, s.cumulative_cash,
    s.unexplained_book_movement, s.last_closed_at,
    s.last_closer_name, s.last_counted, s.last_variance,
    s.last_handed_over_name,
    p.id,
    p.expected_closing,
    p.settled_at,
    case
      when s.shift_id is not null then 'open'
      when p.id is null then 'idle'
      when p.settled_at is null then 'closed_pending_settlement'
      else 'settled'
    end,
    c.cash_collected,
    c.non_cash_collected,
    c.entries
  from public.fn_treasury_shift_state(_branch_id) s
  left join lateral (
    select sh.id, sh.expected_closing, sh.settled_at
      from public.treasury_shifts sh
     where sh.treasury_id = s.treasury_id
       and sh.closed_at is not null
     order by sh.closed_at desc
     limit 1
  ) p on true
  left join lateral (
    select
      coalesce(sum(pay.amount) filter (where pay.payment_method = 'cash'::public.payment_method), 0) as cash_collected,
      coalesce(sum(pay.amount) filter (where pay.payment_method <> 'cash'::public.payment_method), 0) as non_cash_collected,
      count(*)::integer as entries
      from public.payments pay
     where pay.shift_id = s.shift_id
       and pay.deleted_at is null
  ) c on true;
$function$;

revoke all on function public.fn_treasury_shift_state_v2(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_treasury_shift_state_v2(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The generic transfer cannot empty a drawer that is waiting for settlement
-- ---------------------------------------------------------------------------
create or replace function public._tg_transfer_settlement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_pending_shift uuid;
begin
  if NEW.reference_type = 'transfer'
     and NEW.transaction_type = 'expense'::public.treasury_tx_type then
    select s.id
      into v_pending_shift
      from public.treasury t
      join public.treasury_shifts s on s.treasury_id = t.id
     where t.id = NEW.treasury_id
       and t.account_kind = 'cash'
       and t.custodian_user_id is not null
       and s.closed_at is not null
       and s.settled_at is null
     order by s.closed_at desc
     limit 1;

    if v_pending_shift is not null
       and not (
         current_setting('app.allow_treasury_shift_settle', true) = 'on'
         and current_setting('app.treasury_settle_shift', true) = v_pending_shift::text
         and NEW.reference_id = v_pending_shift
       ) then
      raise exception 'This drawer has a closed shift waiting for settlement. Settle the shift instead of transferring its cash.'
        using errcode = '23514';
    end if;
  end if;
  return NEW;
end;
$function$;

revoke all on function public._tg_transfer_settlement_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists treasury_transfer_settlement_guard on public.treasury_transactions;
create trigger treasury_transfer_settlement_guard
  before insert on public.treasury_transactions
  for each row execute function public._tg_transfer_settlement_guard();


-- ---------------------------------------------------------------------------
-- 3b. Non-cash receipts are attributed to the cashier's open shift for
-- reporting, while their money stays in the bank treasury.
-- ---------------------------------------------------------------------------
create or replace function public._tg_payment_attach_open_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_shift uuid;
begin
  if NEW.shift_id is null
     and NEW.branch_id is not null
     and NEW.received_by is not null
     and NEW.payment_method <> 'cash'::public.payment_method
     and NEW.payment_method <> 'wallet'::public.payment_method then
    select s.id
      into v_shift
      from public.treasury_shifts s
      join public.treasury t on t.id = s.treasury_id
     where s.branch_id = NEW.branch_id
       and s.custodian_user_id = NEW.received_by
       and s.closed_at is null
       and t.account_kind = 'cash'
       and t.is_active
       and t.deleted_at is null
       and exists (
         select 1
           from public.treasury_payment_routes r
          where r.branch_id = NEW.branch_id
            and r.payment_method = 'cash'::public.payment_method
            and r.requires_shift
            and r.is_active
       )
     order by s.opened_at desc
     limit 1;
    if v_shift is not null then
      NEW.shift_id := v_shift;
    end if;
  end if;
  return NEW;
end;
$function$;

revoke all on function public._tg_payment_attach_open_shift()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_payment_attach_open_shift on public.payments;
create trigger trg_payment_attach_open_shift
  before insert on public.payments
  for each row execute function public._tg_payment_attach_open_shift();

comment on function public.fn_treasury_collection_mode(uuid) is
  'drawer only when the branch has an active cash route that requires a shift; otherwise legacy';
comment on function public.fn_treasury_shift_state_v2(uuid) is
  'shift state plus last closed shift expected/counted/settled status';

commit;
