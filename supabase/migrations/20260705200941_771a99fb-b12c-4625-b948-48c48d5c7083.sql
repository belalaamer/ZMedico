
-- =========================================================================
-- WAVE 1: Authorization Foundation (additive only)
-- =========================================================================

-- ---------- Catalog: permissions ----------
CREATE TABLE public.authz_permissions (
  key            text PRIMARY KEY,
  group_key      text NOT NULL,
  display_name   text NOT NULL,
  description    text,
  risk_level     text NOT NULL DEFAULT 'low'
                 CHECK (risk_level IN ('low','medium','high','critical')),
  default_scope  text NOT NULL DEFAULT 'branch'
                 CHECK (default_scope IN ('own','assigned','department','branch','organization','global')),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  deprecated     boolean NOT NULL DEFAULT false,
  replaced_by    text REFERENCES public.authz_permissions(key),
  introduced_in  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.authz_permissions TO authenticated;
GRANT ALL ON public.authz_permissions TO service_role;
ALTER TABLE public.authz_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authz_permissions readable by authenticated"
  ON public.authz_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authz_permissions admin write"
  ON public.authz_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- ---------- Catalog: bundles ----------
CREATE TABLE public.authz_bundles (
  key           text PRIMARY KEY,
  display_name  text NOT NULL,
  description   text,
  version       integer NOT NULL DEFAULT 1,
  deprecated    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.authz_bundles TO authenticated;
GRANT ALL ON public.authz_bundles TO service_role;
ALTER TABLE public.authz_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authz_bundles readable by authenticated"
  ON public.authz_bundles FOR SELECT TO authenticated USING (true);
CREATE POLICY "authz_bundles admin write"
  ON public.authz_bundles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- ---------- Bundle -> Permission ----------
CREATE TABLE public.authz_bundle_permissions (
  bundle_key     text NOT NULL REFERENCES public.authz_bundles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.authz_permissions(key) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bundle_key, permission_key)
);
GRANT SELECT ON public.authz_bundle_permissions TO authenticated;
GRANT ALL ON public.authz_bundle_permissions TO service_role;
ALTER TABLE public.authz_bundle_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authz_bundle_permissions readable by authenticated"
  ON public.authz_bundle_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authz_bundle_permissions admin write"
  ON public.authz_bundle_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- ---------- Bundle inheritance (parent implies child) ----------
CREATE TABLE public.authz_bundle_implies (
  parent_bundle_key text NOT NULL REFERENCES public.authz_bundles(key) ON DELETE CASCADE,
  child_bundle_key  text NOT NULL REFERENCES public.authz_bundles(key) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_bundle_key, child_bundle_key),
  CHECK (parent_bundle_key <> child_bundle_key)
);
GRANT SELECT ON public.authz_bundle_implies TO authenticated;
GRANT ALL ON public.authz_bundle_implies TO service_role;
ALTER TABLE public.authz_bundle_implies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authz_bundle_implies readable by authenticated"
  ON public.authz_bundle_implies FOR SELECT TO authenticated USING (true);
CREATE POLICY "authz_bundle_implies admin write"
  ON public.authz_bundle_implies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- ---------- Role -> Bundle ----------
CREATE TABLE public.authz_role_bundles (
  role        public.app_role NOT NULL,
  bundle_key  text NOT NULL REFERENCES public.authz_bundles(key) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, bundle_key)
);
GRANT SELECT ON public.authz_role_bundles TO authenticated;
GRANT ALL ON public.authz_role_bundles TO service_role;
ALTER TABLE public.authz_role_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authz_role_bundles readable by authenticated"
  ON public.authz_role_bundles FOR SELECT TO authenticated USING (true);
CREATE POLICY "authz_role_bundles admin write"
  ON public.authz_role_bundles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- ---------- Touch triggers ----------
CREATE TRIGGER authz_permissions_touch
  BEFORE UPDATE ON public.authz_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER authz_bundles_touch
  BEFORE UPDATE ON public.authz_bundles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- Seed: mirror src/lib/rolePermissions.ts DEFAULT_PERMISSIONS 1:1
-- Permission key format: '<module>.<action>'
-- Bundle key format:    'bundle.role.<role>'
-- =========================================================================

-- Permissions (one row per module.action currently used by the UI)
INSERT INTO public.authz_permissions (key, group_key, display_name, description, risk_level, default_scope) VALUES
  -- patients
  ('patients.view',   'patients', 'View patients',   'Read patient list and profiles', 'medium', 'branch'),
  ('patients.create', 'patients', 'Create patients', 'Register new patients',           'medium', 'branch'),
  ('patients.edit',   'patients', 'Edit patients',   'Update patient demographics',     'medium', 'branch'),
  ('patients.delete', 'patients', 'Delete patients', 'Soft-delete patients',            'high',   'branch'),
  ('patients.export', 'patients', 'Export patients', 'Export patient data',             'high',   'branch'),
  -- appointments
  ('appointments.view',   'appointments', 'View appointments',   NULL, 'low',    'branch'),
  ('appointments.create', 'appointments', 'Create appointments', NULL, 'medium', 'branch'),
  ('appointments.edit',   'appointments', 'Edit appointments',   NULL, 'medium', 'branch'),
  ('appointments.delete', 'appointments', 'Delete appointments', NULL, 'high',   'branch'),
  ('appointments.export', 'appointments', 'Export appointments', NULL, 'medium', 'branch'),
  -- medical_records
  ('medical_records.view',   'clinical', 'View medical records',   NULL, 'high',     'branch'),
  ('medical_records.create', 'clinical', 'Create medical records', NULL, 'high',     'branch'),
  ('medical_records.edit',   'clinical', 'Edit medical records',   NULL, 'high',     'branch'),
  ('medical_records.delete', 'clinical', 'Delete medical records', NULL, 'critical', 'branch'),
  ('medical_records.export', 'clinical', 'Export medical records', NULL, 'high',     'branch'),
  -- vitals
  ('vitals.view',   'clinical', 'View vitals',   NULL, 'medium', 'branch'),
  ('vitals.create', 'clinical', 'Record vitals', NULL, 'medium', 'branch'),
  ('vitals.edit',   'clinical', 'Edit vitals',   NULL, 'medium', 'branch'),
  ('vitals.delete', 'clinical', 'Delete vitals', NULL, 'high',   'branch'),
  ('vitals.export', 'clinical', 'Export vitals', NULL, 'medium', 'branch'),
  -- treatment_plans
  ('treatment_plans.view',   'clinical', 'View treatment plans',   NULL, 'medium', 'branch'),
  ('treatment_plans.create', 'clinical', 'Create treatment plans', NULL, 'high',   'branch'),
  ('treatment_plans.edit',   'clinical', 'Edit treatment plans',   NULL, 'high',   'branch'),
  ('treatment_plans.delete', 'clinical', 'Delete treatment plans', NULL, 'high',   'branch'),
  ('treatment_plans.export', 'clinical', 'Export treatment plans', NULL, 'medium', 'branch'),
  -- invoices
  ('invoices.view',   'finance', 'View invoices',   NULL, 'medium', 'branch'),
  ('invoices.create', 'finance', 'Create invoices', NULL, 'high',   'branch'),
  ('invoices.edit',   'finance', 'Edit invoices',   NULL, 'high',   'branch'),
  ('invoices.delete', 'finance', 'Delete invoices', NULL, 'critical','branch'),
  ('invoices.export', 'finance', 'Export invoices', NULL, 'high',   'branch'),
  -- treasury
  ('treasury.view',   'finance', 'View treasury',   NULL, 'medium', 'branch'),
  ('treasury.create', 'finance', 'Record treasury movement', NULL, 'high', 'branch'),
  ('treasury.edit',   'finance', 'Edit treasury',   NULL, 'high',   'branch'),
  ('treasury.delete', 'finance', 'Delete treasury', NULL, 'critical','branch'),
  ('treasury.export', 'finance', 'Export treasury', NULL, 'high',   'branch'),
  -- inventory
  ('inventory.view',   'inventory', 'View inventory',   NULL, 'low',    'branch'),
  ('inventory.create', 'inventory', 'Create inventory', NULL, 'medium', 'branch'),
  ('inventory.edit',   'inventory', 'Edit inventory',   NULL, 'medium', 'branch'),
  ('inventory.delete', 'inventory', 'Delete inventory', NULL, 'high',   'branch'),
  ('inventory.export', 'inventory', 'Export inventory', NULL, 'medium', 'branch'),
  -- reports (parent + facets)
  ('reports.view',                 'reports', 'View reports dashboard', NULL, 'medium', 'branch'),
  ('reports.export',               'reports', 'Export reports',         NULL, 'high',   'branch'),
  ('reports_finance.view',         'reports', 'View finance reports',   NULL, 'high',   'branch'),
  ('reports_finance.export',       'reports', 'Export finance reports', NULL, 'high',   'branch'),
  ('reports_medical.view',         'reports', 'View medical reports',   NULL, 'high',   'branch'),
  ('reports_medical.export',       'reports', 'Export medical reports', NULL, 'high',   'branch'),
  ('reports_operational.view',     'reports', 'View operational reports', NULL, 'medium','branch'),
  ('reports_operational.export',   'reports', 'Export operational reports', NULL, 'medium','branch'),
  ('reports_hr.view',              'reports', 'View HR reports',        NULL, 'high',   'branch'),
  ('reports_hr.export',            'reports', 'Export HR reports',      NULL, 'high',   'branch'),
  ('reports_inventory.view',       'reports', 'View inventory reports', NULL, 'medium', 'branch'),
  ('reports_inventory.export',     'reports', 'Export inventory reports', NULL, 'medium','branch'),
  -- hr
  ('hr.view',   'hr', 'View HR',   NULL, 'high',     'branch'),
  ('hr.create', 'hr', 'Create HR records', NULL, 'high', 'branch'),
  ('hr.edit',   'hr', 'Edit HR records',   NULL, 'high', 'branch'),
  ('hr.delete', 'hr', 'Delete HR records', NULL, 'critical','branch'),
  ('hr.export', 'hr', 'Export HR records', NULL, 'high', 'branch'),
  -- settings
  ('settings.view',   'settings', 'View settings',   NULL, 'medium', 'organization'),
  ('settings.create', 'settings', 'Create settings', NULL, 'high',   'organization'),
  ('settings.edit',   'settings', 'Edit settings',   NULL, 'high',   'organization'),
  ('settings.delete', 'settings', 'Delete settings', NULL, 'critical','organization'),
  ('settings.export', 'settings', 'Export settings', NULL, 'medium', 'organization'),
  -- coupons
  ('coupons.view',   'finance', 'View coupons',   NULL, 'low',    'branch'),
  ('coupons.create', 'finance', 'Create coupons', NULL, 'medium', 'branch'),
  ('coupons.edit',   'finance', 'Edit coupons',   NULL, 'medium', 'branch'),
  ('coupons.delete', 'finance', 'Delete coupons', NULL, 'high',   'branch'),
  ('coupons.export', 'finance', 'Export coupons', NULL, 'medium', 'branch')
ON CONFLICT (key) DO NOTHING;

-- Bundles (one per legacy role)
INSERT INTO public.authz_bundles (key, display_name, description) VALUES
  ('bundle.role.admin',        'Legacy: Admin',        'Compatibility bundle mirroring the legacy admin role'),
  ('bundle.role.manager',      'Legacy: Manager',      'Compatibility bundle mirroring the legacy manager role'),
  ('bundle.role.doctor',       'Legacy: Doctor',       'Compatibility bundle mirroring the legacy doctor role'),
  ('bundle.role.nurse',        'Legacy: Nurse',        'Compatibility bundle mirroring the legacy nurse role'),
  ('bundle.role.receptionist', 'Legacy: Receptionist', 'Compatibility bundle mirroring the legacy receptionist role'),
  ('bundle.role.accountant',   'Legacy: Accountant',   'Compatibility bundle mirroring the legacy accountant role'),
  ('bundle.role.hr',           'Legacy: HR',           'Compatibility bundle mirroring the legacy hr role'),
  ('bundle.role.staff',        'Legacy: Staff',        'Compatibility bundle mirroring the legacy staff role')
ON CONFLICT (key) DO NOTHING;

-- Role -> bundle assignments (identity map for legacy roles)
INSERT INTO public.authz_role_bundles (role, bundle_key) VALUES
  ('admin'::public.app_role,        'bundle.role.admin'),
  ('manager'::public.app_role,      'bundle.role.manager'),
  ('doctor'::public.app_role,       'bundle.role.doctor'),
  ('receptionist'::public.app_role, 'bundle.role.receptionist'),
  ('accountant'::public.app_role,   'bundle.role.accountant'),
  ('hr'::public.app_role,           'bundle.role.hr'),
  ('staff'::public.app_role,        'bundle.role.staff')
ON CONFLICT DO NOTHING;

-- Admin bundle: every non-deprecated permission
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT 'bundle.role.admin', key FROM public.authz_permissions WHERE NOT deprecated
ON CONFLICT DO NOTHING;

-- Helper to load a role bundle from a VALUES list mirroring DEFAULT_PERMISSIONS
-- manager
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT 'bundle.role.manager', k FROM (VALUES
  ('patients.view'),('patients.create'),('patients.edit'),('patients.export'),
  ('appointments.view'),('appointments.create'),('appointments.edit'),('appointments.export'),
  ('medical_records.view'),
  ('vitals.view'),
  ('treatment_plans.view'),
  ('invoices.view'),('invoices.export'),
  ('treasury.view'),('treasury.export'),
  ('inventory.view'),('inventory.create'),('inventory.edit'),('inventory.export'),
  ('reports.view'),('reports.export'),
  ('reports_finance.view'),('reports_finance.export'),
  ('reports_medical.view'),('reports_medical.export'),
  ('reports_operational.view'),('reports_operational.export'),
  ('reports_inventory.view'),('reports_inventory.export'),
  ('hr.view'),
  ('settings.view'),
  ('coupons.view'),('coupons.export')
) AS t(k) ON CONFLICT DO NOTHING;

-- doctor
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT 'bundle.role.doctor', k FROM (VALUES
  ('patients.view'),
  ('appointments.view'),('appointments.create'),('appointments.edit'),
  ('medical_records.view'),('medical_records.create'),('medical_records.edit'),
  ('vitals.view'),('vitals.create'),('vitals.edit'),
  ('treatment_plans.view'),('treatment_plans.create'),('treatment_plans.edit'),
  ('reports.view'),
  ('reports_medical.view'),
  ('reports_operational.view')
) AS t(k) ON CONFLICT DO NOTHING;

-- nurse
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT 'bundle.role.nurse', k FROM (VALUES
  ('patients.view'),
  ('appointments.view'),('appointments.create'),('appointments.edit'),
  ('medical_records.view'),
  ('vitals.view'),('vitals.create'),('vitals.edit'),
  ('treatment_plans.view'),
  ('inventory.view')
) AS t(k) ON CONFLICT DO NOTHING;

-- receptionist
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT 'bundle.role.receptionist', k FROM (VALUES
  ('patients.view'),('patients.create'),('patients.edit'),
  ('appointments.view'),('appointments.create'),('appointments.edit'),
  ('treatment_plans.view'),
  ('invoices.view'),('invoices.create'),
  ('coupons.view')
) AS t(k) ON CONFLICT DO NOTHING;

-- accountant
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT 'bundle.role.accountant', k FROM (VALUES
  ('patients.view'),
  ('appointments.view'),
  ('treatment_plans.view'),
  ('invoices.view'),('invoices.create'),('invoices.edit'),('invoices.export'),
  ('treasury.view'),('treasury.create'),('treasury.edit'),('treasury.export'),
  ('inventory.view'),
  ('reports.view'),('reports.export'),
  ('reports_finance.view'),('reports_finance.export'),
  ('reports_inventory.view'),('reports_inventory.export'),
  ('reports_operational.view'),('reports_operational.export'),
  ('coupons.view'),('coupons.create'),('coupons.edit'),('coupons.export')
) AS t(k) ON CONFLICT DO NOTHING;

-- hr
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT 'bundle.role.hr', k FROM (VALUES
  ('reports.view'),
  ('reports_hr.view'),('reports_hr.export'),
  ('hr.view'),('hr.create'),('hr.edit'),('hr.export')
) AS t(k) ON CONFLICT DO NOTHING;

-- staff
INSERT INTO public.authz_bundle_permissions (bundle_key, permission_key)
SELECT 'bundle.role.staff', k FROM (VALUES
  ('appointments.view')
) AS t(k) ON CONFLICT DO NOTHING;

-- =========================================================================
-- Effective permissions view: user -> permission_key via role -> bundle
-- (recursive across bundle_implies so nested bundles resolve)
-- =========================================================================
CREATE OR REPLACE VIEW public.v_authz_effective_permissions
WITH (security_invoker = true) AS
WITH RECURSIVE user_bundles AS (
  SELECT ur.user_id, rb.bundle_key
    FROM public.user_roles ur
    JOIN public.authz_role_bundles rb ON rb.role = ur.role
  UNION
  SELECT ub.user_id, bi.child_bundle_key
    FROM user_bundles ub
    JOIN public.authz_bundle_implies bi ON bi.parent_bundle_key = ub.bundle_key
)
SELECT DISTINCT ub.user_id, bp.permission_key
  FROM user_bundles ub
  JOIN public.authz_bundle_permissions bp ON bp.bundle_key = ub.bundle_key
  JOIN public.authz_permissions p ON p.key = bp.permission_key AND NOT p.deprecated;

GRANT SELECT ON public.v_authz_effective_permissions TO authenticated, service_role;

-- =========================================================================
-- Canonical authorization function (not yet used by app code)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND _permission_key IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::public.app_role)
      OR EXISTS (
        WITH RECURSIVE user_bundles AS (
          SELECT rb.bundle_key
            FROM public.user_roles ur
            JOIN public.authz_role_bundles rb ON rb.role = ur.role
           WHERE ur.user_id = _user_id
          UNION
          SELECT bi.child_bundle_key
            FROM user_bundles ub
            JOIN public.authz_bundle_implies bi ON bi.parent_bundle_key = ub.bundle_key
        )
        SELECT 1
          FROM user_bundles ub
          JOIN public.authz_bundle_permissions bp ON bp.bundle_key = ub.bundle_key
          JOIN public.authz_permissions p
            ON p.key = bp.permission_key AND NOT p.deprecated
         WHERE bp.permission_key = _permission_key
      )
    )
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
