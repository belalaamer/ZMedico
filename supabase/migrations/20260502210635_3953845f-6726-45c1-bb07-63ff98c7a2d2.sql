-- Helper: branch id for the current user (security definer, no RLS recursion)
CREATE OR REPLACE FUNCTION public.current_user_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.staff_profiles WHERE id = auth.uid()
$$;

-- =========================================================
-- MANAGER ROLE
-- =========================================================
CREATE POLICY "manager_patients_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );
CREATE POLICY "manager_patients_update" ON public.patients
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

CREATE POLICY "manager_appts_insert" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );
CREATE POLICY "manager_appts_update" ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

CREATE POLICY "manager_invoices_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );
CREATE POLICY "manager_invoices_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );
CREATE POLICY "manager_invoice_items_insert" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'manager'::public.app_role));
CREATE POLICY "manager_invoice_items_update" ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'manager'::public.app_role));

CREATE POLICY "manager_payments_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );
CREATE POLICY "manager_payments_update" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

CREATE POLICY "manager_expenses_insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );
CREATE POLICY "manager_expenses_update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'manager'::public.app_role)
    AND (branch_id IS NULL OR branch_id = public.current_user_branch_id())
  );

-- =========================================================
-- NURSE ROLE
-- =========================================================
CREATE POLICY "nurse_patients_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'nurse'::public.app_role));
CREATE POLICY "nurse_patients_update" ON public.patients
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'nurse'::public.app_role));

CREATE POLICY "nurse_appts_insert" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'nurse'::public.app_role));
CREATE POLICY "nurse_appts_update" ON public.appointments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'nurse'::public.app_role));

CREATE POLICY "nurse_vitals_insert" ON public.vital_signs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'nurse'::public.app_role));
CREATE POLICY "nurse_vitals_update" ON public.vital_signs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'nurse'::public.app_role));

CREATE POLICY "nurse_history_insert" ON public.medical_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'nurse'::public.app_role));
CREATE POLICY "nurse_history_update" ON public.medical_history
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'nurse'::public.app_role));

-- =========================================================
-- ACCOUNTANT ROLE
-- =========================================================
CREATE POLICY "acct_invoices_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_invoices_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_invoice_items_insert" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_invoice_items_update" ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE POLICY "acct_payments_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_payments_update" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE POLICY "acct_expenses_insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_expenses_update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_expense_categories_all" ON public.expense_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE POLICY "acct_treasury_select" ON public.treasury
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_treasury_insert" ON public.treasury
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_treasury_update" ON public.treasury
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE POLICY "acct_treasury_tx_select" ON public.treasury_transactions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_treasury_tx_insert" ON public.treasury_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE POLICY "acct_treasury_tx_update" ON public.treasury_transactions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'accountant'::public.app_role));

-- =========================================================
-- HR ROLE
-- =========================================================
CREATE POLICY "hr_staff_select" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_staff_insert" ON public.staff_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_staff_update" ON public.staff_profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role));

CREATE POLICY "hr_departments_all" ON public.departments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_positions_all" ON public.staff_positions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));

CREATE POLICY "hr_attendance_select" ON public.attendance
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_attendance_insert" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_attendance_update" ON public.attendance
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role));

CREATE POLICY "hr_leave_select" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_leave_insert" ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));

CREATE POLICY "hr_reviews_select" ON public.performance_reviews
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_reviews_insert" ON public.performance_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_reviews_update" ON public.performance_reviews
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));

CREATE POLICY "hr_payroll_select" ON public.payroll
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_payroll_insert" ON public.payroll
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));
CREATE POLICY "hr_payroll_update" ON public.payroll
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'hr'::public.app_role));

CREATE POLICY "hr_profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'hr'::public.app_role));