-- Invoices
DROP POLICY IF EXISTS acct_invoices_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_insert_admin_reception ON public.invoices;
CREATE POLICY invoices_insert_billing
ON public.invoices FOR INSERT TO public
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'accountant'::public.app_role)
  )
  AND public.user_has_branch_access(branch_id)
);

DROP POLICY IF EXISTS acct_invoices_update ON public.invoices;
DROP POLICY IF EXISTS invoices_update_admin ON public.invoices;
CREATE POLICY invoices_update_billing
ON public.invoices FOR UPDATE TO public
USING (
  (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'accountant'::public.app_role)
  )
  AND public.user_has_branch_access(branch_id)
);

-- Payments
DROP POLICY IF EXISTS acct_payments_insert ON public.payments;
DROP POLICY IF EXISTS pay_insert_admin_reception ON public.payments;
CREATE POLICY payments_insert_billing
ON public.payments FOR INSERT TO public
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'accountant'::public.app_role)
  )
  AND public.user_has_branch_access(branch_id)
);

DROP POLICY IF EXISTS acct_payments_update ON public.payments;
DROP POLICY IF EXISTS pay_update_own_or_admin ON public.payments;
CREATE POLICY payments_update_billing
ON public.payments FOR UPDATE TO public
USING (
  (
    public.has_role((SELECT auth.uid()), 'accountant'::public.app_role)
    OR received_by = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
  AND public.user_has_branch_access(branch_id)
)
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'accountant'::public.app_role)
    OR received_by = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
  AND public.user_has_branch_access(branch_id)
);
