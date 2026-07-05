
-- ============================================================
-- STRICT RBAC RESET
-- ============================================================

-- 1) COUPONS: remove receptionist from write access, allow SELECT via role too.
DROP POLICY IF EXISTS "Coupons manage by privileged roles" ON public.coupons;

CREATE POLICY "coupons_manage_billing_admin"
  ON public.coupons FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'accountant'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'accountant'::app_role)
  );

CREATE POLICY "coupons_select_reception"
  ON public.coupons FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'receptionist'::app_role));

-- 2) EXPENSES: receptionist should not insert expenses.
DROP POLICY IF EXISTS "exp_insert_admin_reception" ON public.expenses;
CREATE POLICY "exp_insert_admin"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
-- keep exp_select_billing (it already allows receptionist SELECT for visibility)
-- but tighten: receptionist should NOT see expenses in strict mode.
DROP POLICY IF EXISTS "exp_select_billing" ON public.expenses;
CREATE POLICY "exp_select_billing"
  ON public.expenses FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'accountant'::app_role)
    OR (public.has_role(auth.uid(),'manager'::app_role)
        AND (branch_id IS NULL OR branch_id = public.current_user_branch_id()))
  );

-- 3) PATIENTS: doctor + nurse become read-only. Insert/Update = admin + manager + receptionist.
DROP POLICY IF EXISTS "nurse_patients_insert" ON public.patients;
DROP POLICY IF EXISTS "nurse_patients_update" ON public.patients;
DROP POLICY IF EXISTS "patients_insert_roles" ON public.patients;
DROP POLICY IF EXISTS "patients_update_roles" ON public.patients;

CREATE POLICY "patients_insert_frontdesk"
  ON public.patients FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'receptionist'::app_role)
  );

CREATE POLICY "patients_update_frontdesk"
  ON public.patients FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'receptionist'::app_role)
  );

-- 4) SEED role_permissions with the strict matrix
DELETE FROM public.role_permissions;

INSERT INTO public.role_permissions (role, module, actions) VALUES
-- admin: all actions on all modules
('admin','patients',            ARRAY['view','create','edit','delete','export']),
('admin','appointments',        ARRAY['view','create','edit','delete','export']),
('admin','medical_records',     ARRAY['view','create','edit','delete','export']),
('admin','vitals',              ARRAY['view','create','edit','delete','export']),
('admin','treatment_plans',     ARRAY['view','create','edit','delete','export']),
('admin','invoices',            ARRAY['view','create','edit','delete','export']),
('admin','treasury',            ARRAY['view','create','edit','delete','export']),
('admin','inventory',           ARRAY['view','create','edit','delete','export']),
('admin','coupons',             ARRAY['view','create','edit','delete','export']),
('admin','hr',                  ARRAY['view','create','edit','delete','export']),
('admin','settings',            ARRAY['view','create','edit','delete','export']),
('admin','reports',             ARRAY['view','export']),
('admin','reports_finance',     ARRAY['view','export']),
('admin','reports_medical',     ARRAY['view','export']),
('admin','reports_operational', ARRAY['view','export']),
('admin','reports_hr',          ARRAY['view','export']),
('admin','reports_inventory',   ARRAY['view','export']),

-- manager: oversight, no delete anywhere, no clinical write, view-only on invoices/treasury/coupons/settings/hr
('manager','patients',            ARRAY['view','create','edit','export']),
('manager','appointments',        ARRAY['view','create','edit','export']),
('manager','medical_records',     ARRAY['view']),
('manager','vitals',              ARRAY['view']),
('manager','treatment_plans',     ARRAY['view']),
('manager','invoices',            ARRAY['view','export']),
('manager','treasury',            ARRAY['view','export']),
('manager','inventory',           ARRAY['view','create','edit','export']),
('manager','coupons',             ARRAY['view','export']),
('manager','hr',                  ARRAY['view']),
('manager','settings',            ARRAY['view']),
('manager','reports',             ARRAY['view','export']),
('manager','reports_finance',     ARRAY['view','export']),
('manager','reports_medical',     ARRAY['view','export']),
('manager','reports_operational', ARRAY['view','export']),
('manager','reports_inventory',   ARRAY['view','export']),

-- doctor: clinical only
('doctor','patients',            ARRAY['view']),
('doctor','appointments',        ARRAY['view','create','edit']),
('doctor','medical_records',     ARRAY['view','create','edit']),
('doctor','vitals',              ARRAY['view','create','edit']),
('doctor','treatment_plans',     ARRAY['view','create','edit']),
('doctor','reports',             ARRAY['view']),
('doctor','reports_medical',     ARRAY['view']),
('doctor','reports_operational', ARRAY['view']),

-- nurse: assistant — vitals write, everything else view
('nurse','patients',        ARRAY['view']),
('nurse','appointments',    ARRAY['view','create','edit']),
('nurse','medical_records', ARRAY['view']),
('nurse','vitals',          ARRAY['view','create','edit']),
('nurse','treatment_plans', ARRAY['view']),
('nurse','inventory',       ARRAY['view']),

-- receptionist: front desk
('receptionist','patients',        ARRAY['view','create','edit']),
('receptionist','appointments',    ARRAY['view','create','edit']),
('receptionist','treatment_plans', ARRAY['view']),
('receptionist','invoices',        ARRAY['view','create']),
('receptionist','coupons',         ARRAY['view']),

-- accountant: finance only, no clinical
('accountant','patients',            ARRAY['view']),
('accountant','appointments',        ARRAY['view']),
('accountant','treatment_plans',     ARRAY['view']),
('accountant','invoices',            ARRAY['view','create','edit','export']),
('accountant','treasury',            ARRAY['view','create','edit','export']),
('accountant','inventory',           ARRAY['view']),
('accountant','coupons',             ARRAY['view','create','edit','export']),
('accountant','reports',             ARRAY['view','export']),
('accountant','reports_finance',     ARRAY['view','export']),
('accountant','reports_operational', ARRAY['view','export']),
('accountant','reports_inventory',   ARRAY['view','export']),

-- hr: people only
('hr','hr',          ARRAY['view','create','edit','export']),
('hr','reports',     ARRAY['view']),
('hr','reports_hr',  ARRAY['view','export']),

-- staff: schedule visibility only
('staff','appointments', ARRAY['view']);
