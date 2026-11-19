-- Real-schema RLS contract for the treasury metadata privilege boundary.
--
-- This file is runnable against a real PostgreSQL schema that contains the
-- Supabase auth/storage/realtime objects. It has been run against an isolated
-- local replay of the real schema; it has not been run against Production or
-- an approved remote Supabase branch. Do not treat a local replay pass as a
-- production RLS guarantee.
--
-- This is deliberately separate from 070 and 071. Those files disable RLS in
-- the local harness to test ACLs and financial compatibility. This file keeps
-- RLS enabled and tests the existing treasury policies against a real schema.
--
-- The file creates its own branch, users, live Auth sessions, branch membership,
-- roles, and treasury inside one transaction and rolls everything back. Adding
-- auth.users and user_roles alone is not enough: the real schema also requires
-- request.jwt.claims (iss/sub/session_id/exp), an auth.sessions row, and
-- staff_profiles/staff_branches membership before has_role(), branch isolation,
-- and session_is_active() can pass.

begin;
select plan(13);

insert into public.tenants (id, name, slug, subscription_status, subscription_ends_at) values
  ('99999999-9999-4999-8999-999999999999', 'PR6 RLS Tenant', 'pr6-rls-tenant',
   'active', now() + interval '1 year')
on conflict (id) do nothing;

insert into public.allowed_signup_emails (email, role, full_name) values
  ('pr6-rls-admin@example.test', 'admin', 'PR6 RLS Admin'),
  ('pr6-rls-other@example.test', 'receptionist', 'PR6 RLS Other')
on conflict (email) do nothing;

insert into auth.users (id, email, is_anonymous, banned_until, deleted_at) values
  ('f9999999-9999-4999-8999-999999999991', 'pr6-rls-admin@example.test', false, null, null),
  ('f9999999-9999-4999-8999-999999999992', 'pr6-rls-other@example.test', false, null, null)
on conflict (id) do nothing;

insert into auth.sessions (id, user_id, not_after) values
  ('e9999999-9999-4999-8999-999999999991', 'f9999999-9999-4999-8999-999999999991', now() + interval '1 hour'),
  ('e9999999-9999-4999-8999-999999999992', 'f9999999-9999-4999-8999-999999999992', now() + interval '1 hour')
on conflict (id) do nothing;

insert into public.branches (id, name_en, name_ar, tenant_id) values
  ('b9999999-9999-4999-8999-999999999991', 'PR6 RLS Branch', 'فرع RLS',
   '99999999-9999-4999-8999-999999999999')
on conflict (id) do nothing;

insert into public.staff_profiles (id, linked_user_id, branch_id, employee_id, status) values
  ('f9999999-9999-4999-8999-999999999991', 'f9999999-9999-4999-8999-999999999991', 'b9999999-9999-4999-8999-999999999991', 'PR6-RLS-001', 'active'),
  ('f9999999-9999-4999-8999-999999999992', 'f9999999-9999-4999-8999-999999999992', 'b9999999-9999-4999-8999-999999999991', 'PR6-RLS-002', 'active')
on conflict (id) do nothing;

insert into public.staff_branches (user_id, branch_id) values
  ('f9999999-9999-4999-8999-999999999991', 'b9999999-9999-4999-8999-999999999991'),
  ('f9999999-9999-4999-8999-999999999992', 'b9999999-9999-4999-8999-999999999991')
on conflict do nothing;

insert into public.user_roles (user_id, role) values
  ('f9999999-9999-4999-8999-999999999991', 'admin'),
  ('f9999999-9999-4999-8999-999999999992', 'receptionist')
on conflict do nothing;

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
       and polname = 'acct_treasury_select'
  )
  and exists (
    select 1 from pg_policy
     where polrelid = 'public.treasury'::regclass
       and polname = 'tre_admin_all'
  ),
  'treasury select and admin policies exist'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'iss', 'https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1',
    'sub', 'f9999999-9999-4999-8999-999999999991',
    'role', 'authenticated',
    'session_id', 'e9999999-9999-4999-8999-999999999991',
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);
select set_config('request.jwt.claim.sub', 'f9999999-9999-4999-8999-999999999991', true);
set local role authenticated;

select is(
  zmedico_security.session_is_active(),
  true,
  'seeded Auth session is active for the RLS admin'
);

select is(
  public.has_role('f9999999-9999-4999-8999-999999999991', 'admin'::public.app_role),
  true,
  'seeded admin role is visible through the real authorization helper'
);

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

select set_config(
  'request.jwt.claims',
  json_build_object(
    'iss', 'https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1',
    'sub', 'f9999999-9999-4999-8999-999999999992',
    'role', 'authenticated',
    'session_id', 'e9999999-9999-4999-8999-999999999992',
    'exp', extract(epoch from now() + interval '1 hour')::bigint
  )::text,
  true
);
select set_config('request.jwt.claim.sub', 'f9999999-9999-4999-8999-999999999992', true);

select is(
  (select count(*) from public.treasury
    where id = 'a9999999-9999-4999-8999-999999999991'),
  0::bigint,
  'non-admin cannot select treasury without a treasury read policy'
);

with changed as (
  update public.treasury
     set name_en = 'PR6 RLS Non-Admin Update'
   where id = 'a9999999-9999-4999-8999-999999999991'
   returning 1
)
select is(
  (select count(*) from changed),
  0::bigint,
  'non-admin update is filtered by RLS'
);

with deleted as (
  delete from public.treasury
   where id = 'a9999999-9999-4999-8999-999999999991'
   returning 1
)
select is(
  (select count(*) from deleted),
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
