DROP POLICY IF EXISTS acct_invoice_items_insert ON public.invoice_items;
DROP POLICY IF EXISTS ii_insert_billing ON public.invoice_items;
CREATE POLICY invoice_items_insert_billing
ON public.invoice_items
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'accountant'::public.app_role)
);

DROP POLICY IF EXISTS acct_invoice_items_update ON public.invoice_items;
DROP POLICY IF EXISTS ii_update_billing ON public.invoice_items;
CREATE POLICY invoice_items_update_billing
ON public.invoice_items
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'accountant'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'accountant'::public.app_role)
);
