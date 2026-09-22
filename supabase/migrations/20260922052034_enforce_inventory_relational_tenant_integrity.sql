WITH supplier_tenants AS (
  SELECT po.supplier_id, min(b.tenant_id::text)::uuid AS tenant_id
  FROM public.purchase_orders po
  JOIN public.branches b ON b.id = po.branch_id
  WHERE po.deleted_at IS NULL
    AND b.tenant_id IS NOT NULL
  GROUP BY po.supplier_id
  HAVING count(DISTINCT b.tenant_id) = 1
)
UPDATE public.suppliers s
SET tenant_id = st.tenant_id
FROM supplier_tenants st
WHERE s.id = st.supplier_id
  AND s.tenant_id IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_inventory_branch_product_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_branch_tenant uuid;
  v_product_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_branch_tenant
  FROM public.branches
  WHERE id = NEW.branch_id;

  SELECT tenant_id INTO v_product_tenant
  FROM public.products
  WHERE id = NEW.product_id;

  IF v_branch_tenant IS NULL OR v_product_tenant IS NULL
     OR v_branch_tenant IS DISTINCT FROM v_product_tenant THEN
    RAISE EXCEPTION 'inventory product and branch belong to different tenants'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_inventory_tenant_guard ON public.inventory;
CREATE TRIGGER trg_inventory_tenant_guard
BEFORE INSERT OR UPDATE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_branch_product_tenant();

DROP TRIGGER IF EXISTS trg_inventory_transactions_tenant_guard ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_tenant_guard
BEFORE INSERT OR UPDATE ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_branch_product_tenant();

CREATE OR REPLACE FUNCTION public.enforce_purchase_order_catalog_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_branch_tenant uuid;
  v_supplier_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_branch_tenant
  FROM public.branches
  WHERE id = NEW.branch_id;

  SELECT tenant_id INTO v_supplier_tenant
  FROM public.suppliers
  WHERE id = NEW.supplier_id;

  IF v_branch_tenant IS NULL OR v_supplier_tenant IS NULL
     OR v_branch_tenant IS DISTINCT FROM v_supplier_tenant THEN
    RAISE EXCEPTION 'purchase order supplier and branch belong to different tenants'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_purchase_orders_tenant_guard ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_tenant_guard
BEFORE INSERT OR UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_order_catalog_tenant();

CREATE OR REPLACE FUNCTION public.enforce_purchase_order_item_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_tenant uuid;
  v_product_tenant uuid;
BEGIN
  SELECT b.tenant_id INTO v_order_tenant
  FROM public.purchase_orders po
  JOIN public.branches b ON b.id = po.branch_id
  WHERE po.id = NEW.purchase_order_id;

  SELECT tenant_id INTO v_product_tenant
  FROM public.products
  WHERE id = NEW.product_id;

  IF v_order_tenant IS NULL OR v_product_tenant IS NULL
     OR v_order_tenant IS DISTINCT FROM v_product_tenant THEN
    RAISE EXCEPTION 'purchase order item product belongs to a different tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_purchase_order_items_tenant_guard ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_tenant_guard
BEFORE INSERT OR UPDATE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_purchase_order_item_tenant();
