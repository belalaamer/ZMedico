-- RBAC-04: manager write access on inventory-domain tables
--
-- Finding: the live role_permissions table grants manager
-- inventory:[view,create,edit,export] (no delete), and every inventory UI
-- page (Products.tsx, Suppliers.tsx, PurchaseOrders.tsx, StockOverview.tsx)
-- correctly gates its Add/Edit controls on that exact permission via
-- authz.can("inventory.create"/"inventory.edit") -- so manager sees fully
-- functional Add/Edit buttons throughout the inventory module. However,
-- every INSERT/UPDATE RLS policy across the underlying tables
-- (products, product_categories, suppliers, purchase_orders,
-- purchase_order_items, inventory, inventory_transactions) checks
-- has_role(auth.uid(), 'admin') literally, with no manager path at all.
-- The result: manager's Add/Edit clicks are accepted by the UI and then
-- unconditionally rejected by Postgres RLS (42501) -- a genuinely broken
-- workflow for a role the application's own permission model says should
-- be able to do this, not merely a cosmetic issue.
--
-- This migration closes that gap by adding manager-scoped INSERT/UPDATE
-- policies, one per table, following the exact same pattern already used
-- correctly elsewhere in this schema for the identical manager
-- view+export-but-also-write shape (see manager_expenses_insert /
-- manager_expenses_update on public.expenses, and manager_appts_insert /
-- manager_appts_update on public.appointments, both already keyed off
-- has_role(...,'manager') optionally combined with user_has_branch_access
-- when the table carries a branch_id).
--
-- Scope discipline:
--   * No DELETE policy is added for manager on any table -- manager's DB
--     grant is create+edit only (matrix confirms no inventory.delete for
--     manager), so the existing admin-only DELETE policies
--     (prd_delete_admin, cat_delete_admin, sup_delete_admin, po_delete_admin,
--     poi_delete_admin, inv_delete_admin) are left completely untouched.
--   * inventory_transactions gets an INSERT policy only (manager can record
--     a stock movement caused by their own inventory edit) -- no UPDATE
--     policy, consistent with this schema's existing convention that
--     transaction/ledger-style tables are treated as append-only after
--     creation (e.g. treasury_transactions' own treasury_tx_no_delete
--     RESTRICTIVE block). invtx_update_admin (admin-only correction path)
--     is left untouched.
--   * products, product_categories, and suppliers carry no branch_id column
--     (confirmed live) and their existing admin policies check only the
--     role, with no branch condition -- the new manager policies mirror that
--     exactly, adding no new branch semantics.
--   * inventory, inventory_transactions, and purchase_orders each already
--     carry a RESTRICTIVE `branch_isolation` (or equivalent) policy that
--     independently narrows every command to the caller's accessible
--     branches. The existing admin PERMISSIVE policies on these tables
--     (inv_insert_admin, invtx_insert_admin, po_insert_admin, etc.) rely on
--     that RESTRICTIVE policy for branch scoping and check only the role in
--     their own qual/with_check -- the new manager policies follow the same
--     convention for consistency, and are therefore still fully
--     branch-isolated in effect.
--   * purchase_order_items has no branch_id of its own; its existing
--     RESTRICTIVE purchase_order_items_branch_isolation policy scopes via
--     user_has_branch_access_via_purchase_order(purchase_order_id), which
--     already applies to any new PERMISSIVE policy on this table -- again,
--     the new manager policy checks only the role, matching poi_insert_admin.
--   * No existing policy, function, grant, or role definition is modified or
--     dropped -- this migration only adds new PERMISSIVE policies. J-14
--     (user_has_branch_access_via_* functions) is read-only referenced by
--     these table's *existing* RESTRICTIVE policies and is not touched here.
--   * No unrelated table (medical_records, coupons, appointments, etc.) is
--     touched -- this migration is scoped exclusively to the 7 inventory
--     tables named above, matching the single root-cause finding it fixes.

-- products
CREATE POLICY manager_products_insert
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY manager_products_update
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- product_categories
CREATE POLICY manager_product_categories_insert
  ON public.product_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY manager_product_categories_update
  ON public.product_categories
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- suppliers
CREATE POLICY manager_suppliers_insert
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY manager_suppliers_update
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- inventory (branch-scoped via existing RESTRICTIVE branch_isolation policy)
CREATE POLICY manager_inventory_insert
  ON public.inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY manager_inventory_update
  ON public.inventory
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- inventory_transactions (insert only -- append-only ledger convention)
CREATE POLICY manager_inventory_transactions_insert
  ON public.inventory_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- purchase_orders (branch-scoped via existing RESTRICTIVE branch_isolation policy)
CREATE POLICY manager_purchase_orders_insert
  ON public.purchase_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY manager_purchase_orders_update
  ON public.purchase_orders
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- purchase_order_items (scoped via existing RESTRICTIVE
-- purchase_order_items_branch_isolation policy on the parent PO's branch)
CREATE POLICY manager_purchase_order_items_insert
  ON public.purchase_order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY manager_purchase_order_items_update
  ON public.purchase_order_items
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));
