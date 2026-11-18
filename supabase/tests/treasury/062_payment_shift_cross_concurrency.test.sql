-- Cross-PR concurrency: PR-5 collection against PR-4 close, settle,
-- close-and-settle and transfer. Real two-session dblink waits.
--
-- Run against the disposable local harness, never Production. The harness
-- commits the fixture rows before this file starts; the remote commits are
-- intentionally visible to the outer test session.

begin;
select plan(58);

create function pg_temp.conninfo() returns text
language sql stable as $$
  select 'host=' || coalesce(nullif(split_part(current_setting('unix_socket_directories'), ',', 1), ''), 'localhost')
      || ' port=' || current_setting('port')
      || ' dbname=' || current_database()
      || ' user=' || current_user;
$$;

create function pg_temp.wait_lock() returns boolean
language plpgsql as $$
declare
  i integer;
begin
  for i in 1..200 loop
    if exists (select 1 from pg_locks where not granted) then
      return true;
    end if;
    perform pg_sleep(0.05);
  end loop;
  return false;
end;
$$;

create function pg_temp.set_actor(p_conn text, p_uid uuid) returns void
language plpgsql as $$
begin
  perform dblink_exec(p_conn, 'set local role authenticated');
  perform dblink_exec(p_conn,
    format('set local request.jwt.claim.sub = %L', p_uid::text));
  perform dblink_exec(p_conn, 'set local app.test_session_active = ''on''');
  perform dblink_exec(p_conn, 'set local statement_timeout = ''15s''');
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Collection on D2 against close of the same open shift
-- ---------------------------------------------------------------------------

select is(dblink_connect('a', pg_temp.conninfo()), 'OK', 'close: A connects');
select is(dblink_connect('b', pg_temp.conninfo()), 'OK', 'close: B connects');
select dblink_exec('a', 'begin');
select pg_temp.set_actor('a', 'f0000000-0000-4000-8000-000000000001');
select lives_ok($q$
  select * from dblink('a', $sql$
    select public.fn_treasury_payment_collect(
      'b1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'e1111111-1111-4111-8111-111111111111',
      '[{"amount":5,"payment_method":"cash"}]'::jsonb,
      'cross-close-key-0001',
      '21111111-1111-4111-8111-111111111111',
      null,
      'f1111111-1111-4111-8111-111111111121'
    )
  $sql$) as t(x jsonb)
$q$, 'close: collection holds the shift prefix');
select dblink_exec('b', 'begin');
select pg_temp.set_actor('b', 'f0000000-0000-4000-8000-000000000001');
select is(dblink_send_query('b', $q$select public.fn_treasury_shift_close(
    'a1111111-1111-4111-8111-111111111131', 5)$q$), 1, 'close: B starts close');
select ok(pg_temp.wait_lock(), 'close: close waits on the collection shift lock');
select is(dblink_exec('a', 'commit'), 'COMMIT', 'close: collection commits');
select is((select id from dblink_get_result('b') as t(id uuid)),
  'f1111111-1111-4111-8111-111111111121'::uuid,
  'close: close returns the same shift');
select * from dblink_get_result('b') as t(id uuid);
select dblink_exec('b', 'commit');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111131'), 5::numeric, 'close: drawer keeps the collected cash');
select is((select expected_closing from public.treasury_shifts where id='f1111111-1111-4111-8111-111111111121'), 5::numeric, 'close: close reads the post-collection book');
select is((select closing_counted from public.treasury_shifts where id='f1111111-1111-4111-8111-111111111121'), 5::numeric, 'close: counted is stored');
select is((select status from public.treasury_shifts where id='f1111111-1111-4111-8111-111111111121'), 'closed', 'close: shift is closed');
select is((select count(*) from public.treasury_transactions where reference_type='payment'), 1::bigint, 'close: one payment ledger row');
select is((select count(*) from public.treasury_transactions where reference_type='transfer' and reference_id='f1111111-1111-4111-8111-111111111121'), 0::bigint, 'close: close moves no money');

-- ---------------------------------------------------------------------------
-- 2. Instapay collection (main cash) against settlement of a closed drawer
-- ---------------------------------------------------------------------------

select is(dblink_connect('c', pg_temp.conninfo()), 'OK', 'settle: C connects');
select is(dblink_connect('d', pg_temp.conninfo()), 'OK', 'settle: D connects');
select dblink_exec('c', 'begin');
select pg_temp.set_actor('c', 'f0000000-0000-4000-8000-000000000001');
select lives_ok($q$
  select * from dblink('c', $sql$
    select public.fn_treasury_payment_collect(
      'b1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'e1111111-1111-4111-8111-111111111111',
      '[{"amount":4,"payment_method":"instapay"}]'::jsonb,
      'cross-settle-key-0001',
      '21111111-1111-4111-8111-111111111112'
    )
  $sql$) as t(x jsonb)
$q$, 'settle: collection holds the main-cash row');
select dblink_exec('d', 'begin');
select pg_temp.set_actor('d', 'f0000000-0000-4000-8000-000000000001');
select is(dblink_send_query('d', $q$select public.fn_treasury_shift_settle(
    'a1111111-1111-4111-8111-111111111132')$q$), 1, 'settle: D starts settlement');
select ok(pg_temp.wait_lock(), 'settle: settlement waits on the main-cash row');
select is(dblink_exec('c', 'commit'), 'COMMIT', 'settle: collection commits');
select is((select id from dblink_get_result('d') as t(id uuid)),
  'f1111111-1111-4111-8111-111111111122'::uuid,
  'settle: settlement returns the closed shift');
select * from dblink_get_result('d') as t(id uuid);
select dblink_exec('d', 'commit');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111132'), 0::numeric, 'settle: drawer ends at zero');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111111'), 10::numeric, 'settle: parent receives the drawer');
select is((select non_cash_balance from public.treasury where id='a1111111-1111-4111-8111-111111111111'), 4::numeric, 'settle: instapay stays non-cash');
select is((select status from public.treasury_shifts where id='f1111111-1111-4111-8111-111111111122'), 'settled', 'settle: shift is settled');
select is((select count(*) from public.treasury_transactions where reference_type='payment'), 2::bigint, 'settle: two payment ledger rows');
select is((select count(*) from public.treasury_transactions where reference_type='transfer' and reference_id='f1111111-1111-4111-8111-111111111122'), 2::bigint, 'settle: exactly one transfer pair');

-- ---------------------------------------------------------------------------
-- 3. Collection against close_and_settle on the same open shift
-- ---------------------------------------------------------------------------

select is(dblink_connect('e', pg_temp.conninfo()), 'OK', 'wrapper: E connects');
select is(dblink_connect('f', pg_temp.conninfo()), 'OK', 'wrapper: F connects');
select dblink_exec('e', 'begin');
select pg_temp.set_actor('e', 'f0000000-0000-4000-8000-000000000004');
select lives_ok($q$
  select * from dblink('e', $sql$
    select public.fn_treasury_payment_collect(
      'b1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'e1111111-1111-4111-8111-111111111111',
      '[{"amount":7,"payment_method":"cash"}]'::jsonb,
      'cross-wrapper-key-0001',
      '21111111-1111-4111-8111-111111111113',
      null,
      'f1111111-1111-4111-8111-111111111123'
    )
  $sql$) as t(x jsonb)
$q$, 'wrapper: collection holds the shift');
select dblink_exec('f', 'begin');
select pg_temp.set_actor('f', 'f0000000-0000-4000-8000-000000000004');
select is(dblink_send_query('f', $q$select public.fn_treasury_shift_close_and_settle(
    'a1111111-1111-4111-8111-111111111133', 7, null, null,
    '21111111-1111-4111-8111-111111111114'::uuid)$q$), 1, 'wrapper: F starts close-and-settle');
select ok(pg_temp.wait_lock(), 'wrapper: close-and-settle waits on the shift lock');
select is(dblink_exec('e', 'commit'), 'COMMIT', 'wrapper: collection commits');
select is((select id from dblink_get_result('f') as t(id uuid)),
  'f1111111-1111-4111-8111-111111111123'::uuid,
  'wrapper: wrapper returns the same shift');
select * from dblink_get_result('f') as t(id uuid);
select dblink_exec('f', 'commit');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111133'), 0::numeric, 'wrapper: drawer ends at zero');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111111'), 17::numeric, 'wrapper: parent receives the drawer once');
select is((select status from public.treasury_shifts where id='f1111111-1111-4111-8111-111111111123'), 'settled', 'wrapper: shift is settled');
select is((select count(*) from public.treasury_transactions where reference_type='payment'), 3::bigint, 'wrapper: three payment ledger rows');
select is((select count(*) from public.treasury_transactions where reference_type='transfer' and reference_id='f1111111-1111-4111-8111-111111111123'), 2::bigint, 'wrapper: exactly one transfer pair');

-- ---------------------------------------------------------------------------
-- 4. Collection against a transfer using the same shift advisory key
-- ---------------------------------------------------------------------------

select is(dblink_connect('g', pg_temp.conninfo()), 'OK', 'transfer: G connects');
select is(dblink_connect('h', pg_temp.conninfo()), 'OK', 'transfer: H connects');
select dblink_exec('g', 'begin');
select pg_temp.set_actor('g', 'f0000000-0000-4000-8000-000000000001');
select lives_ok($q$
  select * from dblink('g', $sql$
    select public.fn_treasury_payment_collect(
      'b1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'e1111111-1111-4111-8111-111111111111',
      '[{"amount":3,"payment_method":"cash"}]'::jsonb,
      'cross-transfer-key-0001',
      '21111111-1111-4111-8111-111111111115',
      null,
      'f1111111-1111-4111-8111-111111111124'
    )
  $sql$) as t(x jsonb)
$q$, 'transfer: collection holds the shift');
select dblink_exec('h', 'begin');
select pg_temp.set_actor('h', 'f0000000-0000-4000-8000-000000000001');
select is(dblink_send_query('h', $q$select public.transfer_treasury_funds(
    'a1111111-1111-4111-8111-111111111134',
    'a1111111-1111-4111-8111-111111111111',
    10,
    'f1111111-1111-4111-8111-111111111124',
    'cross transfer')$q$), 1, 'transfer: H starts the transfer');
select ok(pg_temp.wait_lock(), 'transfer: transfer waits on the same shift advisory key');
select is(dblink_exec('g', 'commit'), 'COMMIT', 'transfer: collection commits');
select is((select (x ->> 'idempotent_replay')::boolean from dblink_get_result('h') as t(x jsonb)),
  false, 'transfer: transfer runs after the collection');
select * from dblink_get_result('h') as t(x jsonb);
select dblink_exec('h', 'commit');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111134'), 3::numeric, 'transfer: drawer keeps collection minus transfer');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111111'), 27::numeric, 'transfer: parent receives the transfer once');
select is((select count(*) from public.treasury_transactions where reference_type='transfer' and reference_id='f1111111-1111-4111-8111-111111111124'), 2::bigint, 'transfer: exactly one transfer pair');
select is((select count(*) from public.treasury_transactions where reference_type='payment'), 4::bigint, 'transfer: four payment ledger rows');

-- ---------------------------------------------------------------------------
-- 5. A route changed while the collection waits must not post
-- ---------------------------------------------------------------------------

select is(dblink_connect('i', pg_temp.conninfo()), 'OK', 'route-wait: I connects');
select is(dblink_connect('j', pg_temp.conninfo()), 'OK', 'route-wait: J connects');
select dblink_exec('i', 'begin');
select dblink_exec('i', 'set local statement_timeout = ''15s''');
select lives_ok($q$
  select * from dblink('i', $sql$
    select id from public.treasury
     where id='a1111111-1111-4111-8111-111111111111'
       for update
  $sql$) as t(id uuid)
$q$, 'route-wait: I holds the main-cash row');
select dblink_exec('j', 'begin');
select pg_temp.set_actor('j', 'f0000000-0000-4000-8000-000000000001');
select is(dblink_send_query('j', $q$select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":1,"payment_method":"instapay"}]'::jsonb,
    'cross-route-key-0001',
    '21111111-1111-4111-8111-111111111116'
  )$q$), 1, 'route-wait: J starts the collection');
select ok(pg_temp.wait_lock(), 'route-wait: J waits on the main-cash row');
select dblink_exec('i', $sql$
  update public.treasury_payment_routes
     set is_active = false
   where branch_id='b1111111-1111-4111-8111-111111111111'
     and financial_cycle_id='c1111111-1111-4111-8111-111111111111'
     and payment_method='instapay'
$sql$);
select is(dblink_exec('i', 'commit'), 'COMMIT', 'route-wait: I deactivates the route and releases the row');
select throws_ok($$ select * from dblink_get_result('j') as t(x jsonb) $$,
  '23514', null, 'route-wait: J rejects the deactivated route');
select dblink_disconnect('j');
select is((select count(*) from public.payments where idempotency_key='cross-route-key-0001'), 0::bigint, 'route-wait: no payment row');
select is((select count(*) from public.payment_batches where idempotency_key='cross-route-key-0001'), 0::bigint, 'route-wait: no batch row');

select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('c');
select dblink_disconnect('d');
select dblink_disconnect('e');
select dblink_disconnect('f');
select dblink_disconnect('g');
select dblink_disconnect('h');
select dblink_disconnect('i');

select * from finish();
rollback;
