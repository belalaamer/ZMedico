-- Financial-cycle ledger separation for Blitz Physio.
-- Historical treasury rows and their append-only transactions are retained.
-- The new cycle is scheduled for 2026-12-01; no current balance is rewritten.

create table if not exists public.financial_cycles (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name_en text not null,
  name_ar text not null,
  start_date date not null,
  end_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financial_cycles_valid_dates check (end_date is null or end_date >= start_date)
);

create unique index if not exists financial_cycles_branch_start_uq
  on public.financial_cycles(branch_id, start_date);

alter table public.treasury
  add column if not exists financial_cycle_id uuid
    references public.financial_cycles(id) on delete restrict,
  add column if not exists account_kind text not null default 'cash'
    check (account_kind in ('cash','bank')),
  add column if not exists is_default boolean not null default false;

create unique index if not exists treasury_one_default_per_cycle
  on public.treasury(financial_cycle_id)
  where financial_cycle_id is not null and is_default;

create unique index if not exists treasury_cycle_name_uq
  on public.treasury(financial_cycle_id, lower(name_en))
  where financial_cycle_id is not null and deleted_at is null;

alter table public.financial_cycles enable row level security;
revoke all on table public.financial_cycles from public, anon, authenticated;

create or replace function public._financial_cycle_for_date(
  _branch_id uuid,
  _business_date date
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_count integer;
begin
  if _branch_id is null or _business_date is null then
    return null;
  end if;

  select count(*)::integer, (array_agg(fc.id order by fc.start_date desc))[1]
    into v_count, v_id
  from public.financial_cycles fc
  where fc.branch_id = _branch_id
    and fc.start_date <= _business_date
    and (fc.end_date is null or fc.end_date >= _business_date);

  if v_count > 1 then
    raise exception 'Overlapping financial cycles for branch % on %', _branch_id, _business_date
      using errcode = '23514';
  end if;
  return v_id;
end;
$function$;

revoke all on function public._financial_cycle_for_date(uuid,date) from public, anon, authenticated;

create or replace function public.fn_financial_cycle_current(_branch_id uuid)
returns table (
  cycle_id uuid,
  name_en text,
  name_ar text,
  start_date date,
  end_date date,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not (
       public.has_permission(v_actor,'treasury.view')
       or public.has_permission(v_actor,'treasury.shift.use')
       or public.has_permission(v_actor,'expenses.view')
       or public.has_permission(v_actor,'expenses.create')
       or public.has_permission(v_actor,'reports.view')
       or public.has_role(v_actor,'accountant'::public.app_role)
       or public.has_role(v_actor,'manager'::public.app_role)
       or public.has_role(v_actor,'admin'::public.app_role)
       or public.has_role(v_actor,'system_owner'::public.app_role)
     )
     or _branch_id is null
     or not public.user_has_branch_access(_branch_id) then
    raise exception 'Forbidden: financial cycle outside caller scope' using errcode='42501';
  end if;

  return query
  select fc.id, fc.name_en, fc.name_ar, fc.start_date, fc.end_date,
    case
      when v_today < fc.start_date then 'scheduled'
      when fc.end_date is not null and v_today > fc.end_date then 'archived'
      else 'active'
    end
  from public.financial_cycles fc
  where fc.id = public._financial_cycle_for_date(_branch_id, v_today);
end;
$function$;

revoke all on function public.fn_financial_cycle_current(uuid) from public, anon;
grant execute on function public.fn_financial_cycle_current(uuid) to authenticated;

create or replace function public.fn_financial_cycles_for_branch(_branch_id uuid)
returns table (
  cycle_id uuid,
  name_en text,
  name_ar text,
  start_date date,
  end_date date,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not (
       public.has_permission(v_actor,'treasury.view')
       or public.has_permission(v_actor,'expenses.view')
       or public.has_permission(v_actor,'expenses.create')
       or public.has_permission(v_actor,'reports.view')
       or public.has_role(v_actor,'accountant'::public.app_role)
       or public.has_role(v_actor,'manager'::public.app_role)
       or public.has_role(v_actor,'admin'::public.app_role)
       or public.has_role(v_actor,'system_owner'::public.app_role)
     )
     or _branch_id is null
     or not public.user_has_branch_access(_branch_id) then
    raise exception 'Forbidden: financial cycles outside caller scope' using errcode='42501';
  end if;

  return query
  select fc.id, fc.name_en, fc.name_ar, fc.start_date, fc.end_date,
    case
      when v_today < fc.start_date then 'scheduled'
      when fc.end_date is not null and v_today > fc.end_date then 'archived'
      else 'active'
    end
  from public.financial_cycles fc
  where fc.branch_id = _branch_id
  order by fc.start_date desc;
end;
$function$;

revoke all on function public.fn_financial_cycles_for_branch(uuid) from public, anon;
grant execute on function public.fn_financial_cycles_for_branch(uuid) to authenticated;

-- Seed the existing ledger as the initial cycle; do not change its balances or transactions.
do $seed$
declare
  v_branch uuid := 'd0c1a50b-8de3-4a32-9b8f-19ff6309a773';
  v_old_cycle uuid;
  v_old_treasury uuid;
  v_start date;
begin
  select min(x.d) into v_start
  from (
    select min(i.invoice_date) as d from public.invoices i where i.branch_id = v_branch
    union all
    select min(p.payment_date) from public.payments p where p.branch_id = v_branch
    union all
    select min(e.expense_date) from public.expenses e where e.branch_id = v_branch
    union all
    select min((t.created_at at time zone 'Africa/Cairo')::date)
      from public.treasury t where t.branch_id = v_branch and t.deleted_at is null
  ) x;

  v_start := coalesce(v_start, date '2026-05-01');

  select fc.id into v_old_cycle
  from public.financial_cycles fc
  where fc.branch_id = v_branch and fc.start_date = v_start;

  if v_old_cycle is null then
    insert into public.financial_cycles
      (branch_id,name_en,name_ar,start_date,end_date)
    values
      (v_branch,'Blitz Physio – Initial Cycle','بليتز فيزيو – الدورة السابقة',
       v_start,date '2026-11-30')
    returning id into v_old_cycle;
  end if;

  select t.id into v_old_treasury
  from public.treasury t
  where t.branch_id = v_branch and t.deleted_at is null
  order by t.created_at,t.id
  limit 1;

  if v_old_treasury is null then
    raise exception 'Blitz Physio has no current treasury; refusing to seed financial cycles';
  end if;

  update public.treasury
     set financial_cycle_id = v_old_cycle,
         account_kind = 'cash',
         is_default = true,
         is_active = true
   where id = v_old_treasury;

end;
$seed$;

-- Resolve a default account by the current Cairo business date for cycle-enabled branches.
create or replace function public.default_treasury_for_branch(_branch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_claim_role text := coalesce(auth.jwt()->>'role','');
  v_sql_role text := coalesce(current_setting('role',true),'none');
  v_trusted_internal boolean;
  v_treasury uuid;
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  v_cycle uuid;
begin
  v_trusted_internal := (v_claim_role='service_role' and v_sql_role='service_role')
    or (v_claim_role='' and session_user in ('postgres','supabase_admin')
      and v_sql_role in ('none','postgres','supabase_admin'));

  if not v_trusted_internal then
    if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
    if not (
      public.has_permission(v_actor,'invoices.create')
      or public.has_permission(v_actor,'expenses.create')
      or public.has_permission(v_actor,'expenses.view')
      or public.has_permission(v_actor,'treasury.view')
      or public.has_permission(v_actor,'treasury.tx.write')
      or public.has_role(v_actor,'accountant'::public.app_role)
      or public.has_role(v_actor,'manager'::public.app_role)
    ) then raise exception 'Financial permission required' using errcode='42501'; end if;
    if _branch_id is null or not public.user_has_branch_access(_branch_id) then
      raise exception 'Default treasury outside caller scope' using errcode='42501';
    end if;
  end if;

  select public._financial_cycle_for_date(_branch_id,v_today) into v_cycle;

  if v_cycle is not null then
    select t.id into v_treasury
    from public.treasury t
    where t.branch_id = _branch_id
      and t.financial_cycle_id = v_cycle
      and t.account_kind = 'cash'
      and t.is_default
      and t.deleted_at is null
    order by t.created_at,t.id
    limit 1;
    return v_treasury;
  end if;

  -- Branches not yet using financial cycles retain the established lookup behavior.
  if exists (select 1 from public.financial_cycles fc where fc.branch_id = _branch_id) then
    return null;
  end if;

  select t.id into v_treasury
  from public.treasury t
  where t.branch_id = _branch_id and t.is_active and t.deleted_at is null
  order by t.created_at,t.id
  limit 1;
  return v_treasury;
end;
$function$;

-- Bank account selection for non-cash card/bank-transfer receipts and payments.
create or replace function public.default_bank_treasury_for_branch(_branch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
  v_cycle uuid;
  v_id uuid;
begin
  v_cycle := public._financial_cycle_for_date(_branch_id,v_today);
  if v_cycle is not null then
    select t.id into v_id
    from public.treasury t
    where t.branch_id = _branch_id
      and t.financial_cycle_id = v_cycle
      and t.account_kind = 'bank'
      and t.deleted_at is null
    order by t.created_at,t.id
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
    -- Until a cycle has a dedicated bank account, preserve the prior non-cash bucket.
    return public.default_treasury_for_branch(_branch_id);
  end if;

  if exists (select 1 from public.financial_cycles fc where fc.branch_id = _branch_id) then
    return null;
  end if;

  return public.default_treasury_for_branch(_branch_id);
end;
$function$;

revoke all on function public.default_bank_treasury_for_branch(uuid) from public, anon, authenticated;
revoke all on function public.default_treasury_for_branch(uuid) from public, anon;
grant execute on function public.default_treasury_for_branch(uuid) to authenticated;

create or replace function public._tg_financial_cycle_date_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_treasury uuid;
  v_treasury_cycle uuid;
  v_date date;
  v_branch uuid;
  v_expected_cycle uuid;
  v_has_cycles boolean;
begin
  v_branch := new.branch_id;

  if tg_table_name = 'payments' then
    v_date := new.payment_date;
  elsif tg_table_name = 'expenses' then
    v_date := new.expense_date;
  else
    return new;
  end if;

  if v_branch is null then return new; end if;

  select exists(select 1 from public.financial_cycles fc where fc.branch_id = v_branch)
    into v_has_cycles;
  if not v_has_cycles then return new; end if;

  v_expected_cycle := public._financial_cycle_for_date(v_branch,v_date);
  if v_expected_cycle is null then
    raise exception 'Financial date is outside every configured financial cycle'
      using errcode='23514';
  end if;

  v_treasury := new.treasury_id;
  if v_treasury is null then
    if tg_table_name = 'payments' and new.payment_method in ('card'::public.payment_method,'bank_transfer'::public.payment_method) then
      v_treasury := public.default_bank_treasury_for_branch(v_branch);
    else
      v_treasury := public.default_treasury_for_branch(v_branch);
    end if;
  end if;

  select t.financial_cycle_id into v_treasury_cycle
  from public.treasury t
  where t.id = v_treasury
    and t.branch_id = v_branch
    and t.deleted_at is null;

  if v_treasury_cycle is distinct from v_expected_cycle then
    raise exception 'Financial date does not belong to the selected treasury cycle'
      using errcode='23514';
  end if;

  return new;
end;
$function$;

revoke all on function public._tg_financial_cycle_date_guard() from public, anon, authenticated;

drop trigger if exists financial_cycle_date_guard on public.payments;
create trigger financial_cycle_date_guard
before insert or update of payment_date, treasury_id
on public.payments
for each row execute function public._tg_financial_cycle_date_guard();

drop trigger if exists financial_cycle_date_guard on public.expenses;
create trigger financial_cycle_date_guard
before insert or update of expense_date, treasury_id
on public.expenses
for each row execute function public._tg_financial_cycle_date_guard();

create or replace function public._tg_invoice_financial_cycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_has_cycles boolean;
  v_current_cycle uuid;
  v_invoice_cycle uuid;
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
begin
  if new.branch_id is null then return new; end if;

  select exists(select 1 from public.financial_cycles fc where fc.branch_id = new.branch_id)
    into v_has_cycles;
  if not v_has_cycles then return new; end if;

  v_current_cycle := public._financial_cycle_for_date(new.branch_id,v_today);
  v_invoice_cycle := public._financial_cycle_for_date(new.branch_id,new.invoice_date);

  if v_current_cycle is null or v_invoice_cycle is distinct from v_current_cycle then
    raise exception 'Invoice date must belong to the current financial cycle'
      using errcode='23514';
  end if;
  return new;
end;
$function$;

revoke all on function public._tg_invoice_financial_cycle_guard() from public, anon, authenticated;

drop trigger if exists invoice_financial_cycle_guard on public.invoices;
create trigger invoice_financial_cycle_guard
before insert or update of invoice_date, branch_id
on public.invoices
for each row execute function public._tg_invoice_financial_cycle_guard();

create or replace function public._tg_financial_reception_backdate_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_date date;
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
begin
  if tg_table_name = 'invoices' then
    v_date := new.invoice_date;
  elsif tg_table_name = 'payments' then
    v_date := new.payment_date;
  else
    return new;
  end if;

  if v_actor is not null
     and public.has_role(v_actor,'receptionist'::public.app_role)
     and not (
       public.has_role(v_actor,'admin'::public.app_role)
       or public.has_role(v_actor,'manager'::public.app_role)
       or public.has_role(v_actor,'accountant'::public.app_role)
       or public.has_role(v_actor,'system_owner'::public.app_role)
     )
     and v_date < v_today then
    raise exception 'Reception cannot backdate invoices or payments'
      using errcode='23514';
  end if;
  return new;
end;
$function$;

revoke all on function public._tg_financial_reception_backdate_guard() from public, anon, authenticated;

-- Manual adjustments and transfers can only touch the cycle currently open for new work.
-- Reversals are deliberately exempt: cancelling an old payment/expense must reverse
-- the exact historical treasury row, even after its financial cycle has been archived.
create or replace function public._tg_treasury_tx_cycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_branch uuid;
  v_treasury_cycle uuid;
  v_current_cycle uuid;
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
begin
  if new.reference_type not in ('manual','adjustment','transfer') then
    return new;
  end if;

  select t.branch_id, t.financial_cycle_id
    into v_branch, v_treasury_cycle
  from public.treasury t
  where t.id = new.treasury_id and t.deleted_at is null;

  if not found then
    raise exception 'Treasury not found for financial-cycle transaction'
      using errcode='23503';
  end if;

  if not exists (select 1 from public.financial_cycles fc where fc.branch_id = v_branch) then
    return new;
  end if;

  v_current_cycle := public._financial_cycle_for_date(v_branch,v_today);
  if v_current_cycle is null or v_treasury_cycle is distinct from v_current_cycle then
    raise exception 'Manual treasury entries and transfers must use the current financial cycle'
      using errcode='23514';
  end if;
  return new;
end;
$function$;

revoke all on function public._tg_treasury_tx_cycle_guard() from public, anon, authenticated;

drop trigger if exists treasury_tx_cycle_guard on public.treasury_transactions;
create trigger treasury_tx_cycle_guard
before insert on public.treasury_transactions
for each row execute function public._tg_treasury_tx_cycle_guard();

drop trigger if exists financial_reception_backdate_guard on public.invoices;
create trigger financial_reception_backdate_guard
before insert or update of invoice_date
on public.invoices
for each row execute function public._tg_financial_reception_backdate_guard();

drop trigger if exists financial_reception_backdate_guard on public.payments;
create trigger financial_reception_backdate_guard
before insert or update of payment_date
on public.payments
for each row execute function public._tg_financial_reception_backdate_guard();

-- Cashier custody applies to cash tills only, and only the date-effective cycle.
create or replace function public.fn_treasury_shift_state(_branch_id uuid)
returns table (
  treasury_id uuid, name_en text, name_ar text, currency text,
  shift_id uuid, shift_status text, opened_at timestamptz, opened_by uuid,
  opener_name text, opening_counted numeric, opening_book numeric, opening_gap numeric,
  inherited_counted numeric, opening_variance numeric, shift_cash_income numeric,
  shift_cash_outflow numeric, shift_non_cash_income numeric, shift_non_cash_outflow numeric,
  shift_entries integer, expected_cash numeric, cumulative_cash numeric,
  unexplained_book_movement numeric, last_closed_at timestamptz,
  last_closer_name text, last_counted numeric, last_variance numeric,
  last_handed_over_name text
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare
  v_branch uuid;
  v_cycle uuid;
  v_today date := (statement_timestamp() at time zone 'Africa/Cairo')::date;
begin
  v_branch := public._treasury_shift_authorize_branch(_branch_id, 'treasury.shift.use');
  v_cycle := public._financial_cycle_for_date(v_branch,v_today);

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
    case when cur.id is not null
         then cur.opening_counted + (t.current_balance - cur.opening_book) end,
    t.current_balance,
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
    and t.account_kind = 'cash'
    and (v_cycle is null or t.financial_cycle_id = v_cycle)
    and (v_cycle is not null or t.financial_cycle_id is null)
  order by t.created_at;
end;
$function$;

-- Route card/bank-transfer receipts to the Bank Treasury, while cash remains in Clinic Safe.
create or replace function public.tg_payment_after_insert()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  t uuid;
  is_cash boolean;
  is_wallet_spend boolean;
begin
  is_wallet_spend := (NEW.payment_method = 'wallet'::public.payment_method AND NEW.is_wallet_topup = false);

  t := NEW.treasury_id;
  if t is null and NEW.branch_id is not null then
    if NEW.payment_method in ('card'::public.payment_method,'bank_transfer'::public.payment_method) then
      t := public.default_bank_treasury_for_branch(NEW.branch_id);
    else
      t := public.default_treasury_for_branch(NEW.branch_id);
    end if;
    if t is not null then
      update public.payments set treasury_id = t where id = NEW.id;
    end if;
  end if;

  if not is_wallet_spend and t is null then
    raise exception 'Payment % has no treasury and no default treasury for branch %', NEW.id, NEW.branch_id
      using errcode = 'check_violation';
  end if;

  if t is not null and not is_wallet_spend then
    is_cash := (NEW.payment_method = 'cash'::public.payment_method);
    perform public.add_treasury_tx(
      t, 'income'::public.treasury_tx_type, NEW.amount,
      'payment', NEW.id,
      'Payment received #' || coalesce(NEW.reference_number, substring(NEW.id::text,1,8)),
      'دفعة مستلمة #' || coalesce(NEW.reference_number, substring(NEW.id::text,1,8)),
      NEW.received_by, is_cash);
  end if;

  if NEW.invoice_id is not null then
    perform public.recalc_invoice_payments(NEW.invoice_id);
  end if;
  return NEW;
end;
$function$;

-- Route bank-paid expenses to Bank Treasury; retain the existing cash/non-cash allocation logic.
create or replace function public.tg_expense_after_insert()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  t uuid;
  v_cash_balance numeric(14,2);
  v_from_cash numeric(14,2);
  v_from_noncash numeric(14,2);
begin
  t := NEW.treasury_id;
  if t is null then
    if NEW.payment_method in ('card'::public.expense_method,'bank_transfer'::public.expense_method) then
      t := public.default_bank_treasury_for_branch(NEW.branch_id);
    else
      t := public.default_treasury_for_branch(NEW.branch_id);
    end if;
    if t is not null then
      update public.expenses set treasury_id = t where id = NEW.id;
    end if;
  end if;

  if t is null then
    raise exception 'Expense % has no treasury and no default treasury for branch %', NEW.id, NEW.branch_id
      using errcode = 'check_violation';
  end if;

  select current_balance into v_cash_balance from public.treasury where id = t;
  v_cash_balance := coalesce(v_cash_balance,0);

  if v_cash_balance >= NEW.amount then
    v_from_cash := NEW.amount;
    v_from_noncash := 0;
  elsif v_cash_balance > 0 then
    v_from_cash := v_cash_balance;
    v_from_noncash := NEW.amount - v_cash_balance;
  else
    v_from_cash := 0;
    v_from_noncash := NEW.amount;
  end if;

  if v_from_cash > 0 then
    perform public.add_treasury_tx(
      t,'expense'::public.treasury_tx_type,v_from_cash,
      'expense',NEW.id,
      coalesce(NEW.description_en,'Expense'),
      coalesce(NEW.description_ar,'مصروف'),
      NEW.created_by,true);
  end if;

  if v_from_noncash > 0 then
    perform public.add_treasury_tx(
      t,'expense'::public.treasury_tx_type,v_from_noncash,
      'expense',NEW.id,
      coalesce(NEW.description_en,'Expense'),
      coalesce(NEW.description_ar,'مصروف'),
      NEW.created_by,false);
  end if;
  return NEW;
end;
$function$;

-- Cycle state is derived from its Cairo-local date range at read/write time.
-- This avoids relying on pg_cron, which is not currently executing reliably on this project.

-- Verify the existing Clinic Safe is the active default for the seeded historical cycle.
do $verify$
declare
  v_branch uuid := 'd0c1a50b-8de3-4a32-9b8f-19ff6309a773';
  v_current uuid;
  v_current_default uuid;
  v_expected_default uuid;
begin
  v_current := public._financial_cycle_for_date(
    v_branch,(statement_timestamp() at time zone 'Africa/Cairo')::date
  );
  select public.default_treasury_for_branch(v_branch) into v_current_default;
  select t.id into v_expected_default
  from public.treasury t
  where t.branch_id=v_branch and t.financial_cycle_id=v_current
    and t.is_default and t.deleted_at is null;

  if v_current is null or v_current_default is null
     or v_current_default is distinct from v_expected_default then
    raise exception 'Financial cycle seed verification failed: current Clinic Safe is not the cycle default';
  end if;
end;
$verify$;
