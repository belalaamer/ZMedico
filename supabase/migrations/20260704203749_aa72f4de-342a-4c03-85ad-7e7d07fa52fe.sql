
CREATE POLICY "purchase_orders_branch_isolation"
  ON public.purchase_orders
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.user_has_branch_access(branch_id))
  WITH CHECK (public.user_has_branch_access(branch_id));

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_purchase_order(_po uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _po IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.purchase_orders WHERE id = _po));
$$;

CREATE POLICY "purchase_order_items_branch_isolation"
  ON public.purchase_order_items
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.user_has_branch_access_via_purchase_order(purchase_order_id))
  WITH CHECK (public.user_has_branch_access_via_purchase_order(purchase_order_id));
