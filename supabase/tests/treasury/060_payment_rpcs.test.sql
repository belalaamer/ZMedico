-- Behavioral pgTAP contract for 20261117124000_treasury_payment_rpcs.sql.
--
-- Run against the disposable local harness, never Production. The harness
-- commits the fixture branch, cycle, patient, invoice, treasury, drawer, shift
-- and route rows; this test transaction is rolled back.

begin;
select plan(67);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

-- ---------------------------------------------------------------------------
-- 1. Cash collection: explicit route, open shift, cycle and batch links
-- ---------------------------------------------------------------------------

select lives_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":100,"payment_method":"cash"}]'::jsonb,
    'pr5-cash-key-0001'
  )
$q$, 'cash collection succeeds');

select is((select count(*) from public.payments), 1::bigint, 'cash collection writes one payment');
select is((select treasury_id from public.payments), 'a1111111-1111-4111-8111-111111111121'::uuid, 'cash goes to the drawer');
select is((select shift_id from public.payments), 'f1111111-1111-4111-8111-111111111111'::uuid, 'cash carries the open shift');
select is((select financial_cycle_id from public.payments), 'c1111111-1111-4111-8111-111111111111'::uuid, 'cash carries the invoice cycle');
select is((select idempotency_key from public.payments), 'pr5-cash-key-0001', 'cash carries the idempotency key');
select is((select split_index from public.payments), 1::smallint, 'cash is split index 1');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111121'), 100::numeric, 'cash drawer receives the payment');
select is((select count(*) from public.treasury_transactions where reference_type='payment' and amount=100), 1::bigint, 'cash posts exactly one ledger row');
select is((select financial_cycle_id from public.treasury_transactions where reference_type='payment' and amount=100), 'c1111111-1111-4111-8111-111111111111'::uuid, 'the payment ledger row carries the cycle');
select is((select paid_amount from public.invoices where id='e1111111-1111-4111-8111-111111111111'), 100::numeric, 'invoice paid amount is recalculated');
select is((select total_amount from public.payment_batches), 100::numeric, 'batch total equals the split');
select is((select shift_id from public.payment_batches), 'f1111111-1111-4111-8111-111111111111'::uuid, 'batch carries the cash shift');
select is((select status from public.payment_batches), 'posted', 'batch is posted');

-- ---------------------------------------------------------------------------
-- 2. Card collection: cycle-specific route wins over the default route
-- ---------------------------------------------------------------------------

select lives_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":100,"payment_method":"card"}]'::jsonb,
    'pr5-card-key-0001'
  )
$q$, 'card collection succeeds');

select is((select payment_method from public.payments where idempotency_key='pr5-card-key-0001'), 'card'::public.payment_method, 'card method is stored');
select is((select treasury_id from public.payments where idempotency_key='pr5-card-key-0001'), 'a1111111-1111-4111-8111-111111111113'::uuid, 'cycle-specific card route selects Bank 2');
select is((select shift_id from public.payments where idempotency_key='pr5-card-key-0001'), null::uuid, 'card does not carry a shift');
select is((select non_cash_balance from public.treasury where id='a1111111-1111-4111-8111-111111111113'), 100::numeric, 'card posts to non-cash balance');
select is((select is_cash from public.treasury_transactions where reference_id=(select id from public.payments where idempotency_key='pr5-card-key-0001')), false, 'card ledger row is non-cash');
select is((select shift_id from public.payment_batches where idempotency_key='pr5-card-key-0001'), null::uuid, 'card-only batch has no shift');

-- ---------------------------------------------------------------------------
-- 3. Split collection: one batch, two payment rows, one cash shift
-- ---------------------------------------------------------------------------

select lives_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":30,"payment_method":"cash"},{"amount":20,"payment_method":"card"}]'::jsonb,
    'pr5-split-key-0001'
  )
$q$, 'split collection succeeds');

select is((select count(*) from public.payments where idempotency_key='pr5-split-key-0001'), 2::bigint, 'split collection writes two rows');
select is((select total_amount from public.payment_batches where idempotency_key='pr5-split-key-0001'), 50::numeric, 'split batch total is the sum');
select is((select array_agg(split_index order by split_index) from public.payments where idempotency_key='pr5-split-key-0001'), array[1,2]::smallint[], 'split indexes are 1 and 2');
select is((select shift_id from public.payments where idempotency_key='pr5-split-key-0001' and payment_method='cash'), 'f1111111-1111-4111-8111-111111111111'::uuid, 'cash split carries the shift');
select is((select shift_id from public.payments where idempotency_key='pr5-split-key-0001' and payment_method='card'), null::uuid, 'card split has no shift');
select is((select shift_id from public.payment_batches where idempotency_key='pr5-split-key-0001'), 'f1111111-1111-4111-8111-111111111111'::uuid, 'mixed batch carries its cash shift');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111121'), 130::numeric, 'split cash portion reaches the drawer');
select is((select non_cash_balance from public.treasury where id='a1111111-1111-4111-8111-111111111113'), 120::numeric, 'split card portion reaches Bank 2');
select is((select paid_amount from public.invoices where id='e1111111-1111-4111-8111-111111111111'), 250::numeric, 'split collection recalculates the invoice once per row');
select is((select count(*) from public.treasury_transactions where reference_type='payment' and amount in (30,20)), 2::bigint, 'split collection posts two ledger rows');

-- ---------------------------------------------------------------------------
-- 4. Idempotency: exact replay, conflicting replay, reversed batch
-- ---------------------------------------------------------------------------

select is((public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":30,"payment_method":"cash"},{"amount":20,"payment_method":"card"}]'::jsonb,
    'pr5-split-key-0001'
  ) ->> 'batch_id')::uuid,
  (select id from public.payment_batches where idempotency_key='pr5-split-key-0001'),
  'exact replay returns the same batch');

select is((public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":30,"payment_method":"cash"},{"amount":20,"payment_method":"card"}]'::jsonb,
    'pr5-split-key-0001'
  ) ->> 'idempotent_replay')::boolean,
  true, 'exact replay is marked as a replay');

select is((select count(*) from public.payments where idempotency_key='pr5-split-key-0001'), 2::bigint, 'replay does not duplicate payment rows');
select is((select count(*) from public.treasury_transactions where reference_type='payment' and amount in (30,20)), 2::bigint, 'replay does not duplicate ledger rows');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":31,"payment_method":"cash"},{"amount":20,"payment_method":"card"}]'::jsonb,
    'pr5-split-key-0001'
  )
$q$, '23505', null, 'same key with different amounts is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":30,"payment_method":"cash"},{"amount":20,"payment_method":"card"}]'::jsonb,
    'pr5-split-key-0001',
    '2026-06-02'
  )
$q$, '23505', null, 'same key with a different explicit payment date is rejected');

select lives_ok($q$
  update public.payment_batches set status='reversed' where idempotency_key='pr5-split-key-0001'
$q$, 'test marks the split batch reversed');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":30,"payment_method":"cash"},{"amount":20,"payment_method":"card"}]'::jsonb,
    'pr5-split-key-0001'
  )
$q$, '23514', null, 'replay of a reversed batch is rejected');

-- ---------------------------------------------------------------------------
-- 5. A payment without an invoice still carries a cycle and batch
-- ---------------------------------------------------------------------------

select lives_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    null,
    '[{"amount":40,"payment_method":"cash"}]'::jsonb,
    'pr5-noinvoice-key-0001',
    '2026-06-05'
  )
$q$, 'collection without an invoice succeeds');

select is((select invoice_id from public.payment_batches where idempotency_key='pr5-noinvoice-key-0001'), null::uuid, 'no-invoice batch has no invoice');
select is((select financial_cycle_id from public.payments where idempotency_key='pr5-noinvoice-key-0001'), 'c1111111-1111-4111-8111-111111111111'::uuid, 'no-invoice payment derives the cycle from its date');
select is((select shift_id from public.payments where idempotency_key='pr5-noinvoice-key-0001'), 'f1111111-1111-4111-8111-111111111111'::uuid, 'no-invoice cash payment still requires a shift');

-- ---------------------------------------------------------------------------
-- 6. Invalid requests fail before any row is written
-- ---------------------------------------------------------------------------

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[]'::jsonb, 'pr5-empty-key-0001')
$q$, '22023', null, 'empty splits are rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":-1,"payment_method":"cash"}]'::jsonb, 'pr5-badamount-key-0001')
$q$, '22023', null, 'a non-positive split is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"wallet"}]'::jsonb, 'pr5-wallet-key-0001')
$q$, '0A000', null, 'wallet is not handled by the collection RPC');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"not-a-method"}]'::jsonb, 'pr5-badmethod-key-0001')
$q$, '22023', null, 'an unknown payment method is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd2222222-2222-4222-8222-222222222222',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-patientbranch-key-0001')
$q$, '23514', null, 'a patient from another branch is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e2222222-2222-4222-8222-222222222222',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-invoicebranch-key-0001')
$q$, '23514', null, 'an invoice from another branch is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111113',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-cancelled-key-0001')
$q$, '23514', null, 'a cancelled invoice is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111112',
    '[{"amount":150,"payment_method":"cash"}]'::jsonb, 'pr5-overpay-key-0001')
$q$, '23514', null, 'a batch that overpays the invoice is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b2222222-2222-4222-8222-222222222222',
    'd2222222-2222-4222-8222-222222222222',
    'e2222222-2222-4222-8222-222222222222',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-noroute-key-0001')
$q$, '23514', null, 'a branch without a route is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b2222222-2222-4222-8222-222222222222',
    'd2222222-2222-4222-8222-222222222222',
    'e2222222-2222-4222-8222-222222222223',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-nocycle-key-0001')
$q$, '23514', null, 'a payment outside every financial cycle is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"card"}]'::jsonb, 'pr5-cardshift-key-0001',
    null, 'f1111111-1111-4111-8111-111111111111')
$q$, '23514', null, 'a non-shift route cannot be given a shift');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-wrongshift-key-0001',
    null, 'f9999999-9999-4999-8999-999999999999')
$q$, '23514', null, 'an unknown shift is rejected');

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"bank_transfer"}]'::jsonb, 'pr5-oldbank-key-0001')
$q$, '23514', null, 'a route to a treasury in another cycle is rejected');

-- ---------------------------------------------------------------------------
-- 7. Authorization
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111112',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-manager-key-0001')
$q$, '42501', null, 'a manager without invoices.create cannot collect');

set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';
select lives_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111112',
    '[{"amount":10,"payment_method":"cash"}]'::jsonb, 'pr5-accountant-key-0001')
$q$, 'an accountant with invoices.create can collect through the derived ledger path');

-- ---------------------------------------------------------------------------
-- 8. Route deactivation and multiple open shifts
-- ---------------------------------------------------------------------------

reset role;
update public.treasury_payment_routes
   set is_active = false
 where branch_id='b1111111-1111-4111-8111-111111111111'
   and payment_method='instapay'
   and financial_cycle_id is null;

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"instapay"}]'::jsonb, 'pr5-inactive-key-0001')
$q$, '23514', null, 'an inactive route is not used');

reset role;
insert into public.treasury(id,branch_id,name_en,name_ar,current_balance,non_cash_balance,account_kind,custodian_user_id,parent_treasury_id,financial_cycle_id) values
  ('a1111111-1111-4111-8111-111111111122','b1111111-1111-4111-8111-111111111111','PR5 Drawer 2','درج ٢',0,0,'cash','f0000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111');

insert into public.treasury_shifts(id,branch_id,treasury_id,opened_by,custodian_user_id,opening_counted,opening_book) values
  ('f1111111-1111-4111-8111-111111111112','b1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111122','f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001',0,0);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-ambiguous-key-0001')
$q$, '23514', null, 'two open cash drawers require an explicit shift');

select lives_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":5,"payment_method":"cash"}]'::jsonb, 'pr5-explicitshift-key-0001',
    null, 'f1111111-1111-4111-8111-111111111111')
$q$, 'an explicit shift resolves the ambiguity');

reset role;
update public.treasury_shifts
   set closed_at = statement_timestamp(),
       closed_by = 'f0000000-0000-4000-8000-000000000001',
       expected_closing = 0,
       closing_counted = 0
 where id in ('f1111111-1111-4111-8111-111111111111',
              'f1111111-1111-4111-8111-111111111112');

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"cash"}]'::jsonb, 'pr5-noshift-key-0001')
$q$, '55000', null, 'cash with no open shift is rejected');

-- ---------------------------------------------------------------------------
-- 9. Payment links are permanent
-- ---------------------------------------------------------------------------

reset role;

select throws_ok($q$
  update public.payments set shift_id = null
   where id = (select id from public.payments where idempotency_key='pr5-cash-key-0001')
$q$, '23514', null, 'a payment shift cannot be cleared');

select throws_ok($q$
  update public.payments set payment_batch_id = null
   where id = (select id from public.payments where idempotency_key='pr5-cash-key-0001')
$q$, '23514', null, 'a payment batch cannot be cleared');

select throws_ok($q$
  update public.payments set financial_cycle_id = null
   where id = (select id from public.payments where idempotency_key='pr5-cash-key-0001')
$q$, '23514', null, 'a payment cycle cannot be cleared');

select throws_ok($q$
  update public.payments set split_index = 2
   where id = (select id from public.payments where idempotency_key='pr5-cash-key-0001')
$q$, '23514', null, 'a payment split index cannot be rewritten');

select * from finish();
rollback;
