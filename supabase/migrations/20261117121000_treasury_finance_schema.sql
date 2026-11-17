-- PR-2/6: additive treasury finance schema.
--
-- This migration adds columns, tables, indexes, and constraints only.
-- It does not delete rows, tables, columns, or historical ledger entries.
-- It intentionally does not backfill treasury_transactions: that table is
-- append-only and historical rows keep financial_cycle_id NULL.
--
-- No function in this file writes money. Guards and RPCs arrive in later,
-- separately reviewed migrations.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. treasury: custodian drawer metadata (account_kind stays cash|bank)
-- ---------------------------------------------------------------------------

alter table public.treasury
  add column if not exists custodian_user_id uuid,
  add column if not exists parent_treasury_id uuid;

alter table public.treasury
  add constraint treasury_custodian_fk
    foreign key (custodian_user_id)
    references auth.users(id)
    on delete restrict;

alter table public.treasury
  add constraint treasury_parent_fk
    foreign key (parent_treasury_id)
    references public.treasury(id)
    on delete restrict;

-- A drawer is cash + custodian + parent. Main cash and bank accounts have both
-- fields null. This deliberately avoids changing the existing account_kind
-- check, so no constraint or historical row must be removed.
alter table public.treasury
  add constraint treasury_drawer_shape check (
    (custodian_user_id is null and parent_treasury_id is null)
    or
    (account_kind = 'cash'
      and custodian_user_id is not null
      and parent_treasury_id is not null)
  );

alter table public.treasury
  add constraint treasury_parent_not_self check (
    parent_treasury_id is null or parent_treasury_id <> id
  );

create unique index if not exists treasury_one_active_drawer_per_custodian
  on public.treasury (branch_id, custodian_user_id)
  where account_kind = 'cash'
    and custodian_user_id is not null
    and is_active
    and deleted_at is null;

create index if not exists treasury_parent_idx
  on public.treasury (parent_treasury_id)
  where parent_treasury_id is not null;

-- ---------------------------------------------------------------------------
-- 2. treasury_shifts: status, custody, and settlement links
-- ---------------------------------------------------------------------------

alter table public.treasury_shifts
  add column if not exists custodian_user_id uuid,
  add column if not exists status text not null default 'open',
  add column if not exists settled_at timestamptz,
  add column if not exists settlement_tx_id uuid,
  add column if not exists variance_tx_id uuid;

-- Safe for environments that already have shift rows; Production currently
-- has none. Existing rows inherit the opener as custodian.
update public.treasury_shifts
   set custodian_user_id = opened_by
 where custodian_user_id is null;

update public.treasury_shifts
   set status = case when closed_at is null then 'open' else 'closed' end
 where status is null or status = 'open';

alter table public.treasury_shifts
  alter column custodian_user_id set not null;

alter table public.treasury_shifts
  add constraint treasury_shift_custodian_fk
    foreign key (custodian_user_id)
    references auth.users(id)
    on delete restrict;

alter table public.treasury_shifts
  add constraint treasury_shift_settlement_tx_fk
    foreign key (settlement_tx_id)
    references public.treasury_transactions(id)
    on delete restrict;

alter table public.treasury_shifts
  add constraint treasury_shift_variance_tx_fk
    foreign key (variance_tx_id)
    references public.treasury_transactions(id)
    on delete restrict;

alter table public.treasury_shifts
  add constraint treasury_shift_custodian_is_opener
    check (custodian_user_id = opened_by);

alter table public.treasury_shifts
  add constraint treasury_shift_status_allowed
    check (status in ('open','closed','settled','handed_over'));

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
      and settlement_tx_id is not null)
  );

alter table public.treasury_shifts
  add constraint treasury_shift_handover_shape check (
    status <> 'handed_over' or handed_over_to is not null
  );

alter table public.treasury_shifts
  add constraint treasury_shift_variance_tx_required check (
    settled_at is null
    or variance is null
    or variance = 0
    or variance_tx_id is not null
  );

create unique index if not exists treasury_shifts_one_unsettled_per_custodian
  on public.treasury_shifts (custodian_user_id)
  where settled_at is null;

create unique index if not exists treasury_shifts_one_unsettled_per_drawer
  on public.treasury_shifts (treasury_id)
  where settled_at is null;

create or replace function public._tg_treasury_shift_status()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    new.custodian_user_id := coalesce(new.custodian_user_id, new.opened_by);
  end if;

  new.status := case
    when new.settled_at is not null and new.handed_over_to is not null then 'handed_over'
    when new.settled_at is not null then 'settled'
    when new.closed_at is not null then 'closed'
    else 'open'
  end;

  return new;
end;
$function$;

create trigger treasury_shift_status
before insert or update on public.treasury_shifts
for each row execute function public._tg_treasury_shift_status();

-- ---------------------------------------------------------------------------
-- 3. payment/expense/ledger cycle and batch columns
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists shift_id uuid,
  add column if not exists payment_batch_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists financial_cycle_id uuid,
  add column if not exists split_index smallint;

alter table public.expenses
  add column if not exists financial_cycle_id uuid;

alter table public.treasury_transactions
  add column if not exists financial_cycle_id uuid;

alter table public.payments
  add constraint payments_split_index_positive
    check (split_index is null or split_index >= 1);

alter table public.payments
  add constraint payments_batch_split_shape
    check (
      (payment_batch_id is null and split_index is null)
      or
      (payment_batch_id is not null and split_index is not null)
    );

create unique index if not exists payments_batch_split_uq
  on public.payments (payment_batch_id, split_index)
  where payment_batch_id is not null;

create index if not exists payments_shift_idx
  on public.payments (shift_id)
  where shift_id is not null;

create index if not exists payments_financial_cycle_idx
  on public.payments (financial_cycle_id)
  where financial_cycle_id is not null;

create index if not exists expenses_financial_cycle_idx
  on public.expenses (financial_cycle_id)
  where financial_cycle_id is not null;

create index if not exists treasury_tx_financial_cycle_idx
  on public.treasury_transactions (financial_cycle_id)
  where financial_cycle_id is not null;

-- ---------------------------------------------------------------------------
-- 4. payment batches and explicit routes
-- ---------------------------------------------------------------------------

create table if not exists public.payment_batches (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  shift_id uuid references public.treasury_shifts(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  financial_cycle_id uuid references public.financial_cycles(id) on delete restrict,
  idempotency_key text not null,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'posted',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  constraint payment_batches_total_non_negative check (total_amount >= 0),
  constraint payment_batches_key_length check (char_length(idempotency_key) between 8 and 200),
  constraint payment_batches_status_allowed check (status in ('posted','reversed')),
  constraint payment_batches_idempotency_uq unique (branch_id, idempotency_key)
);

create table if not exists public.treasury_payment_routes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  financial_cycle_id uuid references public.financial_cycles(id) on delete restrict,
  payment_method public.payment_method not null,
  treasury_id uuid references public.treasury(id) on delete restrict,
  requires_shift boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint treasury_payment_routes_shape check (
    (requires_shift and treasury_id is null)
    or
    (not requires_shift and treasury_id is not null)
  )
);

create unique index if not exists treasury_payment_routes_default_uq
  on public.treasury_payment_routes (branch_id, payment_method)
  where financial_cycle_id is null;

create unique index if not exists treasury_payment_routes_cycle_uq
  on public.treasury_payment_routes (branch_id, financial_cycle_id, payment_method)
  where financial_cycle_id is not null;

alter table public.payment_batches enable row level security;
revoke all on table public.payment_batches from public, anon, authenticated;

alter table public.treasury_payment_routes enable row level security;
revoke all on table public.treasury_payment_routes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. foreign keys between the new columns and their source rows
-- ---------------------------------------------------------------------------

alter table public.payments
  add constraint payments_shift_fk
    foreign key (shift_id) references public.treasury_shifts(id)
    on delete restrict;

alter table public.payments
  add constraint payments_batch_fk
    foreign key (payment_batch_id) references public.payment_batches(id)
    on delete restrict;

alter table public.payments
  add constraint payments_cycle_fk
    foreign key (financial_cycle_id) references public.financial_cycles(id)
    on delete restrict;

alter table public.expenses
  add constraint expenses_cycle_fk
    foreign key (financial_cycle_id) references public.financial_cycles(id)
    on delete restrict;

alter table public.treasury_transactions
  add constraint treasury_tx_cycle_fk
    foreign key (financial_cycle_id) references public.financial_cycles(id)
    on delete restrict;

-- ---------------------------------------------------------------------------
-- 6. branch/cycle composite FKs
-- ---------------------------------------------------------------------------

create unique index if not exists financial_cycles_branch_id_id_uq
  on public.financial_cycles (branch_id, id);

alter table public.treasury
  add constraint treasury_branch_cycle_fk
    foreign key (branch_id, financial_cycle_id)
    references public.financial_cycles (branch_id, id)
    on delete restrict
    not valid;

alter table public.treasury
  validate constraint treasury_branch_cycle_fk;

alter table public.payments
  add constraint payments_branch_cycle_fk
    foreign key (branch_id, financial_cycle_id)
    references public.financial_cycles (branch_id, id)
    on delete restrict
    not valid;

alter table public.payments
  validate constraint payments_branch_cycle_fk;

alter table public.expenses
  add constraint expenses_branch_cycle_fk
    foreign key (branch_id, financial_cycle_id)
    references public.financial_cycles (branch_id, id)
    on delete restrict
    not valid;

alter table public.expenses
  validate constraint expenses_branch_cycle_fk;

alter table public.payment_batches
  add constraint payment_batches_branch_cycle_fk
    foreign key (branch_id, financial_cycle_id)
    references public.financial_cycles (branch_id, id)
    on delete restrict
    not valid;

alter table public.payment_batches
  validate constraint payment_batches_branch_cycle_fk;

alter table public.treasury_payment_routes
  add constraint treasury_payment_routes_branch_cycle_fk
    foreign key (branch_id, financial_cycle_id)
    references public.financial_cycles (branch_id, id)
    on delete restrict
    not valid;

alter table public.treasury_payment_routes
  validate constraint treasury_payment_routes_branch_cycle_fk;
