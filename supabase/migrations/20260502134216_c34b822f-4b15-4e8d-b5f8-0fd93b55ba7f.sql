DROP POLICY IF EXISTS tx_select_auth ON public.treasury_transactions;
CREATE POLICY tx_select_admin ON public.treasury_transactions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));