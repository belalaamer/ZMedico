-- Consolidate equivalent admin/manager write policies while preserving
-- the existing RESTRICTIVE branch-isolation policies.
DROP POLICY IF EXISTS inv_insert_admin ON public.inventory;
DROP POLICY IF EXISTS manager_inventory_insert ON public.inventory;
CREATE POLICY inventory_insert_admin_manager
ON public.inventory FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
);

DROP POLICY IF EXISTS inv_update_admin ON public.inventory;
DROP POLICY IF EXISTS manager_inventory_update ON public.inventory;
CREATE POLICY inventory_update_admin_manager
ON public.inventory FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
);

DROP POLICY IF EXISTS invtx_insert_admin ON public.inventory_transactions;
DROP POLICY IF EXISTS manager_inventory_transactions_insert ON public.inventory_transactions;
CREATE POLICY inventory_transactions_insert_admin_manager
ON public.inventory_transactions FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
);

DROP POLICY IF EXISTS po_insert_admin ON public.purchase_orders;
DROP POLICY IF EXISTS manager_purchase_orders_insert ON public.purchase_orders;
CREATE POLICY purchase_orders_insert_admin_manager
ON public.purchase_orders FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
);

DROP POLICY IF EXISTS po_update_admin ON public.purchase_orders;
DROP POLICY IF EXISTS manager_purchase_orders_update ON public.purchase_orders;
CREATE POLICY purchase_orders_update_admin_manager
ON public.purchase_orders FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
);

DROP POLICY IF EXISTS poi_insert_admin ON public.purchase_order_items;
DROP POLICY IF EXISTS manager_purchase_order_items_insert ON public.purchase_order_items;
CREATE POLICY purchase_order_items_insert_admin_manager
ON public.purchase_order_items FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
);

DROP POLICY IF EXISTS poi_update_admin ON public.purchase_order_items;
DROP POLICY IF EXISTS manager_purchase_order_items_update ON public.purchase_order_items;
CREATE POLICY purchase_order_items_update_admin_manager
ON public.purchase_order_items FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::public.app_role)
);
