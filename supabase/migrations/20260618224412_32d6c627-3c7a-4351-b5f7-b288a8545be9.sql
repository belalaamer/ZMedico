
-- appointments: replace USING(true) SELECT
DROP POLICY IF EXISTS appts_select_auth ON public.appointments;
CREATE POLICY appts_select_scoped ON public.appointments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'doctor'::public.app_role)
    OR public.has_role(auth.uid(),'nurse'::public.app_role)
    OR public.has_role(auth.uid(),'receptionist'::public.app_role)
    OR public.has_role(auth.uid(),'hr'::public.app_role)
  );

-- patients: replace USING(true) SELECT
DROP POLICY IF EXISTS patients_select_auth ON public.patients;
CREATE POLICY patients_select_scoped ON public.patients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'doctor'::public.app_role)
    OR public.has_role(auth.uid(),'nurse'::public.app_role)
    OR public.has_role(auth.uid(),'receptionist'::public.app_role)
    OR public.has_role(auth.uid(),'hr'::public.app_role)
  );

-- patient_documents
DROP POLICY IF EXISTS doc_select ON public.patient_documents;
CREATE POLICY doc_select_scoped ON public.patient_documents
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'doctor'::public.app_role)
    OR public.has_role(auth.uid(),'nurse'::public.app_role)
    OR public.has_role(auth.uid(),'staff'::public.app_role)
    OR public.has_role(auth.uid(),'receptionist'::public.app_role)
    OR public.has_role(auth.uid(),'manager'::public.app_role)
  );

-- patient_wallets
DROP POLICY IF EXISTS wallets_select_auth ON public.patient_wallets;
CREATE POLICY wallets_select_scoped ON public.patient_wallets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'manager'::public.app_role)
    OR public.has_role(auth.uid(),'receptionist'::public.app_role)
    OR public.has_role(auth.uid(),'accountant'::public.app_role)
  );

-- patient_wallet_transactions
DROP POLICY IF EXISTS wallet_tx_select_auth ON public.patient_wallet_transactions;
CREATE POLICY wallet_tx_select_scoped ON public.patient_wallet_transactions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'manager'::public.app_role)
    OR public.has_role(auth.uid(),'receptionist'::public.app_role)
    OR public.has_role(auth.uid(),'accountant'::public.app_role)
  );

-- inventory_transactions
DROP POLICY IF EXISTS invtx_select ON public.inventory_transactions;
CREATE POLICY invtx_select_scoped ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'manager'::public.app_role)
    OR public.has_role(auth.uid(),'accountant'::public.app_role)
    OR public.has_role(auth.uid(),'staff'::public.app_role)
  );

-- purchase_orders
DROP POLICY IF EXISTS po_select ON public.purchase_orders;
CREATE POLICY po_select_scoped ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'manager'::public.app_role)
    OR public.has_role(auth.uid(),'accountant'::public.app_role)
  );

-- purchase_order_items
DROP POLICY IF EXISTS poi_select ON public.purchase_order_items;
CREATE POLICY poi_select_scoped ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'manager'::public.app_role)
    OR public.has_role(auth.uid(),'accountant'::public.app_role)
  );

-- stock_alerts
DROP POLICY IF EXISTS alerts_select ON public.stock_alerts;
CREATE POLICY alerts_select_scoped ON public.stock_alerts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'manager'::public.app_role)
    OR public.has_role(auth.uid(),'staff'::public.app_role)
  );

-- reminders: add missing INSERT policy so staff can create reminders
DROP POLICY IF EXISTS rem_insert_staff ON public.reminders;
CREATE POLICY rem_insert_staff ON public.reminders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'manager'::public.app_role)
    OR public.has_role(auth.uid(),'receptionist'::public.app_role)
    OR public.has_role(auth.uid(),'doctor'::public.app_role)
  );
