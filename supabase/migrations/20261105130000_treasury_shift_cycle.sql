-- (ب) P3 — Treasury custody cycle: open a shift, work the till, close it or hand it over.
--
-- Status: APPLIED to Production `rqcmnfzfytyyicelvifk` on 2026-11-05, owner-approved COMMIT.
-- It was proved first on live Production with zero writes -- BEGIN; <these exact bytes>;
-- <measurements>; ROLLBACK; -- and re-measured after the COMMIT: see
-- docs/TREASURY_SHIFT_APPLY_20261105.md for the apply receipts, the prosrc length/md5
-- byte-fidelity gate over the ten functions this file defines, the EXECUTE-grant census and
-- the number of live users who effectively hold treasury.shift.use.
--
-- What was true on Production before this migration (measured 2026-11-05, read-only):
--   * treasury_daily_closes holds 0 rows. There is no opening, no closing and no
--     handover anywhere in the system -- the close screen exists and has never been used.
--   * The receptionist holds no treasury permission at all (no treasury.view, no
--     treasury.tx.write, no treasury.daily_close.view) while moving the drawer on every
--     cash payment, because the payments trigger posts to treasury on its behalf. The
--     person physically holding the cash cannot see it, open it, or close it. Section 11
--     is the only thing in this file that changes that, and it changes only custody.
--   * The only time boundary is a calendar day, and its opening_cash is *derived* as
--     current_balance minus everything booked since midnight -- midnight is treated as
--     the start of the shift, so two cashiers in one day cannot be told apart.
--   * DailyClose.tsx posts opening_cash, expected_cash and non_cash_total from the
--     browser, and variance is GENERATED ALWAYS AS (counted_cash - expected_cash): a
--     wrong expected_cash makes a fake variance permanent (daily_close_immutable,
--     locked default true).
--   * fn_treasury_day_cash_summary adds up only 'income' and 'expense', while
--     add_treasury_tx moves the balance for anything that is not 'income'. A 'transfer'
--     row would change current_balance and appear in neither bucket. The maths below
--     follows add_treasury_tx's own rule, so a shift can never disagree with the ledger.
--   * Read from add_treasury_tx's body (2026-11-05, Source): it moves current_balance
--     only when _is_cash, and non_cash_balance otherwise, in the same transaction as its
--     ledger INSERT, after SELECT ... FOR UPDATE on the treasury row. current_balance is
--     therefore a pure cash accumulator, and transfer_treasury_funds calls it with
--     _is_cash = true. That identity -- balance minus balance == committed cash delta --
--     is what the drawer below is built on, so no shift number depends on telling two
--     timestamps apart.
--   * Blitz Physio "Clinic Safe" is the only till with history: current_balance 8550.00
--     and the sum of its cash ledger deltas is also exactly 8550.00 -- the books already
--     explain themselves, which is the invariant this design keeps and starts counting.
--
-- What this design deliberately does NOT do:
--   * It writes no treasury_transactions row and never touches treasury.current_balance.
--     A shift is a custody record *over* the existing append-only ledger, so the twelve
--     financial regression tests -- #5 the append-only guard, #6 and #7 the
--     current_balance deltas, #12 "every live payment has a treasury entry" -- see no new
--     writer and no new column. Nothing is added to treasury_transactions, which could
--     not be back-filled anyway: its append-only trigger rejects every UPDATE.
--   * It never blocks the desk. A payment taken while no shift is open is booked exactly
--     as it is today and lands in the books; the next count names the gap.
--   * It grants no table access. authenticated keeps zero privileges on treasury_shifts
--     and every screen goes through the RPCs, which re-check session, permission and
--     branch the way the existing money readers do.

-- ---------------------------------------------------------------------------
-- 1. the custody record
-- ---------------------------------------------------------------------------
create table if not exists public.treasury_shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  treasury_id uuid not null references public.treasury(id) on delete cascade,

  opened_at timestamptz not null default statement_timestamp(),
  opened_by uuid not null references auth.users(id),
  -- What the cashier physically counted, and what the books said at the same instant.
  opening_counted numeric not null,
  opening_book numeric not null,
  -- The number the owner is missing today: how far the drawer was from the books the
  -- moment someone was made responsible for it. It stays constant through a shift,
  -- because both sides move by the same ledger rows.
  opening_gap numeric generated always as (opening_counted - opening_book) stored,

  -- The count the drawer arrived with, copied from the previous close so the chain is
  -- readable on its own. NULL for the first count a clinic ever takes: no baseline, so
  -- no claim of "on the penny" -- the arithmetic yields NULL, never a flattering zero.
  inherited_from uuid references public.treasury_shifts(id) on delete set null,
  inherited_counted numeric,
  opening_variance numeric generated always as (opening_counted - inherited_counted) stored,

  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  -- Recomputed by the server at close, from the ledger, at that instant. The client
  -- sends one number: what it counted.
  expected_closing numeric,
  closing_counted numeric,
  variance numeric generated always as (closing_counted - expected_closing) stored,

  -- Who physically took the drawer next. The close time is the handover time.
  handed_over_to uuid references auth.users(id),
  notes text,

  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),

  constraint treasury_shifts_opening_count_finite
    check (opening_counted::text not in ('NaN','Infinity','-Infinity')),
  constraint treasury_shifts_opening_count_not_negative
    check (opening_counted >= 0),
  constraint treasury_shifts_closing_count_finite
    check (closing_counted is null or closing_counted::text not in ('NaN','Infinity','-Infinity')),
  constraint treasury_shifts_closing_count_not_negative
    check (closing_counted is null or closing_counted >= 0),
  -- An open shift carries no closing facts and a closed shift carries all of them: a
  -- half-written close is not a state the desk can reach.
  constraint treasury_shifts_close_is_atomic check (
    (closed_at is null and closed_by is null and expected_closing is null
       and closing_counted is null and handed_over_to is null)
    or
    (closed_at is not null and closed_by is not null and expected_closing is not null
       and closing_counted is not null)
  ),
  -- Measured (dry-run receipt '19'): a handover with no closer is already refused by
  -- close_is_atomic, so this rule is implied. Kept because it names the invariant a
  -- reader cares about, and it stays true if the atomic rule above is ever relaxed.
  constraint treasury_shifts_handover_needs_closer
    check (handed_over_to is null or closed_by is not null)
);

-- One drawer, one open shift. A constraint, not a courtesy check in the RPC.
create unique index if not exists treasury_shifts_one_open_per_treasury
  on public.treasury_shifts (treasury_id)
  where closed_at is null;

create index if not exists treasury_shifts_treasury_closed_idx
  on public.treasury_shifts (treasury_id, closed_at desc nulls last);

create index if not exists treasury_shifts_branch_opened_idx
  on public.treasury_shifts (branch_id, opened_at desc);

-- ---------------------------------------------------------------------------
-- 2. the record is permanent: only the close RPC writes the closing fields
-- ---------------------------------------------------------------------------
-- Mirrors _tg_treasury_balance_guard: a transaction-local flag held by the definer RPC
-- and unreachable from the REST API, plus a field-by-field veto so even the RPC itself
-- cannot rewrite the count somebody physically made.
create or replace function public._tg_treasury_shift_immutable()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'treasury_shifts rows are permanent -- a till handover is never erased (op=%)', TG_OP
      USING ERRCODE = '23514';
  end if;
  if coalesce(current_setting('app.allow_treasury_shift_close', true), '') <> 'on' then
    raise exception 'treasury_shifts can only be changed through fn_treasury_shift_close'
      USING ERRCODE = '23514';
  end if;
  -- Dry-run receipt '23': the flag alone let a *signed* shift be rewritten. A close is
  -- final once it is written -- corrections live in the next shift and in the audit trail.
  if old.closed_at is not null then
    raise exception 'a signed shift is permanent -- the close cannot be rewritten'
      USING ERRCODE = '23514';
  end if;
  if new.branch_id         is distinct from old.branch_id
     or new.treasury_id     is distinct from old.treasury_id
     or new.opened_at       is distinct from old.opened_at
     or new.opened_by       is distinct from old.opened_by
     or new.opening_counted is distinct from old.opening_counted
     or new.opening_book    is distinct from old.opening_book
     or new.inherited_from  is distinct from old.inherited_from
     or new.inherited_counted is distinct from old.inherited_counted then
    raise exception 'an open shift keeps the count it was opened with'
      USING ERRCODE = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists treasury_shift_immutable on public.treasury_shifts;
create trigger treasury_shift_immutable
  before update or delete on public.treasury_shifts
  for each row execute function public._tg_treasury_shift_immutable();

-- The supervisory trace the owner asked for: every open, close and handover is an audit
-- row, with the numbers that were true at the moment it was signed.
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

drop trigger if exists audit_treasury_shift_v1 on public.treasury_shifts;
create trigger audit_treasury_shift_v1
  after insert or update on public.treasury_shifts
  for each row execute function public.audit_treasury_shift_v1();

alter table public.treasury_shifts enable row level security;
revoke all on table public.treasury_shifts from public, anon, authenticated;

-- Trigger functions are not REST entry points. Without this they carry the schema
-- default EXECUTE-to-PUBLIC, which PostgREST publishes as /rpc/<name> (dry-run receipt
-- '04' measured auth=true anon=true before the revokes were added).
revoke all on function public._tg_treasury_shift_immutable() from public, anon, authenticated;
revoke all on function public.audit_treasury_shift_v1() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. the shift's income/outflow split, written once
-- ---------------------------------------------------------------------------
-- This answers "what kind of money moved", never "how much the drawer holds" (section
-- 5/7 derive that from current_balance, which cannot disagree with the ledger). The
-- direction rule is copied from add_treasury_tx (income adds, anything else subtracts)
-- rather than from fn_treasury_day_cash_summary (which ignores 'transfer'), so the split
-- adds up to what actually moved current_balance for every row it sees.
-- _from is exclusive and _to inclusive: the opening count already carries everything up
-- to the instant it was taken.
--
-- Its one honest limit, measured in DRYRUN-171 PART 3 receipts 06/11/20: treasury
-- _transactions.created_at defaults to now(), the *start* of the writing transaction,
-- while the row becomes visible -- and current_balance moves -- at its *end*. A payment
-- whose transaction began just before the shift opened and committed just after it is
-- therefore older than opened_at: the drawer counts its money and this split misses it.
-- The split is a display breakdown, so that is a report to annotate, not a custody error
-- -- which is exactly why expected_cash is not built on this function. The
-- unexplained_book_movement column reports the size of the miss whenever it happens.
create or replace function public._treasury_shift_window_totals(
  _treasury_id uuid,
  _from timestamptz,
  _to timestamptz default null
)
returns table (
  cash_income numeric,
  cash_outflow numeric,
  cash_delta numeric,
  non_cash_income numeric,
  non_cash_outflow numeric,
  entries integer
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    coalesce(sum(case when tt.is_cash and tt.transaction_type = 'income'::public.treasury_tx_type
                      then tt.amount end), 0),
    coalesce(sum(case when tt.is_cash and tt.transaction_type is distinct from 'income'::public.treasury_tx_type
                      then tt.amount end), 0),
    coalesce(sum(case when tt.is_cash
                      then (case when tt.transaction_type = 'income'::public.treasury_tx_type
                                 then tt.amount else -tt.amount end) end), 0),
    coalesce(sum(case when not tt.is_cash and tt.transaction_type = 'income'::public.treasury_tx_type
                      then tt.amount end), 0),
    coalesce(sum(case when not tt.is_cash and tt.transaction_type is distinct from 'income'::public.treasury_tx_type
                      then tt.amount end), 0),
    count(*)::integer
  from public.treasury_transactions tt
  where tt.treasury_id = _treasury_id
    and tt.created_at > coalesce(_from, '-infinity'::timestamptz)
    and tt.created_at <= coalesce(_to, statement_timestamp());
$function$;

-- Internal: EXECUTE stays with the owner, exactly like _treasury_assert_open_period.
revoke all on function public._treasury_shift_window_totals(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. authorization, written once
-- ---------------------------------------------------------------------------
create or replace function public._treasury_shift_authorize_branch(
  _branch_id uuid,
  _permission_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_actor uuid := auth.uid();
begin
  -- The same guard the other money readers use: a definer body cannot lean on
  -- invoker-only checks, and a stale session must not be able to sign a custody record.
  if not coalesce(zmedico_security.session_is_active(), false) then
    raise exception 'Authentication session is no longer active' USING ERRCODE = '42501';
  end if;
  if v_actor is null then
    raise exception 'Forbidden: authentication required' USING ERRCODE = '42501';
  end if;
  if _branch_id is null or not public.has_permission(v_actor, _permission_key) then
    raise exception 'Forbidden: missing permission %', _permission_key USING ERRCODE = '42501';
  end if;
  if not public.user_has_branch_access(_branch_id) then
    raise exception 'Forbidden: branch outside caller scope' USING ERRCODE = '42501';
  end if;
  return _branch_id;
end;
$function$;

create or replace function public._treasury_shift_authorize_treasury(
  _treasury_id uuid,
  _permission_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_branch uuid;
begin
  select t.branch_id into v_branch
    from public.treasury t
   where t.id = _treasury_id and t.deleted_at is null;
  if v_branch is null then
    raise exception 'Treasury not found' USING ERRCODE = '23503';
  end if;
  return public._treasury_shift_authorize_branch(v_branch, _permission_key);
end;
$function$;

revoke all on function public._treasury_shift_authorize_branch(uuid, text) from public, anon, authenticated;
revoke all on function public._treasury_shift_authorize_treasury(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. the desk screen: one call, one row per till
-- ---------------------------------------------------------------------------
-- Two columns answer the owner's «مفصولة بوضوح»: expected_cash is the drawer under this
-- shift's responsibility, cumulative_cash is the whole history of the till. Their gap is
-- opening_gap, fixed at the count.
--
-- expected_cash is built from the books, not from a time window:
--   drawer = opening_counted + (current_balance - opening_book)
-- Both balances come from the same cash accumulator add_treasury_tx maintains under
-- SELECT ... FOR UPDATE, and opening_book was read under that same lock at the count, so
-- the subtraction is the committed cash movement of this shift by construction -- there
-- is no instant to mis-bound, and the drawer cannot disagree with the ledger.
-- unexplained_book_movement is then the split's own integrity check: it is zero whenever
-- the created_at window sees every row the balance saw, and non-zero when a payment
-- committed across the shift boundary (see section 3). Non-zero annotates the report; it
-- never changes the drawer or anyone's variance.
create or replace function public.fn_treasury_shift_state(_branch_id uuid)
returns table (
  treasury_id uuid,
  name_en text,
  name_ar text,
  currency text,
  shift_id uuid,
  shift_status text,
  opened_at timestamptz,
  opened_by uuid,
  opener_name text,
  opening_counted numeric,
  opening_book numeric,
  opening_gap numeric,
  inherited_counted numeric,
  opening_variance numeric,
  shift_cash_income numeric,
  shift_cash_outflow numeric,
  shift_non_cash_income numeric,
  shift_non_cash_outflow numeric,
  shift_entries integer,
  expected_cash numeric,
  cumulative_cash numeric,
  unexplained_book_movement numeric,
  last_closed_at timestamptz,
  last_closer_name text,
  last_counted numeric,
  last_variance numeric,
  last_handed_over_name text
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare v_branch uuid;
begin
  -- Checked as a statement, so a planner that prunes an unused CTE can never skip it.
  v_branch := public._treasury_shift_authorize_branch(_branch_id, 'treasury.shift.use');

  return query
  with cur as (
    select distinct on (s.treasury_id) s.*
      from public.treasury_shifts s
     where s.branch_id = v_branch and s.closed_at is null
     order by s.treasury_id, s.opened_at desc
  ),
  prev as (
    select distinct on (s.treasury_id) s.*
      from public.treasury_shifts s
     where s.branch_id = v_branch and s.closed_at is not null
     order by s.treasury_id, s.closed_at desc
  )
  select
    t.id,
    t.name_en,
    t.name_ar,
    t.currency,
    cur.id,
    case when cur.id is not null then 'open' else 'idle' end,
    cur.opened_at,
    cur.opened_by,
    po.full_name,
    cur.opening_counted,
    cur.opening_book,
    cur.opening_gap,
    cur.inherited_counted,
    cur.opening_variance,
    w.cash_income,
    w.cash_outflow,
    w.non_cash_income,
    w.non_cash_outflow,
    w.entries,
    -- A till nobody has counted yet has no drawer expectation. Reporting 0 would read as
    -- "the drawer is empty", which is a different claim.
    case when cur.id is not null
         then cur.opening_counted + (t.current_balance - cur.opening_book) end,
    t.current_balance,
    -- How much of the drawer's movement the created_at split above could not name.
    (t.current_balance - cur.opening_book) - w.cash_delta,
    prev.closed_at,
    pc.full_name,
    prev.closing_counted,
    prev.variance,
    hc.full_name
  from public.treasury t
  left join cur on cur.treasury_id = t.id
  left join prev on prev.treasury_id = t.id
  left join lateral public._treasury_shift_window_totals(
    t.id, coalesce(cur.opened_at, 'infinity'::timestamptz)
  ) w on true
  left join public.profiles po on po.id = cur.opened_by
  left join public.profiles pc on pc.id = prev.closed_by
  left join public.profiles hc on hc.id = prev.handed_over_to
  where t.branch_id = v_branch
    and t.deleted_at is null
  order by t.created_at;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. open the drawer
-- ---------------------------------------------------------------------------
create or replace function public.fn_treasury_shift_open(
  _treasury_id uuid,
  _opening_counted numeric,
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
  v_prev public.treasury_shifts%rowtype;
  v_id uuid;
begin
  v_branch := public._treasury_shift_authorize_treasury(_treasury_id, 'treasury.shift.use');

  if _opening_counted is null or _opening_counted::text in ('NaN','Infinity','-Infinity') then
    raise exception 'The opening count must be a real amount' USING ERRCODE = '22023';
  end if;
  if _opening_counted < 0 then
    raise exception 'The opening count cannot be negative' USING ERRCODE = '23514';
  end if;

  if exists (select 1 from public.treasury_shifts s
              where s.treasury_id = _treasury_id and s.closed_at is null) then
    raise exception 'This till is already open -- close it before starting a new shift'
      USING ERRCODE = '23505';
  end if;

  -- The book is read under the same row lock add_treasury_tx takes, so the count and the
  -- balance are two views of one instant rather than of two moments with a payment
  -- between them.
  select t.current_balance into v_book
    from public.treasury t
   where t.id = _treasury_id
     for update;

  select * into v_prev from public.treasury_shifts s
    where s.treasury_id = _treasury_id and s.closed_at is not null
    order by s.closed_at desc limit 1;

  insert into public.treasury_shifts (
    branch_id, treasury_id, opened_by, opening_counted, opening_book,
    inherited_from, inherited_counted, notes
  ) values (
    v_branch, _treasury_id, v_actor, _opening_counted, coalesce(v_book, 0),
    v_prev.id, v_prev.closing_counted,
    nullif(btrim(coalesce(_notes, '')), '')
  ) returning id into v_id;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. close the drawer, or hand it over
-- ---------------------------------------------------------------------------
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
  v_shift public.treasury_shifts%rowtype;
begin
  v_branch := public._treasury_shift_authorize_treasury(_treasury_id, 'treasury.shift.use');

  if _closing_counted is null or _closing_counted::text in ('NaN','Infinity','-Infinity') then
    raise exception 'The counted amount must be a real amount' USING ERRCODE = '22023';
  end if;
  if _closing_counted < 0 then
    raise exception 'The counted amount cannot be negative' USING ERRCODE = '23514';
  end if;

  -- The book is read first, under the lock add_treasury_tx also takes, then the shift row
  -- -- the same order fn_treasury_shift_open uses, so the two can never deadlock against
  -- each other. Everything that committed before this instant is inside v_book; a payment
  -- still in flight is blocked behind it and lands in the next shift, not in this count.
  select t.current_balance into v_book
    from public.treasury t
   where t.id = _treasury_id
     for update;

  select * into v_shift from public.treasury_shifts s
    where s.treasury_id = _treasury_id and s.closed_at is null
    order by s.opened_at desc limit 1
    for update;
  if not found then
    raise exception 'No open shift for this till' USING ERRCODE = '55000';
  end if;

  -- A handover names a person who can be accountable for the drawer. Refusing an unknown
  -- id is what stops "handed over to nobody" from reading as a completed transfer.
  if _handed_over_to is not null then
    if _handed_over_to = v_actor then
      raise exception 'Hand the drawer to another person, or close the till' USING ERRCODE = '23514';
    end if;
    if not exists (
      select 1
        from public.profiles p
        join public.staff_profiles sp on sp.linked_user_id = p.id
        join auth.users u on u.id = p.id
       where p.id = _handed_over_to
         and sp.branch_id = v_branch
         and sp.deleted_at is null
         and u.deleted_at is null
         and sp.status not in ('suspended'::public.staff_status, 'terminated'::public.staff_status)
         and public.has_permission(_handed_over_to, 'treasury.shift.use')
    ) then
      raise exception 'The receiving person does not work this till' USING ERRCODE = '23503';
    end if;
  end if;

  -- What the drawer should hold is the count the cashier made, plus what the books moved
  -- since that count -- the same subtraction the screen shows a moment before the close.
  -- Nothing the browser sends reaches it, which is the difference between this and today's
  -- daily close, and no clock boundary is involved.
  perform set_config('app.allow_treasury_shift_close', 'on', true);

  update public.treasury_shifts s
     set expected_closing = s.opening_counted
                            + coalesce(v_book, 0) - s.opening_book,
         closing_counted  = _closing_counted,
         closed_at        = statement_timestamp(),
         closed_by        = v_actor,
         handed_over_to   = _handed_over_to,
         notes            = coalesce(nullif(btrim(coalesce(_notes, '')), ''), s.notes),
         updated_at       = statement_timestamp()
   where s.id = v_shift.id;

  return v_shift.id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. who may take the drawer
-- ---------------------------------------------------------------------------
create or replace function public.fn_treasury_shift_handover_candidates(_treasury_id uuid)
returns table (user_id uuid, full_name text, roles text)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_branch uuid;
  v_actor uuid := auth.uid();
begin
  v_branch := public._treasury_shift_authorize_treasury(_treasury_id, 'treasury.shift.use');
  return query
  select distinct p.id,
         p.full_name,
         (select string_agg(ur.role::text, ', ' order by ur.role::text)
            from public.user_roles ur where ur.user_id = p.id)
    from public.profiles p
    join public.staff_profiles sp on sp.linked_user_id = p.id
    join auth.users u on u.id = p.id
   where sp.branch_id = v_branch
     and sp.deleted_at is null
     and u.deleted_at is null
     and sp.status not in ('suspended'::public.staff_status, 'terminated'::public.staff_status)
     and p.id <> v_actor
     and public.has_permission(p.id, 'treasury.shift.use')
   order by 2;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 9. the supervisory view
-- ---------------------------------------------------------------------------
-- One row per shift, signed numbers only: variance and expected_closing come from the
-- stored row, so the report repeats what the desk saw rather than re-deriving it. The
-- trailing ledger_delta is the created_at window's own total -- read it as the split's
-- completeness check against cash_income - cash_outflow, not as the source of variance.
create or replace function public.fn_treasury_shift_report(
  _branch_id uuid,
  _from date,
  _to date,
  _tz text default 'Africa/Cairo'
)
returns table (
  shift_id uuid,
  treasury_name_en text,
  treasury_name_ar text,
  currency text,
  opened_at timestamptz,
  closed_at timestamptz,
  opener_name text,
  closer_name text,
  handed_over_name text,
  status text,
  opening_counted numeric,
  opening_book numeric,
  opening_gap numeric,
  inherited_counted numeric,
  opening_variance numeric,
  cash_income numeric,
  cash_outflow numeric,
  expected_closing numeric,
  closing_counted numeric,
  variance numeric,
  ledger_delta numeric,
  notes text
)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_branch uuid;
  v_tz text := coalesce(nullif(_tz, ''), 'Africa/Cairo');
  v_started timestamptz := ((coalesce(_from, date '2000-01-01'))::timestamp) at time zone coalesce(nullif(_tz, ''), 'Africa/Cairo');
  v_ended timestamptz := ((coalesce(_to, date '2100-01-01') + 1)::timestamp) at time zone coalesce(nullif(_tz, ''), 'Africa/Cairo');
begin
  v_branch := public._treasury_shift_authorize_branch(_branch_id, 'treasury.daily_close.view');

  return query
  select
    sh.id,
    t.name_en,
    t.name_ar,
    t.currency,
    sh.opened_at,
    sh.closed_at,
    po.full_name,
    pc.full_name,
    hc.full_name,
    case when sh.closed_at is null then 'open' else 'closed' end,
    sh.opening_counted,
    sh.opening_book,
    sh.opening_gap,
    sh.inherited_counted,
    sh.opening_variance,
    w.cash_income,
    w.cash_outflow,
    sh.expected_closing,
    sh.closing_counted,
    sh.variance,
    w.cash_delta,
    sh.notes
  from public.treasury_shifts sh
  join public.treasury t on t.id = sh.treasury_id
  left join lateral public._treasury_shift_window_totals(
    sh.treasury_id, sh.opened_at, coalesce(sh.closed_at, statement_timestamp())
  ) w on true
  left join public.profiles po on po.id = sh.opened_by
  left join public.profiles pc on pc.id = sh.closed_by
  left join public.profiles hc on hc.id = sh.handed_over_to
  where sh.branch_id = v_branch
    and sh.opened_at >= v_started
    and sh.opened_at < v_ended
  order by sh.opened_at desc;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 10. who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.fn_treasury_shift_state(uuid) from public, anon;
revoke all on function public.fn_treasury_shift_open(uuid, numeric, text) from public, anon;
revoke all on function public.fn_treasury_shift_close(uuid, numeric, uuid, text) from public, anon;
revoke all on function public.fn_treasury_shift_handover_candidates(uuid) from public, anon;
revoke all on function public.fn_treasury_shift_report(uuid, date, date, text) from public, anon;

grant execute on function public.fn_treasury_shift_state(uuid) to authenticated, service_role;
grant execute on function public.fn_treasury_shift_open(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.fn_treasury_shift_close(uuid, numeric, uuid, text) to authenticated, service_role;
grant execute on function public.fn_treasury_shift_handover_candidates(uuid) to authenticated, service_role;
grant execute on function public.fn_treasury_shift_report(uuid, date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. the desk gets the till: one new permission key, four roles
-- ---------------------------------------------------------------------------
-- receptionist is the role that physically holds the cash and today holds none of
-- treasury.*. This is the only authorization change in the design, and it is a custody
-- duty, not a money-editing duty: it cannot post, edit or reverse a ledger entry.
insert into public.authz_permissions (key, group_key, display_name, description, risk_level, default_scope, introduced_in)
values (
  'treasury.shift.use', 'treasury',
  'Open and close the till shift',
  'Count the drawer at the start and the end of a shift and record the handover. Moves no money.',
  'medium', 'branch', 'P3'
)
on conflict (key) do nothing;

insert into public.authz_bundle_permissions (bundle_key, permission_key)
select rb.bundle_key, 'treasury.shift.use'
  from public.authz_role_bundles rb
 where rb.role in ('receptionist'::public.app_role, 'manager'::public.app_role,
                   'accountant'::public.app_role, 'admin'::public.app_role)
on conflict (bundle_key, permission_key) do nothing;
