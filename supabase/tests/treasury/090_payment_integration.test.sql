-- Real-schema integration smoke for 20261117124000_treasury_payment_rpcs.sql.
--
-- This file is intentionally separate from the disposable harness. It asserts
-- that the migration is installed on a real Supabase schema and that the
-- public contract rejects invalid calls before touching data.
--
-- NOT RUN in the current environment: there is no disposable Supabase project,
-- no Docker, and no credentials. Do not claim it passed. It is not wired into
-- CI. Run it manually only against an approved disposable Supabase database.

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

select throws_ok($$
  select public.fn_treasury_payment_collect(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    null,
    '[]'::jsonb,
    'integration-key-0001',
    '00000000-0000-4000-8000-000000000003'
  )
$$, '22023', null, 'empty splits are rejected before data access');

select * from finish();
rollback;
