-- J-01 remediation (RBAC audit, Phase M.2): missing canonical bundle
-- permissions for four already-correctly-written RPCs.
--
-- apply_coupon_code(), apply_inventory_tx(), fn_treasury_day_cash_summary(),
-- and receive_po_item() already gate themselves correctly via
-- has_permission(auth.uid(), '<key>') -- the RPC bodies are not the
-- problem and are not touched here. The canonical permission keys they
-- check simply had no row in authz_bundle_permissions for any role other
-- than admin, so every non-admin caller was rejected even though the
-- legacy UI layer (rolePermissions.ts / role_permissions DB / Sidebar /
-- routes) already presents these actions to receptionist, accountant, and
-- manager per docs/RBAC_MATRIX.md:
--   - receptionist: coupons "V (apply codes only)"
--   - accountant: coupons full CRUD, treasury VCEX
--   - manager: inventory CRUD, treasury VX
--
-- This migration adds exactly the six missing (bundle_key, permission_key)
-- rows needed to close that gap -- data only, additive, idempotent
-- (ON CONFLICT DO NOTHING against the existing PRIMARY KEY (bundle_key,
-- permission_key)). No RPC body, has_permission()/has_role(), RLS policy,
-- *_via_* branch-isolation function, application code, or existing
-- permission row is modified, removed, or altered.
--
-- Explicitly out of scope for this migration (left exactly as-is):
--   - add_treasury_tx()'s treasury.tx.write permission (accountant's
--     manual-adjustment path needs separate evidence before any change).
--   - check_expiry_alerts()'s inventory.alerts.manage permission (no
--     confirmed application caller yet).
--   - J-14 (the eight user_has_branch_access_via_* functions) -- untouched.
--   - H1-01, E-01 -- untouched, not part of this change.
--
-- Verified before applying (Phase M.2 pre-flight):
--   - All three bundle keys (bundle.role.receptionist, bundle.role.accountant,
--     bundle.role.manager) and all four permission keys already exist.
--   - None of the six target rows existed yet (zero rows matched).
--   - Table had 172 rows before this migration.

INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
VALUES
  ('bundle.role.receptionist', 'invoices.coupon.apply'),
  ('bundle.role.accountant', 'invoices.coupon.apply'),
  ('bundle.role.manager', 'inventory.tx.write'),
  ('bundle.role.manager', 'purchase_orders.receive'),
  ('bundle.role.manager', 'treasury.daily_close.view'),
  ('bundle.role.accountant', 'treasury.daily_close.view')
ON CONFLICT DO NOTHING;

-- Verified after applying: table now has 178 rows (172 + exactly 6); all
-- six rows present; admin's existing mappings for these four keys are
-- unchanged; RPC body hashes (md5(prosrc)) identical before and after for
-- all four functions.
