
-- Restrict INSERT on payments to admin/receptionist
DROP POLICY IF EXISTS pay_insert_auth ON public.payments;
CREATE POLICY pay_insert_admin_reception ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  );

-- Restrict INSERT on expenses to admin/receptionist
DROP POLICY IF EXISTS exp_insert_auth ON public.expenses;
CREATE POLICY exp_insert_admin_reception ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  );

-- Restrict INSERT on invoices to admin/receptionist
DROP POLICY IF EXISTS invoices_insert_auth ON public.invoices;
CREATE POLICY invoices_insert_admin_reception ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  );
