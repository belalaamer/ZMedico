-- Contract test for public.payment_method after
-- 20261117120000_payment_method_instapay.sql.
--
-- Read-only assertions: this file does not insert, update, or delete rows.

begin;

select plan(4);

select results_eq(
  $$
    select e.enumlabel::text
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and t.typname = 'payment_method'
     order by e.enumsortorder
  $$,
  $$
    values ('cash'), ('card'), ('bank_transfer'), ('insurance'), ('wallet'), ('instapay')
  $$,
  'payment_method has exactly the expected labels, with instapay appended last'
);

select ok(
  exists (
    select 1
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and t.typname = 'payment_method'
       and e.enumlabel = 'instapay'
  ),
  'instapay exists in public.payment_method'
);

select ok(
  not exists (
    select 1
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and t.typname = 'expense_method'
       and e.enumlabel = 'instapay'
  ),
  'expense_method is deliberately unchanged'
);

select ok(
  to_regtype('public.payment_method') is not null,
  'public.payment_method remains a resolvable enum type'
);

select * from finish();

rollback;
