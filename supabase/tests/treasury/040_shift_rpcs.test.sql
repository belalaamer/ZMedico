-- Behavioral pgTAP contract for 20261117123000_treasury_shift_rpcs.sql.
--
-- Run against the disposable local harness, never Production. Fixtures are
-- committed by the harness; this test transaction is rolled back.

begin;
select plan(85);

-- ---------------------------------------------------------------------------
-- Six explicit accounting cases. In every case current_balance is the BOOK.
-- ---------------------------------------------------------------------------

-- Case 1: opening_gap=0, variance=0, closing=0, current=0.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000021') $$, 'gap 0 / variance 0 settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000021'), 0::numeric, 'gap 0 / variance 0: drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000001'), 0::numeric, 'gap 0 / variance 0: parent delta is closing 0');
select is((select status from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000001'), 'settled', 'gap 0 / variance 0: shift is settled');
select is((select settlement_tx_id from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000001'), null::uuid, 'gap 0 / variance 0: no settlement transaction');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000001'), 0::bigint, 'gap 0 / variance 0: zero ledger rows');

-- Case 2: opening_gap=0, variance=+10, closing=110, current=100.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000023') $$, 'gap 0 / variance +10 settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000023'), 0::numeric, 'gap 0 / variance +10: drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000003'), 110::numeric, 'gap 0 / variance +10: parent delta is closing 110');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000003' and reference_type='transfer' and transaction_type='expense' and amount=100 and treasury_id='d0000000-0000-4000-8000-000000000023'), 1::bigint, 'gap 0 / variance +10: one 100 transfer debit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000003' and reference_type='transfer' and transaction_type='income' and amount=100 and treasury_id='a0000000-0000-4000-8000-000000000003'), 1::bigint, 'gap 0 / variance +10: one 100 transfer credit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000003' and reference_type='treasury_shift_variance' and transaction_type='income' and amount=10), 1::bigint, 'gap 0 / variance +10: one 10 variance income');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000003'), 3::bigint, 'gap 0 / variance +10: exactly three ledger rows');

-- Case 3: opening_gap=0, variance=-10, closing=90, current=100.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000022') $$, 'gap 0 / variance -10 settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000022'), 0::numeric, 'gap 0 / variance -10: drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000002'), 90::numeric, 'gap 0 / variance -10: parent delta is closing 90');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000002' and reference_type='transfer' and transaction_type='expense' and amount=100 and treasury_id='d0000000-0000-4000-8000-000000000022'), 1::bigint, 'gap 0 / variance -10: one 100 transfer debit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000002' and reference_type='transfer' and transaction_type='income' and amount=100 and treasury_id='a0000000-0000-4000-8000-000000000002'), 1::bigint, 'gap 0 / variance -10: one 100 transfer credit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000002' and reference_type='treasury_shift_variance' and transaction_type='expense' and amount=10), 1::bigint, 'gap 0 / variance -10: one 10 variance expense');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000002'), 3::bigint, 'gap 0 / variance -10: exactly three ledger rows');

-- Case 4: opening_gap=+10, variance=0, closing=110, current=100.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000024') $$, 'gap +10 / variance 0 settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000024'), 0::numeric, 'gap +10 / variance 0: drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000004'), 110::numeric, 'gap +10 / variance 0: parent delta is closing 110');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000004' and reference_type='transfer' and transaction_type='expense' and amount=100 and treasury_id='d0000000-0000-4000-8000-000000000024'), 1::bigint, 'gap +10 / variance 0: one 100 transfer debit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000004' and reference_type='transfer' and transaction_type='income' and amount=100 and treasury_id='a0000000-0000-4000-8000-000000000004'), 1::bigint, 'gap +10 / variance 0: one 100 transfer credit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000004' and reference_type='treasury_shift_opening_gap' and transaction_type='income' and amount=10), 1::bigint, 'gap +10 / variance 0: one 10 opening-gap income');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000004'), 3::bigint, 'gap +10 / variance 0: exactly three ledger rows');

-- Case 5: opening_gap=-10, variance=0, closing=90, current=100.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000025') $$, 'gap -10 / variance 0 settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000025'), 0::numeric, 'gap -10 / variance 0: drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000005'), 90::numeric, 'gap -10 / variance 0: parent delta is closing 90');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000005' and reference_type='transfer' and transaction_type='expense' and amount=100 and treasury_id='d0000000-0000-4000-8000-000000000025'), 1::bigint, 'gap -10 / variance 0: one 100 transfer debit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000005' and reference_type='transfer' and transaction_type='income' and amount=100 and treasury_id='a0000000-0000-4000-8000-000000000005'), 1::bigint, 'gap -10 / variance 0: one 100 transfer credit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000005' and reference_type='treasury_shift_opening_gap' and transaction_type='expense' and amount=10), 1::bigint, 'gap -10 / variance 0: one 10 opening-gap expense');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000005'), 3::bigint, 'gap -10 / variance 0: exactly three ledger rows');

-- Case 6: opening_gap=+10, variance=+5, closing=115, current=100.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000035') $$, 'gap +10 / variance +5 settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000035'), 0::numeric, 'gap +10 / variance +5: drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000021'), 115::numeric, 'gap +10 / variance +5: parent delta is closing 115');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000015' and reference_type='transfer' and transaction_type='expense' and amount=100 and treasury_id='d0000000-0000-4000-8000-000000000035'), 1::bigint, 'gap +10 / variance +5: one 100 transfer debit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000015' and reference_type='transfer' and transaction_type='income' and amount=100 and treasury_id='a0000000-0000-4000-8000-000000000021'), 1::bigint, 'gap +10 / variance +5: one 100 transfer credit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000015' and reference_type='treasury_shift_opening_gap' and transaction_type='income' and amount=10), 1::bigint, 'gap +10 / variance +5: one 10 opening-gap income');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000015' and reference_type='treasury_shift_variance' and transaction_type='income' and amount=5), 1::bigint, 'gap +10 / variance +5: one 5 variance income');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000015'), 4::bigint, 'gap +10 / variance +5: exactly four ledger rows');

-- Case 7: opening_gap=-10, variance=-5, closing=85, current=100.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000036') $$, 'gap -10 / variance -5 settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000036'), 0::numeric, 'gap -10 / variance -5: drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000022'), 85::numeric, 'gap -10 / variance -5: parent delta is closing 85');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000016' and reference_type='transfer' and transaction_type='expense' and amount=100 and treasury_id='d0000000-0000-4000-8000-000000000036'), 1::bigint, 'gap -10 / variance -5: one 100 transfer debit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000016' and reference_type='transfer' and transaction_type='income' and amount=100 and treasury_id='a0000000-0000-4000-8000-000000000022'), 1::bigint, 'gap -10 / variance -5: one 100 transfer credit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000016' and reference_type='treasury_shift_opening_gap' and transaction_type='expense' and amount=10), 1::bigint, 'gap -10 / variance -5: one 10 opening-gap expense');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000016' and reference_type='treasury_shift_variance' and transaction_type='expense' and amount=5), 1::bigint, 'gap -10 / variance -5: one 5 variance expense');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000016'), 4::bigint, 'gap -10 / variance -5: exactly four ledger rows');

-- Zero drawer with counted overage: variance-only, no transfer.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000031') $$, 'zero drawer with counted overage settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000031'), 0::numeric, 'zero drawer / overage: drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000018'), 5::numeric, 'zero drawer / overage: parent delta is closing 5');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000011' and reference_type='treasury_shift_variance' and transaction_type='income' and amount=5), 1::bigint, 'zero drawer / overage: one 5 variance income');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000011'), 1::bigint, 'zero drawer / overage: exactly one ledger row');
select is((select settlement_tx_id from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000011'), (select variance_tx_id from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000011'), 'zero drawer / overage: settlement points at variance');

-- Policy failures: bank parent, archived cycle, closed day, movement after close.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000026') $$, '23514', null, 'bank parent is rejected');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000006'), 0::bigint, 'bank parent writes no ledger row');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000027') $$, '23514', null, 'archived cycle is rejected');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000007'), 0::bigint, 'archived cycle writes no ledger row');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000033') $$, '23514', null, 'closed day is rejected for variance-only settlement');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000013'), 0::bigint, 'closed day writes no ledger row');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000034') $$, '23514', null, 'archived cycle is rejected for variance-only settlement');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000014'), 0::bigint, 'archived variance writes no ledger row');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002e') $$, '23514', null, 'movement after close is rejected');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-00000000000e'), 0::bigint, 'movement after close writes no ledger row');

-- Wrapper atomic rollback when settlement fails after close.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_close_and_settle('d0000000-0000-4000-8000-000000000028', 100) $$, '23514', null, 'wrapper rolls back when settlement fails');
reset role;
select is((select closed_at from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000008'), null::timestamptz, 'wrapper rollback leaves the shift open');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000008'), 0::bigint, 'wrapper rollback writes no ledger row');

-- Retry: the request id, not the amount, is the identity.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
create temp table retry_first as
  select public.fn_treasury_shift_close_and_settle(
    'd0000000-0000-4000-8000-000000000029', 100, null, null,
    '11111111-1111-4111-8111-111111111111'::uuid
  ) as id;
reset role;
create temp table retry_counts as
  select count(*) as n from public.treasury_transactions
   where reference_id='e0000000-0000-4000-8000-000000000009';
select is((select count(*) from retry_first), 1::bigint, 'request retry: first call completes');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
create temp table retry_second as
  select public.fn_treasury_shift_close_and_settle(
    'd0000000-0000-4000-8000-000000000029', 100, null, null,
    '11111111-1111-4111-8111-111111111111'::uuid
  ) as id;
reset role;
select is((select id from retry_second), (select id from retry_first), 'request retry returns the same shift id');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000009'), (select n from retry_counts), 'request retry writes no duplicate ledger rows');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_close_and_settle(
  'd0000000-0000-4000-8000-000000000029', 99, null, null,
  '11111111-1111-4111-8111-111111111111'::uuid) $$, '23505', null, 'request retry with a different amount is rejected');
select throws_ok($$ select public.fn_treasury_shift_close_and_settle(
  'd0000000-0000-4000-8000-000000000029', 100, 'f0000000-0000-4000-8000-000000000003', null,
  '11111111-1111-4111-8111-111111111111'::uuid) $$, '23505', null, 'request retry with a different handover is rejected');
select throws_ok($$ select public.fn_treasury_shift_close_and_settle(
  'd0000000-0000-4000-8000-000000000029', 100, null, null,
  '22222222-2222-4222-8222-222222222222'::uuid) $$, '55000', null, 'new request with no open shift is rejected');
select throws_ok($$ select public.fn_treasury_shift_close_and_settle(
  'd0000000-0000-4000-8000-000000000029', 100, null, null, null) $$, '22023', null, 'request id is required on the 5-arg wrapper');
select throws_ok($$ select public.fn_treasury_shift_close_and_settle(
  'd0000000-0000-4000-8000-000000000029', 100) $$, '55000', null, 'old 4-arg wrapper has no amount-based retry');
reset role;

-- A genuinely new shift uses a genuinely new request id.
insert into public.treasury_shifts(
  id, branch_id, treasury_id, opened_at, opened_by, custodian_user_id,
  opening_counted, opening_book
) values (
  'e0000000-0000-4000-8000-000000000017',
  'b0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000029',
  timestamptz '2026-11-02 08:00+02',
  'f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001',
  0, 0
);
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
create temp table new_shift as
  select public.fn_treasury_shift_close_and_settle(
    'd0000000-0000-4000-8000-000000000029', 0, null, null,
    '33333333-3333-4333-8333-333333333333'::uuid
  ) as id;
reset role;
select is((select id from new_shift), 'e0000000-0000-4000-8000-000000000017'::uuid, 'new shift with a new request id settles the new shift');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000017'), 0::bigint, 'new zero shift writes no ledger row');

-- Permission and scope checks.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002c') $$, '42501', null, 'settle rejects a user without treasury.tx.write');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-00000000000c'), 0::bigint, 'permission rejection writes no ledger row');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000004';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002c') $$, '42501', null, 'settle rejects a user outside the branch');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'off';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002c') $$, '42501', null, 'settle rejects an inactive session');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_close_and_settle(
  'd0000000-0000-4000-8000-00000000002d', 100, null, null,
  '44444444-4444-4444-8444-444444444444'::uuid) $$, '42501', null, 'wrapper rejects a user without treasury.tx.write');
reset role;
select is((select closed_at from public.treasury_shifts where id='e0000000-0000-4000-8000-00000000000d'), null::timestamptz, 'permission rejection leaves the wrapper shift open');

select * from finish();
rollback;
