-- Two-session pgTAP tests for 20261117123000_treasury_shift_rpcs.sql.
-- Uses dblink so lock acquisition is real, not simulated. Fixtures are
-- committed by the disposable harness; the final pgTAP transaction rolls back.

begin;
select plan(53);

create function pg_temp.conninfo() returns text
language sql stable as $$
  select 'host=' || coalesce(nullif(split_part(current_setting('unix_socket_directories'), ',', 1), ''), 'localhost')
      || ' port=' || current_setting('port')
      || ' dbname=' || current_database()
      || ' user=' || current_user;
$$;

create function pg_temp.wait_lock(p_pattern text) returns boolean
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

-- A holds a transfer for the wrapper's reference; B must wait on the same
-- advisory lock, then settle exactly once.
select is(dblink_connect('a', pg_temp.conninfo()), 'OK', 'session A connects');
select is(dblink_connect('b', pg_temp.conninfo()), 'OK', 'session B connects');
select dblink_exec('a', 'begin');
select dblink_exec('a', 'set local role authenticated');
select dblink_exec('a', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('a', 'set local app.test_session_active = ''on''');
select dblink_exec('a', 'set local statement_timeout = ''15s''');
select lives_ok($$ select * from dblink('a', $q$select public.transfer_treasury_funds('d0000000-0000-4000-8000-00000000002a','a0000000-0000-4000-8000-000000000010',100,'e0000000-0000-4000-8000-00000000000a','concurrent transfer')$q$) as t(x jsonb) $$, 'session A holds a transfer for the wrapper reference');
select dblink_exec('b', 'begin');
select dblink_exec('b', 'set local role authenticated');
select dblink_exec('b', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('b', 'set local app.test_session_active = ''on''');
select dblink_exec('b', 'set local statement_timeout = ''15s''');
select is(dblink_send_query('b', $q$select public.fn_treasury_shift_close_and_settle('d0000000-0000-4000-8000-00000000002a',0,null,null,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$q$), 1, 'session B starts the wrapper');
select ok(pg_temp.wait_lock('fn_treasury_shift_close_and_settle'), 'wrapper waits on the in-flight transfer');
select is(dblink_exec('a', 'commit'), 'COMMIT', 'session A commits the transfer');
select is((select id from dblink_get_result('b') as t(id uuid)), 'e0000000-0000-4000-8000-00000000000a'::uuid, 'wrapper settles the same shift');
select * from dblink_get_result('b') as t(id uuid);
select dblink_exec('b', 'commit');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000010'), 100::numeric, 'wrapper does not move the parent twice');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-00000000000a'), 2::bigint, 'wrapper leaves exactly the transfer pair');
select is((select status from public.treasury_shifts where id='e0000000-0000-4000-8000-00000000000a'), 'settled', 'wrapper shift is settled');

-- C holds a transfer for the settle reference; D must wait, then reject the
-- close equation because the drawer book moved.
select is(dblink_connect('c', pg_temp.conninfo()), 'OK', 'session C connects');
select is(dblink_connect('d', pg_temp.conninfo()), 'OK', 'session D connects');
select dblink_exec('c', 'begin');
select dblink_exec('c', 'set local role authenticated');
select dblink_exec('c', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('c', 'set local app.test_session_active = ''on''');
select dblink_exec('c', 'set local statement_timeout = ''15s''');
select lives_ok($$ select * from dblink('c', $q$select public.transfer_treasury_funds('d0000000-0000-4000-8000-00000000002b','a0000000-0000-4000-8000-000000000011',100,'e0000000-0000-4000-8000-00000000000b','concurrent settle transfer')$q$) as t(x jsonb) $$, 'session C holds a transfer for the settle reference');
select dblink_exec('d', 'begin');
select dblink_exec('d', 'set local role authenticated');
select dblink_exec('d', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('d', 'set local app.test_session_active = ''on''');
select dblink_exec('d', 'set local statement_timeout = ''15s''');
select is(dblink_send_query('d', $q$select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002b')$q$), 1, 'session D starts settlement');
select ok(pg_temp.wait_lock('fn_treasury_shift_settle'), 'settlement waits on the in-flight transfer');
select is(dblink_exec('c', 'commit'), 'COMMIT', 'session C commits the transfer');
select throws_ok($$ select * from dblink_get_result('d') as t(id uuid) $$, '23514', null, 'settlement rejects the transfer that moved the drawer');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-00000000000b'), 2::bigint, 'failed settlement adds no ledger row');
select is((select status from public.treasury_shifts where id='e0000000-0000-4000-8000-00000000000b'), 'closed', 'failed settlement leaves the shift closed');
select dblink_disconnect('d');

-- E moves the parent while F waits; F re-reads after locking and rejects.
select is(dblink_connect('e', pg_temp.conninfo()), 'OK', 'session E connects');
select is(dblink_connect('f', pg_temp.conninfo()), 'OK', 'session F connects');
select dblink_exec('e', 'begin');
select dblink_exec('e', 'set local statement_timeout = ''15s''');
select is(dblink_exec('e', 'update public.treasury set parent_treasury_id=''a0000000-0000-4000-8000-000000000016'' where id=''d0000000-0000-4000-8000-00000000002f'''), 'UPDATE 1', 'session E moves the drawer parent');
select dblink_exec('f', 'begin');
select dblink_exec('f', 'set local role authenticated');
select dblink_exec('f', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('f', 'set local app.test_session_active = ''on''');
select dblink_exec('f', 'set local statement_timeout = ''15s''');
select is(dblink_send_query('f', $q$select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-00000000002f')$q$), 1, 'session F starts settlement');
select ok(pg_temp.wait_lock('fn_treasury_shift_settle'), 'settlement waits on the parent metadata lock');
select is(dblink_exec('e', 'commit'), 'COMMIT', 'session E commits the metadata change');
select throws_ok($$ select * from dblink_get_result('f') as t(id uuid) $$, '23514', null, 'settlement rejects the changed parent');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-00000000000f'), 0::bigint, 'metadata rejection writes no ledger row');
select dblink_disconnect('f');

-- Settlement retry on the same shift is idempotent and does not move money.
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select lives_ok($$ select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000030') $$, 'settlement retry: first call succeeds');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
set local app.test_session_active = 'on';
select is(public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000030'), 'e0000000-0000-4000-8000-000000000010'::uuid, 'settlement retry returns the same shift');
reset role;
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000010'), 2::bigint, 'settlement retry does not duplicate the transfer');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000017'), 100::numeric, 'settlement retry leaves the parent at counted');

-- G holds settlement locks; H settles the same closed shift and must return
-- the same id without posting a second transfer pair.
select is(dblink_connect('g', pg_temp.conninfo()), 'OK', 'session G connects');
select is(dblink_connect('h', pg_temp.conninfo()), 'OK', 'session H connects');
select dblink_exec('g', 'begin');
select dblink_exec('g', 'set local role authenticated');
select dblink_exec('g', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('g', 'set local app.test_session_active = ''on''');
select dblink_exec('g', 'set local statement_timeout = ''15s''');
create temp table settle_race_first as
  select * from dblink('g', $q$select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000038')$q$) as t(id uuid);
select is((select count(*) from settle_race_first), 1::bigint, 'session G settles first');
select dblink_exec('h', 'begin');
select dblink_exec('h', 'set local role authenticated');
select dblink_exec('h', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('h', 'set local app.test_session_active = ''on''');
select dblink_exec('h', 'set local statement_timeout = ''15s''');
select is(dblink_send_query('h', $q$select public.fn_treasury_shift_settle('d0000000-0000-4000-8000-000000000038')$q$), 1, 'session H starts settlement');
select ok(pg_temp.wait_lock('fn_treasury_shift_settle'), 'second settlement waits for the first');
select is(dblink_exec('g', 'commit'), 'COMMIT', 'session G commits settlement');
select is((select id from dblink_get_result('h') as t(id uuid)), (select id from settle_race_first), 'second settlement returns the same shift id');
select * from dblink_get_result('h') as t(id uuid);
select dblink_exec('h', 'commit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000018'), 2::bigint, 'settle + settle posts one transfer pair');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000023'), 100::numeric, 'settle + settle parent is counted once');
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000038'), 0::numeric, 'settle + settle drawer ends at zero');
select is((select status from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000018'), 'settled', 'settle + settle shift is settled');

-- I holds a transfer for the close reference; J's close must wait, then read
-- the new book and close at zero without a deadlock.
select is(dblink_connect('i', pg_temp.conninfo()), 'OK', 'session I connects');
select is(dblink_connect('j', pg_temp.conninfo()), 'OK', 'session J connects');
select dblink_exec('i', 'begin');
select dblink_exec('i', 'set local role authenticated');
select dblink_exec('i', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('i', 'set local app.test_session_active = ''on''');
select dblink_exec('i', 'set local statement_timeout = ''15s''');
select lives_ok($$ select * from dblink('i', $q$select public.transfer_treasury_funds('d0000000-0000-4000-8000-000000000039','a0000000-0000-4000-8000-000000000024',100,'e0000000-0000-4000-8000-000000000019','close race transfer')$q$) as t(x jsonb) $$, 'session I holds a transfer for the close reference');
select dblink_exec('j', 'begin');
select dblink_exec('j', 'set local role authenticated');
select dblink_exec('j', 'set local request.jwt.claim.sub = ''f0000000-0000-4000-8000-000000000001''');
select dblink_exec('j', 'set local app.test_session_active = ''on''');
select dblink_exec('j', 'set local statement_timeout = ''15s''');
select is(dblink_send_query('j', $q$select public.fn_treasury_shift_close('d0000000-0000-4000-8000-000000000039',0)$q$), 1, 'session J starts close');
select ok(pg_temp.wait_lock('fn_treasury_shift_close'), 'close waits on the in-flight transfer');
select is(dblink_exec('i', 'commit'), 'COMMIT', 'session I commits the transfer');
select is((select id from dblink_get_result('j') as t(id uuid)), 'e0000000-0000-4000-8000-000000000019'::uuid, 'close returns the same open shift');
select * from dblink_get_result('j') as t(id uuid);
select dblink_exec('j', 'commit');
select is((select count(*) from public.treasury_transactions where reference_id='e0000000-0000-4000-8000-000000000019'), 2::bigint, 'close + transfer leaves one transfer pair');
select is((select current_balance from public.treasury where id='d0000000-0000-4000-8000-000000000039'), 0::numeric, 'close + transfer drawer ends at zero');
select is((select current_balance from public.treasury where id='a0000000-0000-4000-8000-000000000024'), 100::numeric, 'close + transfer parent is counted once');
select is((select status from public.treasury_shifts where id='e0000000-0000-4000-8000-000000000019'), 'closed', 'close + transfer signs the shift');

select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('c');
select dblink_disconnect('e');
select dblink_disconnect('g');
select dblink_disconnect('h');
select dblink_disconnect('i');
select dblink_disconnect('j');
select * from finish();
rollback;
