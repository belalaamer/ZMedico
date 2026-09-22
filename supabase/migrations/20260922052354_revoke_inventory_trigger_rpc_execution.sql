REVOKE ALL ON FUNCTION public.enforce_inventory_catalog_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_inventory_branch_product_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_purchase_order_catalog_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_purchase_order_item_tenant() FROM PUBLIC, anon, authenticated;
