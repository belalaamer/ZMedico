-- Two-session pgTAP test for fn_treasury_archive.
--
-- Requires fixtures/048_archive_concurrency.sql to be committed before this test.
-- The test transaction rolls back, but the dblink sessions commit their work.

begin;
select plan(22);

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

select is(public.dblink_connect('a', pg_temp.conninfo()), 'OK', 'session A connects');
select is(public.dblink_connect('b', pg_temp.conninfo()), 'OK', 'session B connects');

-- 1. Two archives of the same empty treasury: one wins, the other sees archived.
select public.dblink_exec('a', 'begin', false);
select public.dblink_exec('a', 'set local role authenticated', false);
select public.dblink_exec('a','set local request.jwt.claims = ''{"iss":"https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1","sub":"f7777777-7777-4777-8777-777777777771","role":"authenticated","session_id":"e7777777-7777-4777-8777-777777777771","exp":2000000000}''', false);
select public.dblink_exec('a', 'set local request.jwt.claim.sub = ''f7777777-7777-4777-8777-777777777771''', false);
select public.dblink_exec('a', 'set local statement_timeout = ''15s''', false);
select lives_ok($$ select * from public.dblink('a', $q$select public.fn_treasury_archive('a7777777-7777-4777-8777-777777777781')$q$) as t(id uuid) $$,
  'session A archives and holds the row lock');
select public.dblink_exec('b', 'begin', false);
select public.dblink_exec('b', 'set local role authenticated', false);
select public.dblink_exec('b','set local request.jwt.claims = ''{"iss":"https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1","sub":"f7777777-7777-4777-8777-777777777771","role":"authenticated","session_id":"e7777777-7777-4777-8777-777777777771","exp":2000000000}''', false);
select public.dblink_exec('b', 'set local request.jwt.claim.sub = ''f7777777-7777-4777-8777-777777777771''', false);
select public.dblink_exec('b', 'set local statement_timeout = ''15s''', false);
select is(public.dblink_send_query('b', $q$select public.fn_treasury_archive('a7777777-7777-4777-8777-777777777781')$q$), 1,
  'session B starts a second archive');
select ok(pg_temp.wait_lock(), 'session B waits on the archive row lock');
select is(public.dblink_exec('a', 'commit', false), 'COMMIT', 'session A commits the archive');
select throws_ok($$ select * from public.dblink_get_result('b') as t(id uuid) $$,
  '23503', null, 'session B sees the already-archived row');
select public.dblink_exec('b', 'commit', false);
select isnt((select deleted_at from public.treasury where id='a7777777-7777-4777-8777-777777777781'), null::timestamptz,
  'one archive wins');
select is((select count(*) from public.treasury where id='a7777777-7777-4777-8777-777777777781'), 1::bigint,
  'the archived row is retained exactly once');

-- 2. Open holds the drawer row; archive waits, then rejects the open shift.
select public.dblink_exec('a', 'begin', false);
select public.dblink_exec('a', 'set local role authenticated', false);
select public.dblink_exec('a','set local request.jwt.claims = ''{"iss":"https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1","sub":"f7777777-7777-4777-8777-777777777771","role":"authenticated","session_id":"e7777777-7777-4777-8777-777777777771","exp":2000000000}''', false);
select public.dblink_exec('a', 'set local request.jwt.claim.sub = ''f7777777-7777-4777-8777-777777777771''', false);
select public.dblink_exec('a', 'set local statement_timeout = ''15s''', false);
select lives_ok($$ select * from public.dblink('a', $q$select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777782',0,'concurrency')$q$) as t(id uuid) $$,
  'session A opens the drawer and holds the treasury lock');
select public.dblink_connect('c', pg_temp.conninfo());
select public.dblink_exec('c', 'begin', false);
select public.dblink_exec('c', 'set local role authenticated', false);
select public.dblink_exec('c','set local request.jwt.claims = ''{"iss":"https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1","sub":"f7777777-7777-4777-8777-777777777771","role":"authenticated","session_id":"e7777777-7777-4777-8777-777777777771","exp":2000000000}''', false);
select public.dblink_exec('c', 'set local request.jwt.claim.sub = ''f7777777-7777-4777-8777-777777777771''', false);
select public.dblink_exec('c', 'set local statement_timeout = ''15s''', false);
select is(public.dblink_send_query('c', $q$select public.fn_treasury_archive('a7777777-7777-4777-8777-777777777782')$q$), 1,
  'session B starts archive while the drawer is being opened');
select ok(pg_temp.wait_lock(), 'archive waits for the open row lock');
select is(public.dblink_exec('a', 'commit', false), 'COMMIT', 'session A commits the open shift');
select throws_ok($$ select * from public.dblink_get_result('c') as t(id uuid) $$,
  '23514', null, 'archive rejects the committed unsettled shift');
select * from public.dblink_get_result('c') as t(id uuid);
select public.dblink_exec('c','commit', false);
select is((select deleted_at from public.treasury where id='a7777777-7777-4777-8777-777777777782'), null::timestamptz,
  'archive did not delete the drawer');
select is((select count(*) from public.treasury_shifts where treasury_id='a7777777-7777-4777-8777-777777777782' and settled_at is null), 1::bigint,
  'the open shift remains and is still unsettled');

-- 3. Archive holds an empty row; open waits, then sees the archived treasury.
select public.dblink_exec('a', 'begin', false);
select public.dblink_exec('a', 'set local role authenticated', false);
select public.dblink_exec('a','set local request.jwt.claims = ''{"iss":"https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1","sub":"f7777777-7777-4777-8777-777777777771","role":"authenticated","session_id":"e7777777-7777-4777-8777-777777777771","exp":2000000000}''', false);
select public.dblink_exec('a', 'set local request.jwt.claim.sub = ''f7777777-7777-4777-8777-777777777771''', false);
select public.dblink_exec('a', 'set local statement_timeout = ''15s''', false);
select lives_ok($$ select * from public.dblink('a', $q$select public.fn_treasury_archive('a7777777-7777-4777-8777-777777777783')$q$) as t(id uuid) $$,
  'session A archives the second empty treasury');
select public.dblink_connect('d', pg_temp.conninfo());
select public.dblink_exec('d', 'begin', false);
select public.dblink_exec('d', 'set local role authenticated', false);
select public.dblink_exec('d','set local request.jwt.claims = ''{"iss":"https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1","sub":"f7777777-7777-4777-8777-777777777771","role":"authenticated","session_id":"e7777777-7777-4777-8777-777777777771","exp":2000000000}''', false);
select public.dblink_exec('d', 'set local request.jwt.claim.sub = ''f7777777-7777-4777-8777-777777777771''', false);
select public.dblink_exec('d', 'set local statement_timeout = ''15s''', false);
select is(public.dblink_send_query('d', $q$select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777783',0,null)$q$), 1,
  'session B starts an open against the archiving row');
select ok(pg_temp.wait_lock(), 'open waits for the archive row lock');
select is(public.dblink_exec('a', 'commit', false), 'COMMIT', 'session A commits the archive');
select throws_ok($$ select * from public.dblink_get_result('d') as t(id uuid) $$,
  '23503', null, 'open sees the archived treasury and fails closed');
select * from public.dblink_get_result('d') as t(id uuid);
select public.dblink_exec('d','commit', false);
select is((select count(*) from public.treasury_shifts where treasury_id='a7777777-7777-4777-8777-777777777783'), 0::bigint,
  'the rejected open wrote no shift');

select public.dblink_disconnect('a');
select public.dblink_disconnect('c');
select public.dblink_disconnect('d');

select * from finish();
rollback;
