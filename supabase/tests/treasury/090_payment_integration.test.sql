-- Real-schema integration smoke for 20261117124000_treasury_payment_rpcs.sql.
--
-- This file is intentionally separate from the disposable harness. It asserts
-- that the migration is installed on a real Supabase schema and that the
-- public contract rejects invalid calls before touching data.
--
-- This file is runnable against a real PostgreSQL schema that contains the
-- Supabase auth objects. It has been run against an isolated local replay of
-- the real schema; it has not been run against Production or an approved
-- remote Supabase branch. It is not wired into CI.

begin;
select plan(10);

select is(
  to_regprocedure('public.fn_treasury_payment_collect(uuid,uuid,uuid,jsonb,text,uuid,date,uuid,text)') is not null,
  true,
  'collection RPC with explicit request id exists'
);

select is(
  to_regprocedure('public._fn_treasury_payment_replay(uuid,uuid,uuid,text,uuid,uuid,numeric,jsonb,date)') is not null,
  true,
  'replay helper exists'
);

select is(
  (select data_type from information_schema.columns
    where table_schema='public' and table_name='payment_batches'
      and column_name='request_id'),
  'uuid',
  'payment_batches.request_id is a uuid'
);

select is(
  to_regclass('public.payment_batches_request_uq') is not null,
  true,
  'request id unique index exists'
);

select is(
  (select count(*) from pg_trigger
    where tgrelid='public.payments'::regclass
      and tgname='trg_payment_links_immutable'
      and not tgisinternal),
  1::bigint,
  'payment link immutability trigger exists'
);

select is(
  (select count(*) from pg_trigger
    where tgrelid='public.treasury_transactions'::regclass
      and tgname='trg_treasury_tx_payment_cycle'
      and not tgisinternal),
  1::bigint,
  'ledger cycle trigger exists'
);

select is(
  (select prosecdef from pg_proc
    where oid='public.fn_treasury_payment_collect(uuid,uuid,uuid,jsonb,text,uuid,date,uuid,text)'::regprocedure),
  true,
  'collection RPC is security definer'
);

select is(
  (select proconfig from pg_proc
    where oid='public.fn_treasury_payment_collect(uuid,uuid,uuid,jsonb,text,uuid,date,uuid,text)'::regprocedure),
  array['search_path=public'],
  'collection RPC fixes search_path'
);

select throws_ok($$
  select public.fn_treasury_payment_collect(
    null, null, null, '[]'::jsonb, null, null
  )
$$, '22023', null, 'null branch/patient/request is rejected before data access');

insert into auth.sessions (id, user_id, not_after) values
  ('99999999-9999-4999-8999-999999999998',
   '00000000-0000-4000-8000-000000000020', now() + interval '1 hour')
on conflict (id) do nothing;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'iss', 'https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1',
    'sub', '00000000-0000-4000-8000-000000000020',
    'role', 'authenticated',
    'session_id', '99999999-9999-4999-8999-999999999998',
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000020', true);
set local role authenticated;

select throws_ok($$
  select public.fn_treasury_payment_collect(
    'd0c1a50b-8de3-4a32-9b8f-19ff6309a773',
    '00000000-0000-4000-8000-000000000002',
    null,
    '[]'::jsonb,
    'integration-key-0001',
    '00000000-0000-4000-8000-000000000003'
  )
$$, '22023', null, 'empty splits are rejected after authorization');

select * from finish();
rollback;
