-- Behavioral checks for the branch-consistency links added in
-- 20261117121000_treasury_finance_schema.sql.
--
-- Everything here runs inside one transaction and is rolled back. The test
-- creates only disposable fixture rows; it never touches existing business data.

begin;

select plan(5);

insert into public.branches (id, name_en, name_ar) values
  ('11111111-1111-4111-8111-111111111111', 'PR2 Branch A', 'فرع أ'),
  ('22222222-2222-4222-8222-222222222222', 'PR2 Branch B', 'فرع ب');

insert into public.treasury (id, branch_id, name_en, name_ar) values
  ('33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111',
   'PR2 Treasury A', 'خزينة أ');

-- Route -> treasury
select throws_ok(
  $$ insert into public.treasury_payment_routes
       (branch_id, payment_method, treasury_id, requires_shift)
     values
       ('22222222-2222-4222-8222-222222222222', 'cash',
        '33333333-3333-4333-8333-333333333333', false) $$,
  '23503',
  null,
  'route rejects a treasury that belongs to another branch');

select lives_ok(
  $$ insert into public.treasury_payment_routes
       (branch_id, payment_method, treasury_id, requires_shift)
     values
       ('11111111-1111-4111-8111-111111111111', 'card',
        '33333333-3333-4333-8333-333333333333', false) $$,
  'route accepts a treasury from the same branch');

insert into public.patients (id, first_name_en, branch_id) values
  ('44444444-4444-4444-8444-444444444444', 'PR2 Patient',
   '11111111-1111-4111-8111-111111111111');

insert into public.invoices
  (id, invoice_number, patient_id, branch_id)
values
  ('55555555-5555-4555-8555-555555555555', 'PR2-TEST-0001',
   '44444444-4444-4444-8444-444444444444',
   '11111111-1111-4111-8111-111111111111');

-- Batch -> invoice
select throws_ok(
  $$ insert into public.payment_batches
       (branch_id, patient_id, invoice_id, idempotency_key)
     values
       ('22222222-2222-4222-8222-222222222222',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
        'pr2-test-key-0001') $$,
  '23503',
  null,
  'batch rejects an invoice that belongs to another branch');

select lives_ok(
  $$ insert into public.payment_batches
       (branch_id, patient_id, invoice_id, idempotency_key)
     values
       ('11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
        'pr2-test-key-0002') $$,
  'batch accepts an invoice from the same branch');

-- Payment -> shift
select throws_ok(
  $$ insert into public.payments
       (patient_id, amount, payment_method, shift_id, branch_id)
     values
       ('44444444-4444-4444-8444-444444444444', 1, 'cash',
        '66666666-6666-4666-8666-666666666666', null) $$,
  '23514',
  null,
  'payment attached to a shift must carry a branch');

select * from finish();

rollback;
