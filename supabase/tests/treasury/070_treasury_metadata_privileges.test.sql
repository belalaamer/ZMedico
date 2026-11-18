-- Privilege contract for 20261117125000_treasury_metadata_privileges.sql.
--
-- Run only against the disposable local harness. The harness grants baseline
-- table-level UPDATE on public.treasury to authenticated, anon, and
-- service_role BEFORE applying this migration, so the test proves the
-- migration narrows that baseline rather than merely observing an absent
-- grant. The final transaction is rolled back.

begin;
select plan(36);

-- ---------------------------------------------------------------------------
-- 1. Table and column privileges after the migration
-- ---------------------------------------------------------------------------

select is(
  has_table_privilege('authenticated', 'public.treasury', 'UPDATE'),
  false,
  'authenticated has no table-level UPDATE'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'account_kind', 'UPDATE'),
  false,
  'authenticated cannot update account_kind'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'is_default', 'UPDATE'),
  false,
  'authenticated cannot update is_default'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'financial_cycle_id', 'UPDATE'),
  false,
  'authenticated cannot update financial_cycle_id'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'current_balance', 'UPDATE'),
  false,
  'authenticated cannot update current_balance'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'non_cash_balance', 'UPDATE'),
  false,
  'authenticated cannot update non_cash_balance'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'custodian_user_id', 'UPDATE'),
  false,
  'authenticated cannot update custodian_user_id'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'parent_treasury_id', 'UPDATE'),
  false,
  'authenticated cannot update parent_treasury_id'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'deleted_at', 'UPDATE'),
  false,
  'authenticated cannot update deleted_at'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'branch_id', 'UPDATE'),
  false,
  'authenticated cannot move a treasury to another branch'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'updated_at', 'UPDATE'),
  false,
  'authenticated cannot set updated_at directly'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'name_en', 'UPDATE'),
  true,
  'authenticated may update name_en'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'name_ar', 'UPDATE'),
  true,
  'authenticated may update name_ar'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'currency', 'UPDATE'),
  true,
  'authenticated may update currency'
);

select is(
  has_column_privilege('authenticated', 'public.treasury', 'is_active', 'UPDATE'),
  true,
  'authenticated may update is_active'
);

select is(
  has_table_privilege('anon', 'public.treasury', 'UPDATE'),
  false,
  'anon has no table-level UPDATE'
);

select is(
  has_column_privilege('anon', 'public.treasury', 'account_kind', 'UPDATE'),
  false,
  'anon cannot update account_kind'
);

select is(
  has_column_privilege('anon', 'public.treasury', 'name_en', 'UPDATE'),
  false,
  'anon gets no metadata column grant'
);

select is(
  has_table_privilege('service_role', 'public.treasury', 'UPDATE'),
  true,
  'service_role keeps table-level UPDATE'
);

select is(
  has_column_privilege('service_role', 'public.treasury', 'account_kind', 'UPDATE'),
  true,
  'service_role keeps account_kind UPDATE'
);

select is(
  has_column_privilege('service_role', 'public.treasury', 'financial_cycle_id', 'UPDATE'),
  true,
  'service_role keeps financial_cycle_id UPDATE'
);

select is(
  has_table_privilege('authenticated', 'public.treasury', 'SELECT'),
  true,
  'authenticated keeps SELECT'
);

-- ---------------------------------------------------------------------------
-- 2. Functional checks as authenticated
-- ---------------------------------------------------------------------------

-- Remove RLS from the isolated harness so the only possible failure for the
-- sensitive-column statements is the column privilege under test.
reset role;
alter table public.treasury disable row level security;

set local role authenticated;

select lives_ok($q$
  update public.treasury
     set name_en = 'PR6 Safe Name',
         name_ar = 'PR6 اسم آمن',
         currency = 'EGP',
         is_active = true
   where id = 'a1111111-1111-4111-8111-111111111111'
$q$, 'authenticated can update the metadata allowlist');

select throws_ok($q$
  update public.treasury
     set account_kind = 'bank'
   where id = 'a1111111-1111-4111-8111-111111111111'
$q$, '42501', null, 'authenticated cannot update account_kind');

select throws_ok($q$
  update public.treasury
     set is_default = true
   where id = 'a1111111-1111-4111-8111-111111111111'
$q$, '42501', null, 'authenticated cannot update is_default');

select throws_ok($q$
  update public.treasury
     set financial_cycle_id = 'c1111111-1111-4111-8111-111111111111'
   where id = 'a1111111-1111-4111-8111-111111111111'
$q$, '42501', null, 'authenticated cannot update financial_cycle_id');

select throws_ok($q$
  update public.treasury
     set current_balance = 999
   where id = 'a1111111-1111-4111-8111-111111111111'
$q$, '42501', null, 'authenticated cannot write a balance directly');

select throws_ok($q$
  update public.treasury
     set name_en = 'PR6 Should Not Persist',
         account_kind = 'bank'
   where id = 'a1111111-1111-4111-8111-111111111111'
$q$, '42501', null, 'a mixed safe/sensitive update is rejected atomically');

-- ---------------------------------------------------------------------------
-- 3. The rejected statements changed nothing
-- ---------------------------------------------------------------------------

reset role;

select is(
  (select name_en from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111111'),
  'PR6 Safe Name',
  'the safe metadata update persisted'
);

select is(
  (select account_kind from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111111'),
  'cash',
  'account_kind is unchanged after the rejected updates'
);

select is(
  (select is_default from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111111'),
  false,
  'is_default is unchanged after the rejected updates'
);

select is(
  (select financial_cycle_id from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111111'),
  'c1111111-1111-4111-8111-111111111111'::uuid,
  'financial_cycle_id is unchanged after the rejected updates'
);

select is(
  (select current_balance from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111111'),
  0::numeric,
  'current_balance is unchanged after the rejected update'
);

select is(
  (select name_en from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111111'),
  'PR6 Safe Name',
  'the mixed statement did not leak its safe column change'
);

-- ---------------------------------------------------------------------------
-- 4. service_role remains the privileged writer
-- ---------------------------------------------------------------------------

set local role service_role;

select lives_ok($q$
  update public.treasury
     set account_kind = 'bank'
   where id = 'a1111111-1111-4111-8111-111111111111'
$q$, 'service_role can still update account_kind');

reset role;

select is(
  (select account_kind from public.treasury
    where id = 'a1111111-1111-4111-8111-111111111111'),
  'bank',
  'service_role change is visible'
);

select * from finish();
rollback;
