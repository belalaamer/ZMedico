-- The existing rls_hardening_branch_or_default policy already enforces
-- department branch visibility. Remove the duplicate restrictive SELECT policy
-- introduced by the HR hardening pass to avoid redundant policy evaluation.
drop policy if exists departments_read_scope_enforced on public.departments;
