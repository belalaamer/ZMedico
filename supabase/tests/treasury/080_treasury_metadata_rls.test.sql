-- Real-schema RLS contract for the treasury metadata privilege boundary.
--
-- NOT RUN in the current environment. There is no approved disposable
-- Supabase project, no Docker, and no credentials. This file must be run
-- manually only on an approved disposable branch. Do not claim it passed.
--
-- This is deliberately separate from 070 and 071. Those files disable RLS in
-- the local harness to test ACLs and financial compatibility. This file keeps
-- RLS enabled and tests the existing treasury policies against a real schema.
--
-- The file creates its own branch, users, roles, and treasury inside one
-- transaction and rolls everything back.

begin;
select plan(11);

insert into auth.users (id, email) values
  ('f9999999-9999-4999-8999-999999999991', 'pr6-rls-admin@example.test'),
  ('f9999999-9999-4999-8999-999999999992', 'pr6-rls-other@example.test')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f9999999-9999-4999-8999-999999999991', 'admin'),
  ('f9999999-9999-4999-8999-999999999992', 'receptionist')
on conflict do nothing;

insert into public.branches (id, name_en, name_ar) values
  ('b9999999-9999-4999-8999-999999999991', 'PR6 RLS Branch', 'فرع RLS')
on conflict (id) do nothing;

insert into public.treasury (
  id, branch_id, name_en, name_ar, current_balance, non_cash_balance,
  account_kind, is_active
) values (
  'a9999999-9999-4999-8999-999999999991',
  'b9999999-9999-4999-8999-999999999991',
  'PR6 RLS Treasury', 'خزينة RLS', 0, 0, 'cash', true
) on conflict (id) do nothing;

select is(
  (select relrowsecurity from pg_class where oid = 'public.treasury'::regclass),
  true,
  'treasury RLS is enabled'
);

select ok(
  exists (
    select 1 from pg_policy
     where polrelid = 'public.treasury'::regclass
       and polname = 'tre_select_auth'
  )
  and exists (
    select 1 from pg_policy
     where polrelid = 'public.treasury'::regclass
       and polname = 'tre_admin_all'
  ),
  'treasury select and admin policies exist'
);

set local role authenticated;
set local request.jwt.claim.sub = 'f9999999-9999-4999-8999-999999999991';

select is(
  (select count(*) from public.treasury
    where id = 'a9999999-9999-4999-8999-999999999991'),
  1::bigint,
  'admin can select the treasury under RLS'
);

select lives_ok($q$
  update public.treasury
     set name_en = 'PR6 RLS Admin Update'
   where id = 'a9999999-9999-4999-8999-999999999991'
$q$, 'admin can update an allowed metadata column under RLS');

select is(
  (select name_en from public.treasury
    where id = 'a9999999-9999-4999-8999-999999999991'),
  'PR6 RLS Admin Update',
  'admin metadata update persisted under RLS'
);

select throws_ok($q$
  update public.treasury
     set account_kind = 'bank'
   where id = 'a9999999-9999-4999-8999-999999999991'
$q$, '42501', null, 'ACL still blocks account_kind even for an RLS admin');

set local request.jwt.claim.sub = 'f9999999-9999-4999-8999-999999999992';

select is(
  (select count(*) from public.treasury
    where id = 'a9999999-9999-4999-8999-999999999991'),
  1::bigint,
  'non-admin can select the treasury through the select policy'
);

select is(
  (with changed as (
     update public.treasury
        set name_en = 'PR6 RLS Non-Admin Update'
      where id = 'a9999999-9999-4999-8999-999999999991'
      returning 1
   )
   select count(*) from changed),
  0::bigint,
  'non-admin update is filtered by RLS'
);

select is(
  (with deleted as (
     delete from public.treasury
      where id = 'a9999999-9999-4999-8999-999999999991'
      returning 1
   )
   select count(*) from deleted),
  0::bigint,
  'non-admin delete is filtered by RLS'
);

reset role;
set local role service_role;

select lives_ok($q$
  update public.treasury
     set account_kind = 'bank'
   where id = 'a9999999-9999-4999-8999-999999999991'
$q$, 'service_role can update account_kind under the real schema');

reset role;

select is(
  (select account_kind from public.treasury
    where id = 'a9999999-9999-4999-8999-999999999991'),
  'bank',
  'service_role sensitive update is visible'
);

select * from finish();
rollback;
