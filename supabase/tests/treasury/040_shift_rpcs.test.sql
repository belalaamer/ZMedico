-- Static contract test for 20261117123000_treasury_shift_rpcs.sql.
--
-- Shift RPCs cannot be exercised here without a live authenticated session,
-- branch access, and a custody fixture. This test checks the security and
-- settlement contract instead: the one-time settlement window, the zero-drawer
-- allowance, the money path, and the EXECUTE grants.

begin;

select plan(25);

-- 1-4: the immutable guard accepts exactly one settlement update
select ok(
  to_regprocedure('public._tg_treasury_shift_immutable()') is not null,
  'shift immutability guard exists');
select ok(
  position('app.allow_treasury_shift_settle' in
    pg_get_functiondef('public._tg_treasury_shift_immutable()'::regprocedure)) > 0,
  'immutability guard has a one-time settlement gate');
select ok(
  position('a settled shift is permanent' in
    pg_get_functiondef('public._tg_treasury_shift_immutable()'::regprocedure)) > 0,
  'immutability guard makes a settled shift permanent');
select ok(
  position('settlement can only add settlement facts' in
    pg_get_functiondef('public._tg_treasury_shift_immutable()'::regprocedure)) > 0,
  'immutability guard rejects changes outside settlement facts');

-- 5-6: settlement is audited as settlement, not as a second close
select ok(
  to_regprocedure('public.audit_treasury_shift_v1()') is not null,
  'shift audit trigger function exists');
select ok(
  position('treasury_shift.settle' in
    pg_get_functiondef('public.audit_treasury_shift_v1()'::regprocedure)) > 0,
  'shift audit records settlement separately');

-- 7-8: zero-drawer shape
select ok(
  exists (select 1 from pg_constraint
           where conrelid='public.treasury_shifts'::regclass
             and conname='treasury_shift_status_shape'),
  'shift status shape constraint exists');
select ok(
  position('expected_closing = 0' in
    (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.treasury_shifts'::regclass
        and conname='treasury_shift_status_shape')) > 0
  and position('closing_counted = 0' in
    (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.treasury_shifts'::regclass
        and conname='treasury_shift_status_shape')) > 0,
  'status shape allows a zero drawer with no settlement transaction');

-- 9-16: settle RPC
select ok(
  to_regprocedure('public.fn_treasury_shift_settle(uuid,text)') is not null,
  'settle RPC exists');
select ok(
  (select prosecdef from pg_proc
    where oid='public.fn_treasury_shift_settle(uuid,text)'::regprocedure),
  'settle RPC is security definer');
select ok(
  (select array_to_string(proconfig, ',') from pg_proc
    where oid='public.fn_treasury_shift_settle(uuid,text)'::regprocedure)
    like '%search_path=public%',
  'settle RPC pins search_path');
select ok(
  position('transfer_treasury_funds' in
    pg_get_functiondef('public.fn_treasury_shift_settle(uuid,text)'::regprocedure)) > 0,
  'settle RPC uses the existing transfer writer');
select ok(
  position('parent_treasury_id' in
    pg_get_functiondef('public.fn_treasury_shift_settle(uuid,text)'::regprocedure)) > 0,
  'settle RPC requires a parent treasury');
select ok(
  position('treasury_shift_variance' in
    pg_get_functiondef('public.fn_treasury_shift_settle(uuid,text)'::regprocedure)) > 0,
  'settle RPC records variance separately');
select ok(
  position('expected_closing' in
    pg_get_functiondef('public.fn_treasury_shift_settle(uuid,text)'::regprocedure)) > 0,
  'settle RPC settles the signed expected amount');
select ok(
  position('app.allow_treasury_shift_settle' in
    pg_get_functiondef('public.fn_treasury_shift_settle(uuid,text)'::regprocedure)) > 0,
  'settle RPC opens the one-time settlement gate');

-- 17-19: close + settle wrapper
select ok(
  to_regprocedure('public.fn_treasury_shift_close_and_settle(uuid,numeric,uuid,text)') is not null,
  'close-and-settle RPC exists');
select ok(
  position('fn_treasury_shift_close' in
    pg_get_functiondef('public.fn_treasury_shift_close_and_settle(uuid,numeric,uuid,text)'::regprocedure)) > 0,
  'close-and-settle RPC calls the signed close');
select ok(
  position('fn_treasury_shift_settle' in
    pg_get_functiondef('public.fn_treasury_shift_close_and_settle(uuid,numeric,uuid,text)'::regprocedure)) > 0,
  'close-and-settle RPC calls settlement');

-- 20-25: grants
select ok(
  has_function_privilege('authenticated',
    'public.fn_treasury_shift_settle(uuid,text)', 'EXECUTE'),
  'authenticated may execute settle');
select ok(
  not has_function_privilege('anon',
    'public.fn_treasury_shift_settle(uuid,text)', 'EXECUTE'),
  'anon may not execute settle');
select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.fn_treasury_shift_settle(uuid,text)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'),
  'PUBLIC may not execute settle');
select ok(
  has_function_privilege('authenticated',
    'public.fn_treasury_shift_close_and_settle(uuid,numeric,uuid,text)', 'EXECUTE'),
  'authenticated may execute close-and-settle');
select ok(
  not has_function_privilege('anon',
    'public.fn_treasury_shift_close_and_settle(uuid,numeric,uuid,text)', 'EXECUTE'),
  'anon may not execute close-and-settle');
select ok(
  not exists (
    select 1
    from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.fn_treasury_shift_close_and_settle(uuid,numeric,uuid,text)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'),
  'PUBLIC may not execute close-and-settle');

select * from finish();

rollback;
