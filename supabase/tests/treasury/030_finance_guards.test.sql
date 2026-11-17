-- Catalog + behavioral checks for 20261117122000_treasury_finance_guards.sql.
--
-- All fixture rows are created inside this transaction and rolled back. The
-- negative payment tests stop at a BEFORE trigger or a constraint, so they do
-- not reach the post-insert treasury effect.

begin;

select plan(24);

-- ---------------------------------------------------------------------------
-- Catalog contract
-- ---------------------------------------------------------------------------

select ok(
  to_regclass('public.patients_id_branch_uq') is not null,
  'patients (id,branch_id) unique index exists');
select ok(
  to_regclass('public.payment_batches_id_branch_uq') is not null,
  'payment_batches (id,branch_id) unique index exists');

select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payment_batches'::regclass
             and conname='payment_batches_patient_branch_fk'),
  'payment batch patient/branch FK exists');
select ok(
  (select convalidated from pg_constraint
    where conrelid='public.payment_batches'::regclass
      and conname='payment_batches_patient_branch_fk'),
  'payment batch patient/branch FK is validated');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.payment_batches'::regclass
      and conname='payment_batches_patient_branch_fk')
    ilike '%(patient_id, branch_id)%references patients(id, branch_id)%',
  'payment batch FK compares both patient_id and branch_id');

select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payment_batches'::regclass
             and conname='payment_batches_shift_branch_fk'),
  'payment batch shift/branch FK exists');
select ok(
  (select convalidated from pg_constraint
    where conrelid='public.payment_batches'::regclass
      and conname='payment_batches_shift_branch_fk'),
  'payment batch shift/branch FK is validated');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.payment_batches'::regclass
      and conname='payment_batches_shift_branch_fk')
    ilike '%(shift_id, branch_id)%references treasury_shifts(id, branch_id)%',
  'payment batch FK compares both shift_id and branch_id');

select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payments'::regclass
             and conname='payments_batch_branch_required'),
  'payments batch branch-required check exists');
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.payments'::regclass
             and conname='payments_batch_branch_fk'),
  'payments batch/branch FK exists');
select ok(
  (select convalidated from pg_constraint
    where conrelid='public.payments'::regclass
      and conname='payments_batch_branch_fk'),
  'payments batch/branch FK is validated');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.payments'::regclass
      and conname='payments_batch_branch_fk')
    ilike '%(payment_batch_id, branch_id)%references payment_batches(id, branch_id)%',
  'payments batch FK compares both payment_batch_id and branch_id');

select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.treasury_payment_routes'::regclass
             and conname='treasury_payment_routes_cash_requires_shift'),
  'cash routes require a shift check exists');

select ok(
  exists (select 1 from pg_trigger
           where tgrelid='public.payments'::regclass
             and tgname='trg_payment_invoice_cycle'
             and not tgisinternal),
  'payment invoice-cycle trigger exists');
select ok(
  to_regprocedure('public._tg_payment_invoice_cycle()') is not null,
  'payment invoice-cycle function exists');
select ok(
  position('_financial_cycle_for_date' in
    pg_get_functiondef('public._tg_payment_invoice_cycle()'::regprocedure)) > 0,
  'invoice-cycle guard uses the branch/date cycle resolver');
select ok(
  position('does not match invoice' in
    pg_get_functiondef('public._tg_payment_invoice_cycle()'::regprocedure)) > 0,
  'invoice-cycle guard rejects a mismatched cycle');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into public.branches (id, name_en, name_ar) values
  ('a1111111-1111-4111-8111-111111111111', 'PR3 Branch A', 'فرع أ'),
  ('a2222222-2222-4222-8222-222222222222', 'PR3 Branch B', 'فرع ب');

insert into public.treasury (id, branch_id, name_en, name_ar) values
  ('a3333333-3333-4333-8333-333333333333',
   'a1111111-1111-4111-8111-111111111111',
   'PR3 Treasury A', 'خزينة أ');

insert into public.patients (id, first_name_en, branch_id) values
  ('a4444444-4444-4444-8444-444444444444', 'PR3 Patient',
   'a1111111-1111-4111-8111-111111111111');

insert into public.financial_cycles
  (id, branch_id, name_en, name_ar, start_date, end_date)
values
  ('a5555555-5555-4555-8555-555555555555',
   'a1111111-1111-4111-8111-111111111111',
   'PR3 Cycle A', 'دورة أ', date '2026-01-01', date '2026-12-31'),
  ('a6666666-6666-4666-8666-666666666666',
   'a2222222-2222-4222-8222-222222222222',
   'PR3 Cycle B', 'دورة ب', date '2026-01-01', date '2026-12-31');

insert into public.invoices
  (id, invoice_number, patient_id, branch_id, invoice_date, subtotal, total)
values
  ('a7777777-7777-4777-8777-777777777777', 'PR3-TEST-0001',
   'a4444444-4444-4444-8444-444444444444',
   'a1111111-1111-4111-8111-111111111111',
   date '2026-06-01', 100, 100);

-- ---------------------------------------------------------------------------
-- Behavior
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.treasury_payment_routes
       (branch_id, payment_method, treasury_id, requires_shift)
     values
       ('a1111111-1111-4111-8111-111111111111', 'cash',
        'a3333333-3333-4333-8333-333333333333', false) $$,
  '23514',
  null,
  'cash route without a shift is rejected');

select lives_ok(
  $$ insert into public.treasury_payment_routes
       (branch_id, payment_method, requires_shift)
     values
       ('a1111111-1111-4111-8111-111111111111', 'cash', true) $$,
  'cash route with a shift is accepted');

select throws_ok(
  $$ insert into public.payment_batches
       (branch_id, patient_id, idempotency_key)
     values
       ('a2222222-2222-4222-8222-222222222222',
        'a4444444-4444-4444-8444-444444444444',
        'pr3-batch-0001') $$,
  '23503',
  null,
  'batch rejects a patient from another branch');

select lives_ok(
  $$ insert into public.payment_batches
       (id, branch_id, patient_id, idempotency_key)
     values
       ('a8888888-8888-4888-8888-888888888888',
        'a1111111-1111-4111-8111-111111111111',
        'a4444444-4444-4444-8444-444444444444',
        'pr3-batch-0002') $$,
  'batch accepts a patient from the same branch');

select throws_ok(
  $$ insert into public.payments
       (patient_id, branch_id, payment_batch_id, amount, payment_method)
     values
       ('a4444444-4444-4444-8444-444444444444',
        'a2222222-2222-4222-8222-222222222222',
        'a8888888-8888-4888-8888-888888888888',
        1, 'cash') $$,
  '23503',
  null,
  'payment rejects a batch from another branch');

select throws_ok(
  $$ insert into public.payments
       (patient_id, amount, payment_method, payment_batch_id, branch_id)
     values
       ('a4444444-4444-4444-8444-444444444444', 1, 'cash',
        'a8888888-8888-4888-8888-888888888888', null) $$,
  '23514',
  null,
  'payment with a batch must carry a branch');

select throws_ok(
  $$ insert into public.payments
       (patient_id, branch_id, invoice_id, financial_cycle_id,
        amount, payment_method)
     values
       ('a4444444-4444-4444-8444-444444444444',
        'a1111111-1111-4111-8111-111111111111',
        'a7777777-7777-4777-8777-777777777777',
        'a6666666-6666-4666-8666-666666666666',
        1, 'cash') $$,
  '23514',
  null,
  'payment cycle must match the linked invoice cycle');

select * from finish();

rollback;
