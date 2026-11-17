-- Behavioral pgTAP contract for 20261117123000_treasury_shift_rpcs.sql.
--
-- Run against the disposable local harness, never Production. Fixtures are
-- committed by the harness; this test transaction is rolled back.

begin;
select plan(50);

-- 1-6: zero drawer (the behavioural replacement for old textual test #8)
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000021') $$, 'zero drawer settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000021'), 0::numeric, 'zero drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000001'), 0::numeric, 'zero parent receives zero');
select is((select status from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000001'), 'settled', 'zero shift is settled');
select is((select settlement_tx_id from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000001'), null::uuid, 'zero settlement has no transaction');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000001'), 0::bigint, 'zero settlement writes no ledger row');

-- 6b-11: zero drawer with a counted overage (variance-only path)
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000031') $$, 'zero drawer with counted overage settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000031'), 0::numeric, 'zero drawer with overage ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000018'), 5::numeric, 'zero drawer overage reaches the parent');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000011' and reference_type='treasury_shift_variance' and transaction_type='income' and amount=5), 1::bigint, 'zero drawer overage posts a 5 income');
select isnt((select settlement_tx_id from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000011'), null::uuid, 'variance-only settlement records a settlement transaction');
select is((select settlement_tx_id from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000011'), (select variance_tx_id from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000011'), 'variance-only settlement points at its variance transaction');

-- 11b-12b: variance-only paths still obey closed-day and archived-cycle policy
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000033') $$, '23514', null, 'variance-only settlement rejects a closed day');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000013'), 0::bigint, 'closed-day variance rejection writes no ledger row');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000034') $$, '23514', null, 'variance-only settlement rejects an archived cycle');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000014'), 0::bigint, 'archived variance rejection writes no ledger row');

-- 7-10: shortage
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000022') $$, 'shortage settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000022'), 0::numeric, 'shortage drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000002'), 90::numeric, 'shortage parent receives counted 90');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000002' and reference_type='treasury_shift_variance' and transaction_type='expense' and amount=10), 1::bigint, 'shortage variance is a 10 expense');

-- 11-13: overage
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000023') $$, 'overage settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000023'), 0::numeric, 'overage drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000003'), 110::numeric, 'overage parent receives counted 110');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000003' and reference_type='treasury_shift_variance' and transaction_type='income' and amount=10), 1::bigint, 'overage variance is a 10 income');

-- 14-16: positive opening gap
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000024') $$, 'positive opening gap settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000024'), 0::numeric, 'positive gap drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000004'), 110::numeric, 'positive gap parent receives opening count 110');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000004' and reference_type='treasury_shift_opening_gap' and transaction_type='income' and amount=10), 1::bigint, 'positive opening gap is a 10 income');

-- 17-19: negative opening gap
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000025') $$, 'negative opening gap settles');
reset role;
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000025'), 0::numeric, 'negative gap drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000005'), 90::numeric, 'negative gap parent receives opening count 90');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000005' and reference_type='treasury_shift_opening_gap' and transaction_type='expense' and amount=10), 1::bigint, 'negative opening gap is a 10 expense');

-- 20-21: bank parent
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000026') $$, '23514', null, 'bank parent is rejected');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000006'), 0::bigint, 'bank parent writes no ledger row');

-- 22-23: archived cycle
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000027') $$, '23514', null, 'archived cycle is rejected');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000007'), 0::bigint, 'archived cycle writes no ledger row');

-- 24-25: movement after close
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002e') $$, '23514', null, 'movement after close is rejected');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-00000000000e'), 0::bigint, 'movement after close writes no ledger row');

-- 26-28: wrapper atomic rollback when settlement fails after close
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_close_and_settle('d0000000-0000-4000-8000-000000000028', 100) $$, '23514', null, 'wrapper rolls back when settlement fails');
reset role;
select is((select closed_at from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000008'), null::timestamptz, 'wrapper rollback leaves the shift open');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000008'), 0::bigint, 'wrapper rollback writes no ledger row');

-- 29-31: wrapper retry contract
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
create temp table retry_first as
  select public.fn_treasury_shift_close_and_settle('d0000000-0000-4000-8000-000000000029', 100) as id;
reset role;
create temp table retry_counts as
  select count(*) as n from public.treasury_transactions
   where reference_id='e0000000-0000-4000-8000-000000000009';
select is((select count(*) from retry_first), 1::bigint, 'first wrapper call completes');
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
create temp table retry_second as
  select public.fn_treasury_shift_close_and_settle('d0000000-0000-4000-8000-000000000029', 100) as id;
reset role;
select is((select id from retry_second), (select id from retry_first), 'retry returns the same shift id');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000009'), (select n from retry_counts), 'retry writes no duplicate ledger rows');

-- 32-33: permission
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002c') $$, '42501', null, 'settle rejects a user without treasury.tx.write');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-00000000000c'), 0::bigint, 'permission rejection writes no ledger row');

-- 34: branch scope
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000004';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002c') $$, '42501', null, 'settle rejects a user outside the branch');
reset role;

-- 35: inactive session
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'off';
select throws_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002c') $$, '42501', null, 'settle rejects an inactive session');
reset role;

-- 36-37: wrapper needs both permissions and leaves the shift open
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000003';
set local app.test_session_active = 'on';
select throws_ok($$ select public.fn_treasury_shift_close_and_settle('d0000000-0000-4000-8000-00000000002d', 100) $$, '42501', null, 'wrapper rejects a user without treasury.tx.write');
reset role;
select is((select closed_at from public.treasury_shifts where id='e0000000-0000-4000-8000-00000000000d'), null::timestamptz, 'permission rejection leaves the wrapper shift open');

select * from finish();
rollback;
