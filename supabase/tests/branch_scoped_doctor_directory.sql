-- Structural contract for branch-scoped doctor lookup.
-- No operational rows are inserted or queried.

begin;
create extension if not exists pgtap;
select plan(8);

select ok(
  to_regprocedure('public.list_doctors_for_branch(uuid)') is not null,
  'branch-scoped doctor function exists'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.list_doctors_for_branch(uuid)'::regprocedure
      and prosecdef
  ),
  'branch-scoped doctor function is SECURITY DEFINER'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.list_doctors_for_branch(uuid)'::regprocedure
      and prosrc like '%staff_branches%'
      and prosrc like '%branch_id = _branch_id%'
  ),
  'doctor result set is joined to the requested branch'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.list_doctors_for_branch(uuid)'::regprocedure
      and prosrc like '%user_has_branch_access%'
  ),
  'non-owner callers require access to the requested branch'
);
select ok(
  has_function_privilege('authenticated', 'public.list_doctors_for_branch(uuid)', 'EXECUTE'),
  'authenticated can execute branch-scoped doctor lookup'
);
select ok(
  not has_function_privilege('anon', 'public.list_doctors_for_branch(uuid)', 'EXECUTE'),
  'anon cannot execute branch-scoped doctor lookup'
);
select ok(
  not has_function_privilege('public', 'public.list_doctors_for_branch(uuid)', 'EXECUTE'),
  'public role cannot execute branch-scoped doctor lookup'
);
select ok(
  exists (
    select 1 from pg_proc
    where oid = 'public.list_doctors_for_branch(uuid)'::regprocedure
      and proargnames @> array['_branch_id']::name[]
  ),
  'function accepts an explicit branch id'
);

select * from finish();
rollback;
