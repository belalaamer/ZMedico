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
--   * currency -- changing it reinterprets every balance, payment, transfer,
--     and report already stored for this treasury; no guard currently proves
--     a currency change is safe for a treasury with history
--
-- Allowed for `authenticated`:
--   * name_en, name_ar, is_active
--
-- `is_active` policy: deactivation never moves money or changes a balance.
-- PR-5 rejects a collection whose route points at an inactive treasury; PR-4
-- close/settle/close-and-settle revalidate the shift and treasury but do not
-- require `is_active`, so an open or closed-unsettled shift can still be
-- closed and settled after deactivation. Operators must settle or transfer
-- any remaining balance and repoint/deactivate active routes before retiring
-- a treasury. This migration does not add a deactivation trigger; it records
-- the privilege boundary and the operational policy.
--
-- The table owner and SECURITY DEFINER functions run with the owner's
-- privileges. The owner must still hold the necessary privileges; this
-- migration does not grant anything to a function owner implicitly. The
-- reviewed functions in this stack are owned by postgres in the local
-- harness, and their owner must be checked in each target environment.
--
-- Forward-only rollback: stop the affected edit UI, then either grant a
-- missing safe column after review or use a reviewed RPC for a sensitive
-- change. Do not restore table-level UPDATE to `authenticated` as a rollback
-- shortcut; that would reopen every sensitive column.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Remove the table-level grant that currently covers every column, including
-- the sensitive metadata. Revoking UPDATE from PUBLIC removes that source of
-- the privilege for every role; it does not remove a grant made directly to a
-- role. The direct grants are revoked separately below.
revoke update on table public.treasury
  from public, anon, authenticated;

-- Revoke any pre-existing column-level UPDATE grants too. A table-level
-- REVOKE does not remove a column grant that was issued separately.
revoke update (
  id, branch_id, name_en, name_ar, current_balance, non_cash_balance,
  currency, account_kind, custodian_user_id, parent_treasury_id, is_active,
  deleted_at, created_at, updated_at, financial_cycle_id, is_default
) on table public.treasury
  from public, anon, authenticated;

-- Grant only the columns that are safe to edit directly. `updated_at` is set
-- by trg_treasury_updated, so it is intentionally not in this list. Currency
-- is deliberately excluded: it changes the interpretation of every existing
-- balance and movement, and there is no currency-change guard or migration.
grant update (name_en, name_ar, is_active)
  on table public.treasury
  to authenticated;

-- Keep the service path explicit. This restores the table-level grant for the
-- service role if it previously inherited it through PUBLIC; it does not
-- grant anything to end-user roles.
grant update on table public.treasury
  to service_role;

-- The table owner and SECURITY DEFINER functions remain the only paths that
-- may change balances, cycles, account_kind, is_default, custody, currency, or
-- lifecycle fields. Their owner must still have the required privileges.
-- No reviewed PR-4/PR-5 RPC currently changes account_kind, is_default,
-- financial_cycle_id, or currency; those are service-role/owner operations
-- until a reviewed RPC exists.
