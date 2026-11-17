-- Two-session pgTAP tests for 20261117124000_treasury_payment_rpcs.sql.
--
-- dblink makes each lock wait real. Fixtures are committed by the disposable
-- harness; the final pgTAP transaction rolls back.

begin;
select plan(51);

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

create function pg_temp.set_reception(p_conn text) returns void
language plpgsql as $$
begin
  perform dblink_exec(p_conn, 'set local role authenticated');
  perform dblink_exec(p_conn, 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
  perform dblink_exec(p_conn, 'set local app.test_session_active = ''on''');
  perform dblink_exec(p_conn, 'set local statement_timeout = ''15s''');
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The same idempotency key in two sessions produces one batch
-- ---------------------------------------------------------------------------

select is(dblink_connect('a', pg_temp.conninfo()), 'OK', 'session A connects');
select is(dblink_connect('b', pg_temp.conninfo()), 'OK', 'session B connects');
select dblink_exec('a', 'begin');
select pg_temp.set_reception('a');
select lives_ok($q$
  select * from dblink('a', $sql$
    select public.fn_treasury_payment_collect(
      'b1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'e1111111-1111-4111-8111-111111111111',
      '[{"amount":10,"payment_method":"cash"}]'::jsonb,
      'pr5-race-key-0001'
    )
  $sql$) as t(x jsonb)
$q$, 'session A posts the first collection');

select dblink_exec('b', 'begin');
select pg_temp.set_reception('b');
select is(dblink_send_query('b', $q$select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":10,"payment_method":"cash"}]'::jsonb,
    'pr5-race-key-0001'
  )$q$), 1, 'session B starts the same key');
select ok(pg_temp.wait_lock(), 'session B waits on the batch idempotency lock');
select is(dblink_exec('a', 'commit'), 'COMMIT', 'session A commits');
create temp table race_b_result as
  select * from dblink_get_result('b') as t(x jsonb);
select is((select (x ->> 'batch_id')::uuid from race_b_result),
  (select id from public.payment_batches where idempotency_key='pr5-race-key-0001'),
  'session B returns the same batch');
select is((select (x ->> 'idempotent_replay')::boolean from race_b_result),
  true, 'session B is marked as a replay');
select * from dblink_get_result('b') as t(x jsonb);
select dblink_exec('b', 'commit');
select is((select count(*) from public.payments where idempotency_key='pr5-race-key-0001'), 1::bigint, 'race key wrote one payment');
select is((select count(*) from public.payment_batches where idempotency_key='pr5-race-key-0001'), 1::bigint, 'race key wrote one batch');
select is((select count(*) from public.treasury_transactions where reference_type='payment'), 1::bigint, 'race key wrote one ledger row');
select is((select paid_amount from public.invoices where id='e1111111-1111-4111-8111-111111111111'), 10::numeric, 'race key recalculated the invoice once');

-- ---------------------------------------------------------------------------
-- 2. A collection waits for the shift advisory lock, then posts
-- ---------------------------------------------------------------------------

select is(dblink_connect('c', pg_temp.conninfo()), 'OK', 'session C connects');
select is(dblink_connect('d', pg_temp.conninfo()), 'OK', 'session D connects');
select dblink_exec('c', 'begin');
select dblink_exec('c', 'set local statement_timeout = ''15s''');
select lives_ok($q$
  select * from dblink('c', $sql$
    select count(*) as x
      from (select pg_advisory_xact_lock(hashtextextended(
        'treasury-transfer:' || 'f1111111-1111-4111-8111-111111111111', 0))) s
  $sql$) as t(x bigint)
$q$, 'session C holds the shift advisory lock');

select dblink_exec('d', 'begin');
select pg_temp.set_reception('d');
select is(dblink_send_query('d', $q$select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":5,"payment_method":"cash"}]'::jsonb,
    'pr5-race-lock-key-0001'
  )$q$), 1, 'session D starts a collection behind the shift lock');
select ok(pg_temp.wait_lock(), 'session D waits for the shift advisory lock');
select is(dblink_exec('c', 'commit'), 'COMMIT', 'session C releases the shift lock');
select is((select (x ->> 'batch_id')::uuid from dblink_get_result('d') as t(x jsonb)) is not null,
  true, 'session D receives a batch after the lock is released');
select * from dblink_get_result('d') as t(x jsonb);
select dblink_exec('d', 'commit');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111121'), 15::numeric, 'shift wait does not lose the earlier payment');
select is((select count(*) from public.treasury_transactions where reference_type='payment'), 2::bigint, 'shift wait leaves two ledger rows');

-- ---------------------------------------------------------------------------
-- 3. Two collections on the same shift serialise and both post
-- ---------------------------------------------------------------------------

select is(dblink_connect('e', pg_temp.conninfo()), 'OK', 'session E connects');
select is(dblink_connect('f', pg_temp.conninfo()), 'OK', 'session F connects');
select dblink_exec('e', 'begin');
select pg_temp.set_reception('e');
select lives_ok($q$
  select * from dblink('e', $sql$
    select public.fn_treasury_payment_collect(
      'b1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'e1111111-1111-4111-8111-111111111111',
      '[{"amount":5,"payment_method":"cash"}]'::jsonb,
      'pr5-race-shift-a-key-0001'
    )
  $sql$) as t(x jsonb)
$q$, 'session E posts one collection');

select dblink_exec('f', 'begin');
select pg_temp.set_reception('f');
select is(dblink_send_query('f', $q$select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":7,"payment_method":"cash"}]'::jsonb,
    'pr5-race-shift-b-key-0001'
  )$q$), 1, 'session F starts a second collection');
select ok(pg_temp.wait_lock(), 'session F waits on the first collection shift lock');
select is(dblink_exec('e', 'commit'), 'COMMIT', 'session E commits');
select is((select (x ->> 'batch_id')::uuid from dblink_get_result('f') as t(x jsonb)) is not null,
  true, 'session F posts after session E commits');
select * from dblink_get_result('f') as t(x jsonb);
select dblink_exec('f', 'commit');
select is((select count(*) from public.payments), 4::bigint, 'both collections wrote payments');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111121'), 27::numeric, 'both collections reach the same drawer');
select is((select count(*) from public.treasury_transactions where reference_type='payment'), 4::bigint, 'both collections wrote ledger rows');
select is((select paid_amount from public.invoices where id='e1111111-1111-4111-8111-111111111111'), 27::numeric, 'both collections recalculated the invoice');

-- ---------------------------------------------------------------------------
-- 4. A conflicting retry waits, then fails without a second row
-- ---------------------------------------------------------------------------

select is(dblink_connect('g', pg_temp.conninfo()), 'OK', 'session G connects');
select is(dblink_connect('h', pg_temp.conninfo()), 'OK', 'session H connects');
select dblink_exec('g', 'begin');
select pg_temp.set_reception('g');
select lives_ok($q$
  select * from dblink('g', $sql$
    select public.fn_treasury_payment_collect(
      'b1111111-1111-4111-8111-111111111111',
      'd1111111-1111-4111-8111-111111111111',
      'e1111111-1111-4111-8111-111111111111',
      '[{"amount":10,"payment_method":"cash"}]'::jsonb,
      'pr5-race-conflict-key-0001'
    )
  $sql$) as t(x jsonb)
$q$, 'session G posts the conflict key');

select dblink_exec('h', 'begin');
select pg_temp.set_reception('h');
select is(dblink_send_query('h', $q$select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":20,"payment_method":"cash"}]'::jsonb,
    'pr5-race-conflict-key-0001'
  )$q$), 1, 'session H starts a conflicting retry');
select ok(pg_temp.wait_lock(), 'session H waits for the conflict key');
select is(dblink_exec('g', 'commit'), 'COMMIT', 'session G commits');
select throws_ok($$ select * from dblink_get_result('h') as t(x jsonb) $$,
  '23505', null, 'session H rejects the conflicting facts');
select dblink_disconnect('h');
select is((select count(*) from public.payments where idempotency_key='pr5-race-conflict-key-0001'), 1::bigint, 'conflicting retry wrote no second payment');
select is((select total_amount from public.payment_batches where idempotency_key='pr5-race-conflict-key-0001'), 10::numeric, 'conflicting retry leaves the original batch total');
select is((select count(*) from public.payments), 5::bigint, 'conflicting retry leaves five payments in total');

-- ---------------------------------------------------------------------------
-- 5. A collection waits for a treasury row lock, then posts
-- ---------------------------------------------------------------------------

select is(dblink_connect('i', pg_temp.conninfo()), 'OK', 'session I connects');
select is(dblink_connect('j', pg_temp.conninfo()), 'OK', 'session J connects');
select dblink_exec('i', 'begin');
select dblink_exec('i', 'set local statement_timeout = ''15s''');
select lives_ok($q$
  select * from dblink('i', $sql$
    select id from public.treasury
     where id='a1111111-1111-4111-8111-111111111121'
       for update
  $sql$) as t(id uuid)
$q$, 'session I holds the drawer row');

select dblink_exec('j', 'begin');
select pg_temp.set_reception('j');
select is(dblink_send_query('j', $q$select public.fn_treasury_payment_collect(
    'b1111111-1111-4111-8111-111111111111',
    'd1111111-1111-4111-8111-111111111111',
    'e1111111-1111-4111-8111-111111111111',
    '[{"amount":3,"payment_method":"cash"}]'::jsonb,
    'pr5-race-treasury-key-0001'
  )$q$), 1, 'session J starts a collection behind the drawer lock');
select ok(pg_temp.wait_lock(), 'session J waits for the drawer row');
select is(dblink_exec('i', 'commit'), 'COMMIT', 'session I releases the drawer');
select is((select (x ->> 'batch_id')::uuid from dblink_get_result('j') as t(x jsonb)) is not null,
  true, 'session J posts after the drawer is released');
select * from dblink_get_result('j') as t(x jsonb);
select dblink_exec('j', 'commit');
select is((select count(*) from public.payments), 6::bigint, 'drawer wait leaves six payments');
select is((select current_balance from public.treasury where id='a1111111-1111-4111-8111-111111111121'), 40::numeric, 'drawer wait leaves the full balance');

select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('c');
select dblink_disconnect('d');
select dblink_disconnect('e');
select dblink_disconnect('f');
select dblink_disconnect('g');
select dblink_disconnect('i');
select dblink_disconnect('j');

select * from finish();
rollback;
