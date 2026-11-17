-- Real-schema integration/contract test for the PR-4 RPCs.
--
-- NOT RUN in this environment: there is no Docker and no disposable Supabase
-- database. Run it with `supabase test db` or pg_prove against a disposable
-- Supabase branch after applying 20261117123000_treasury_shift_rpcs.sql.
-- It deliberately creates no fixtures and touches no Production data.

begin;
select plan(10);

select has_column(
  'public', 'treasury_shifts', 'close_request_id',
  'real schema has the close request identity column');
select has_index(
  'public', 'treasury_shifts', 'treasury_shifts_close_request_uq',
  'real schema has the per-treasury request unique index');
select col_is_unique(
  'public', 'treasury_shifts', array['treasury_id','close_request_id'],
  'real schema enforces one request id per treasury');

select has_function(
  'public', 'fn_treasury_shift_close_and_settle', array['uuid','numeric','uuid','text','uuid'],
  '5-argument idempotent wrapper exists');
select has_function(
  'public', 'fn_treasury_shift_close_and_settle', array['uuid','numeric','uuid','text'],
  '4-argument compatibility wrapper exists');
select has_function(
  'public', 'fn_treasury_shift_settle', array['uuid','text'],
  'settle RPC exists');
select has_function(
  'public', '_fn_treasury_shift_close_locked',
  array['public.treasury_shifts','numeric','numeric','uuid','text','uuid'],
  'internal close core exists');
select has_function(
  'public', '_fn_treasury_shift_settle_locked',
  array['public.treasury_shifts','public.treasury','public.treasury','text'],
  'internal settle core exists');

select ok(
  (select prosecdef from pg_proc
    where oid = 'public.fn_treasury_shift_close_and_settle(uuid,numeric,uuid,text,uuid)'::regprocedure),
  '5-argument wrapper is security definer');
select is(
  (select array_to_string(proconfig, ',') from pg_proc
    where oid = 'public._fn_treasury_shift_settle_locked(public.treasury_shifts,public.treasury,public.treasury,text)'::regprocedure),
  'search_path=public',
  'settle core pins search_path');

select * from finish();
rollback;
