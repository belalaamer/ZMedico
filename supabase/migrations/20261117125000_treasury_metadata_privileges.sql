-- PR-6: restrict direct treasury metadata edits to a column allowlist.
--
-- This migration changes privileges only. It does not delete rows, tables,
-- columns, indexes, or historical ledger entries, and it does not rewrite any
-- existing treasury row. It also does not change RLS policies.
--
-- Why this is needed
-- ------------------
-- Supabase grants table-level UPDATE to `authenticated` by default. A column
-- REVOKE alone does nothing while that table-level grant exists: PostgreSQL
-- treats a table-level UPDATE grant as covering every column. This migration
-- therefore revokes table-level UPDATE on `public.treasury` and grants UPDATE
-- only on the metadata columns an authenticated caller may change.
--
-- Blocked for `authenticated` and `anon`:
--   * account_kind       -- cash vs bank is a structural accounting fact
--   * is_default         -- default treasury selection is accounting control
--   * financial_cycle_id -- moving a treasury between cycles rewrites reporting
--   * current_balance / non_cash_balance -- money is changed only by the ledger
--   * custodian_user_id / parent_treasury_id -- drawer shape and ownership
--   * branch_id / id / created_at / deleted_at -- identity and lifecycle
--
-- Allowed for `authenticated`:
--   * name_en, name_ar, currency, is_active
--
-- `service_role`, the table owner, and SECURITY DEFINER functions keep their
-- existing access. Reviewed RPCs therefore remain the path for privileged
-- changes. This is a privilege allowlist, not RLS and not a trigger.
--
-- Forward-only rollback: restore table-level UPDATE to `authenticated` with a
-- separately reviewed migration. Do not reverse this file, and do not grant
-- UPDATE on the sensitive columns above to `authenticated` again.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Remove the table-level grant that currently covers every column, including
-- the sensitive metadata. `public` is included because it applies to every
-- role unless a direct grant overrides it.
revoke update on table public.treasury
  from public, anon, authenticated;

-- Grant only the columns that are safe to edit directly. `updated_at` is set
-- by trg_treasury_updated, so it is intentionally not in this list.
grant update (name_en, name_ar, currency, is_active)
  on table public.treasury
  to authenticated;

-- Keep the service path explicit. This restores the table-level grant for the
-- service role if it previously inherited it through PUBLIC; it does not
-- grant anything to end-user roles.
grant update on table public.treasury
  to service_role;

-- The table owner and SECURITY DEFINER functions are unaffected by role
-- privileges. They remain the only paths that may change balances, cycles,
-- account_kind, is_default, custody, or lifecycle fields.
