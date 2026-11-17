-- Catalog contract for 20261117121000_treasury_finance_schema.sql.
--
-- Read-only assertions only. This file never inserts, updates, or deletes a
-- business row. It is intended for a disposable/QA database with pgTAP.

begin;

select plan(46);

-- treasury: drawer metadata
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='treasury'
             and column_name='custodian_user_id'),
  'treasury.custodian_user_id exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='treasury'
             and column_name='parent_treasury_id'),
  'treasury.parent_treasury_id exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.treasury'::regclass
             and conname='treasury_drawer_shape'),
  'treasury drawer shape constraint exists');
select ok(
  to_regclass('public.treasury_one_active_drawer_per_custodian') is not null,
  'one active drawer per custodian index exists');

-- treasury_shifts: custody and settlement
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='treasury_shifts'
             and column_name='custodian_user_id'),
  'treasury_shifts.custodian_user_id exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='treasury_shifts'
             and column_name='status'),
  'treasury_shifts.status exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='treasury_shifts'
             and column_name='settled_at'),
  'treasury_shifts.settled_at exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='treasury_shifts'
             and column_name='settlement_tx_id'),
  'treasury_shifts.settlement_tx_id exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='treasury_shifts'
             and column_name='variance_tx_id'),
  'treasury_shifts.variance_tx_id exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.treasury_shifts'::regclass
             and conname='treasury_shift_status_shape'),
  'treasury shift status shape constraint exists');
select ok(
  to_regclass('public.treasury_shifts_one_unsettled_per_custodian') is not null,
  'one unsettled shift per custodian index exists');
select ok(
  to_regclass('public.treasury_shifts_one_unsettled_per_drawer') is not null,
  'one unsettled shift per drawer index exists');

-- payments: shift, batch, idempotency, cycle, split
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='payments'
             and column_name='shift_id'),
  'payments.shift_id exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='payments'
             and column_name='payment_batch_id'),
  'payments.payment_batch_id exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='payments'
             and column_name='idempotency_key'),
  'payments.idempotency_key exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='payments'
             and column_name='financial_cycle_id'),
  'payments.financial_cycle_id exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='payments'
             and column_name='split_index'),
  'payments.split_index exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payments'::regclass
             and conname='payments_batch_split_shape'),
  'payments batch/split shape constraint exists');
select ok(
  to_regclass('public.payments_batch_split_uq') is not null,
  'payments batch split unique index exists');

-- expenses and ledger cycle
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='expenses'
             and column_name='financial_cycle_id'),
  'expenses.financial_cycle_id exists');
select ok(
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='treasury_transactions'
             and column_name='financial_cycle_id'),
  'treasury_transactions.financial_cycle_id exists');

-- new tables
select ok(
  to_regclass('public.payment_batches') is not null,
  'payment_batches table exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payment_batches'::regclass
             and conname='payment_batches_idempotency_uq'),
  'payment_batches idempotency unique constraint exists');
select ok(
  to_regclass('public.treasury_payment_routes') is not null,
  'treasury_payment_routes table exists');
select ok(
  to_regclass('public.treasury_payment_routes_default_uq') is not null,
  'default route unique index exists');
select ok(
  to_regclass('public.treasury_payment_routes_cycle_uq') is not null,
  'cycle route unique index exists');

-- branch/cycle guards
select ok(
  to_regclass('public.financial_cycles_branch_id_id_uq') is not null,
  'financial_cycles (branch_id,id) unique index exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.treasury'::regclass
             and conname='treasury_branch_cycle_fk'),
  'treasury branch/cycle composite FK exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payments'::regclass
             and conname='payments_branch_cycle_fk'),
  'payments branch/cycle composite FK exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.expenses'::regclass
             and conname='expenses_branch_cycle_fk'),
  'expenses branch/cycle composite FK exists');

-- new tables are RPC-only
select ok(
  (select relrowsecurity from pg_class where oid='public.payment_batches'::regclass),
  'payment_batches has RLS enabled');
select ok(
  (select relrowsecurity from pg_class where oid='public.treasury_payment_routes'::regclass),
  'treasury_payment_routes has RLS enabled');
select ok(
  (select count(*) from pg_policies
    where schemaname='public' and tablename in ('payment_batches','treasury_payment_routes')) = 0,
  'new finance tables expose no direct RLS policy');

-- branch consistency: treasury_payment_routes -> treasury
select ok(
  to_regclass('public.treasury_id_branch_uq') is not null,
  'treasury (id,branch_id) unique index exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.treasury_payment_routes'::regclass
             and conname='treasury_payment_routes_treasury_branch_fk'),
  'treasury payment route branch/treasury FK exists');
select ok(
  (select convalidated from pg_constraint
    where conrelid='public.treasury_payment_routes'::regclass
      and conname='treasury_payment_routes_treasury_branch_fk'),
  'treasury payment route branch/treasury FK is validated');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.treasury_payment_routes'::regclass
      and conname='treasury_payment_routes_treasury_branch_fk')
    ilike '%(treasury_id, branch_id)%references treasury(id, branch_id)%',
  'treasury payment route FK compares both branch_id and treasury_id');

-- branch consistency: payment_batches -> invoices
select ok(
  to_regclass('public.invoices_id_branch_uq') is not null,
  'invoices (id,branch_id) unique index exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payment_batches'::regclass
             and conname='payment_batches_invoice_branch_fk'),
  'payment batch branch/invoice FK exists');
select ok(
  (select convalidated from pg_constraint
    where conrelid='public.payment_batches'::regclass
      and conname='payment_batches_invoice_branch_fk'),
  'payment batch branch/invoice FK is validated');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.payment_batches'::regclass
      and conname='payment_batches_invoice_branch_fk')
    ilike '%(invoice_id, branch_id)%references invoices(id, branch_id)%',
  'payment batch FK compares both branch_id and invoice_id');

-- branch consistency: payments -> treasury_shifts
select ok(
  to_regclass('public.treasury_shifts_id_branch_uq') is not null,
  'treasury_shifts (id,branch_id) unique index exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payments'::regclass
             and conname='payments_shift_branch_required'),
  'payments shift branch-required check exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payments'::regclass
             and conname='payments_shift_branch_fk'),
  'payments branch/shift FK exists');
select ok(
  (select convalidated from pg_constraint
    where conrelid='public.payments'::regclass
      and conname='payments_shift_branch_fk'),
  'payments branch/shift FK is validated');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.payments'::regclass
      and conname='payments_shift_branch_fk')
    ilike '%(shift_id, branch_id)%references treasury_shifts(id, branch_id)%',
  'payments FK compares both branch_id and shift_id');

select * from finish();

rollback;
