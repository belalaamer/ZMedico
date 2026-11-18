-- Compatibility contract for the PR-6 privilege allowlist.
--
-- These are local-harness tests, not real-Supabase RLS tests. The harness has
-- no RLS policies, so RLS is disabled here to exercise the privilege boundary
-- and the existing financial RPCs. The separate 080 file is the unrun
-- real-schema RLS contract.
--
-- The fixture is committed by /tmp/pr6_reset.sh before this file starts.

begin;
select plan(29);

reset role;
alter table public.treasury disable row level security;

-- ---------------------------------------------------------------------------
-- 1. Allowed metadata updates still work and are persisted
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  update public.treasury
     set name_en = 'PR6 Compatible Drawer',
         name_ar = 'درج متوافق',
         is_active = true
   where id = 'a1111111-1111-4111-8111-111111111121'
$q$, 'authenticated can update allowed metadata on a drawer');

reset role;
select is(
  (select name_en from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111121'),
  'PR6 Compatible Drawer',
  'allowed metadata is persisted'
);

-- ---------------------------------------------------------------------------
-- 2. Deactivation does not trap an open shift: close and settle still work
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  update public.treasury
     set is_active = false
   where id = 'a1111111-1111-4111-8111-111111111121'
$q$, 'authenticated can deactivate a drawer with an open shift');

reset role;
select is(
  (select is_active from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111121'),
  false,
  'drawer is inactive before close'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  select public.fn_treasury_shift_close(
    'a1111111-1111-4111-8111-111111111121', 0
  )
$q$, 'close still works after the drawer is deactivated');

reset role;
select is(
  (select status from public.treasury_shifts
    where id = 'f1111111-1111-4111-8111-111111111111'),
  'closed',
  'the open shift is closed after deactivation'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  select public.fn_treasury_shift_settle(
    'a1111111-1111-4111-8111-111111111121'
  )
$q$, 'settle still works after the drawer is deactivated');

reset role;
select is(
  (select status from public.treasury_shifts
    where id = 'f1111111-1111-4111-8111-111111111111'),
  'settled',
  'the shift is settled after deactivation'
);

select is(
  (select current_balance from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111121'),
  0::numeric,
  'deactivation and settlement did not invent a balance'
);

-- ---------------------------------------------------------------------------
-- 3. A closed, unsettled shift can still be settled while inactive
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  update public.treasury
     set is_active = false
   where id = 'a1111111-1111-4111-8111-111111111125'
$q$, 'closed drawer can be deactivated');

reset role;
select is(
  (select is_active from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111125'),
  false,
  'closed drawer is inactive'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  select public.fn_treasury_shift_settle(
    'a1111111-1111-4111-8111-111111111125'
  )
$q$, 'settle still works for a closed, unsettled inactive drawer');

reset role;
select is(
  (select status from public.treasury_shifts
    where id = 'f1111111-1111-4111-8111-111111111115'),
  'settled',
  'the previously closed shift is settled while inactive'
);

-- ---------------------------------------------------------------------------
-- 4. Deactivation does not rewrite an existing balance
-- ---------------------------------------------------------------------------

set local role service_role;
update public.treasury
   set current_balance = 25
 where id = 'a1111111-1111-4111-8111-111111111126';
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  update public.treasury
     set is_active = false
   where id = 'a1111111-1111-4111-8111-111111111126'
$q$, 'a settled drawer with a balance can be deactivated');

reset role;
select is(
  (select current_balance from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111126'),
  25::numeric,
  'deactivation does not change the existing balance'
);

-- ---------------------------------------------------------------------------
-- 5. Open, then close-and-settle, while the drawer is inactive
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  update public.treasury
     set is_active = true
   where id = 'a1111111-1111-4111-8111-111111111126'
$q$, 'the settled drawer can be reactivated for a new shift');

reset role;
select is(
  (select is_active from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111126'),
  true,
  'drawer is active before opening a new shift'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  select public.fn_treasury_shift_open(
    'a1111111-1111-4111-8111-111111111126', 25
  )
$q$, 'open still works after the metadata changes');

reset role;
select is(
  (select count(*) from public.treasury_shifts
    where treasury_id = 'a1111111-1111-4111-8111-111111111126'
      and closed_at is null),
  1::bigint,
  'one open shift exists after open'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  update public.treasury
     set is_active = false
   where id = 'a1111111-1111-4111-8111-111111111126'
$q$, 'the drawer can be deactivated while the new shift is open');

select lives_ok($q$
  select public.fn_treasury_shift_close_and_settle(
    'a1111111-1111-4111-8111-111111111126',
    25,
    null,
    null,
    '55555555-5555-4555-8555-555555555555'::uuid
  )
$q$, 'close-and-settle still works after deactivation');

reset role;
select is(
  (select status from public.treasury_shifts
    where treasury_id = 'a1111111-1111-4111-8111-111111111126'
      and closed_at is not null
    order by closed_at desc
    limit 1),
  'settled',
  'close-and-settle settles the inactive drawer'
);

select is(
  (select current_balance from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111126'),
  0::numeric,
  'close-and-settle moved the drawer balance'
);

select is(
  (select current_balance from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111111'),
  25::numeric,
  'the parent received the settled drawer balance'
);

-- ---------------------------------------------------------------------------
-- 6. An active route to an inactive treasury fails closed
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select lives_ok($q$
  update public.treasury
     set is_active = false
   where id = 'a1111111-1111-4111-8111-111111111112'
$q$, 'authenticated can deactivate the bank used by the instapay route');

reset role;
select is(
  (select is_active from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111112'),
  false,
  'bank is inactive'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';

select throws_ok($q$
  select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"instapay"}]'::jsonb,
    'pr6-route-inactive-key-0001',
    '44444444-4444-4444-8444-444444444444'
  )
$q$, '23514', null, 'collection rejects a route pointing at an inactive treasury');

reset role;
select is(
  (select count(*) from public.payment_batches
    where idempotency_key = 'pr6-route-inactive-key-0001'),
  0::bigint,
  'rejected inactive-route collection writes no batch'
);

select is(
  (select count(*) from public.payments
    where idempotency_key = 'pr6-route-inactive-key-0001'),
  0::bigint,
  'rejected inactive-route collection writes no payment'
);

select * from finish();
rollback;
