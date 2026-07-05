
-- ============================================================================
-- Phase 2: Deep RBAC hardening
-- ============================================================================

-- ---------------------------------------------------------------------------
-- F1: Revoke anon default privileges on sensitive tables
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  sensitive text[] := ARRAY[
    'payroll','salary_adjustments','staff_profiles','staff_branches','staff_targets',
    'attendance','leave_requests','performance_reviews',
    'audit_logs','user_roles','role_permissions','user_activity_logs',
    'patient_wallets','patient_wallet_transactions','doctor_commissions',
    'insurance_contracts','insurance_contract_rules','insurance_companies',
    'expenses','expense_categories','treasury','treasury_transactions','treasury_daily_closes',
    'medical_records','medical_history','prescriptions','prescription_items',
    'record_procedures','record_diagnoses','dental_chart','vital_signs',
    'patient_documents','physio_cases','physio_sessions','physio_reassessments',
    'treatment_plans','treatment_sessions','patients','appointments','invoices',
    'invoice_items','payments','purchase_orders','purchase_order_items',
    'products','inventory','inventory_transactions','stock_alerts','suppliers',
    'coupons','coupon_redemptions','notifications','reminders','queue_alerts',
    'clinic_profile','clinic_settings','notification_settings','loyalty_settings',
    'system_backups','saved_reports','report_schedules','audit_export_presets'
  ];
BEGIN
  FOREACH t IN ARRAY sensitive LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- F3: Tighten insurance_contracts SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS contracts_read_authenticated ON public.insurance_contracts;
CREATE POLICY contracts_read_scoped ON public.insurance_contracts
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'manager'::app_role)
    OR has_role(auth.uid(),'accountant'::app_role)
    OR has_role(auth.uid(),'receptionist'::app_role)
  );

DROP POLICY IF EXISTS insurance_contract_rules_read_all ON public.insurance_contract_rules;
-- rules follow parent contract; use function-based check via contract_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='insurance_contract_rules' AND policyname='contracts_rules_read_all') THEN
    DROP POLICY contracts_rules_read_all ON public.insurance_contract_rules;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- F2: Safe staff directory view (no salary/bank/national_id/DOB)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.staff_profiles_directory;
CREATE VIEW public.staff_profiles_directory
WITH (security_invoker = true) AS
SELECT
  id, employee_id, position_id, department_id, branch_id,
  hire_date, contract_type, status,
  emergency_contact_name, emergency_contact_phone,
  profile_image_url, linked_user_id,
  created_at, updated_at
FROM public.staff_profiles
WHERE deleted_at IS NULL;

GRANT SELECT ON public.staff_profiles_directory TO authenticated;

-- ---------------------------------------------------------------------------
-- F7/F8: Add WITH CHECK to HR insert policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_payroll_insert ON public.payroll;
CREATE POLICY hr_payroll_insert ON public.payroll
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'hr'::app_role) OR has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS hr_staff_insert ON public.staff_profiles;
CREATE POLICY hr_staff_insert ON public.staff_profiles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'hr'::app_role) OR has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS hr_attendance_insert ON public.attendance;
CREATE POLICY hr_attendance_insert ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'hr'::app_role) OR has_role(auth.uid(),'admin'::app_role));

-- ---------------------------------------------------------------------------
-- F5/F6: Audit triggers for privilege changes and salary changes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_audit_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit_write('user_role', NEW.id, 'role_granted',
      NULL,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role),
      NULL, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public._audit_write('user_role', OLD.id, 'role_revoked',
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role),
      NULL, NULL, auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public._audit_write('user_role', NEW.id, 'role_changed',
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role),
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role),
      NULL, auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_audit_user_roles ON public.user_roles;
CREATE TRIGGER tr_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_user_roles();

CREATE OR REPLACE FUNCTION public.tg_audit_role_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit_write('role_permission', NEW.id, 'permission_granted',
      NULL,
      jsonb_build_object('role', NEW.role, 'module', NEW.module, 'actions', NEW.actions),
      NULL, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.actions IS DISTINCT FROM OLD.actions THEN
      PERFORM public._audit_write('role_permission', NEW.id, 'permission_changed',
        jsonb_build_object('role', OLD.role, 'module', OLD.module, 'actions', OLD.actions),
        jsonb_build_object('role', NEW.role, 'module', NEW.module, 'actions', NEW.actions),
        NULL, auth.uid());
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public._audit_write('role_permission', OLD.id, 'permission_revoked',
      jsonb_build_object('role', OLD.role, 'module', OLD.module, 'actions', OLD.actions),
      NULL, NULL, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tr_audit_role_permissions ON public.role_permissions;
CREATE TRIGGER tr_audit_role_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_role_permissions();

CREATE OR REPLACE FUNCTION public.tg_audit_staff_sensitive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
       NEW.salary IS DISTINCT FROM OLD.salary
    OR NEW.bank_account IS DISTINCT FROM OLD.bank_account
    OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
    OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent
    OR NEW.national_id IS DISTINCT FROM OLD.national_id
  ) THEN
    PERFORM public._audit_write('staff_profile_sensitive', NEW.id, 'sensitive_field_change',
      jsonb_build_object(
        'salary', OLD.salary,
        'bank_account_last4', right(coalesce(OLD.bank_account,''),4),
        'bank_name', OLD.bank_name,
        'commission_percent', OLD.commission_percent,
        'national_id_last4', right(coalesce(OLD.national_id,''),4)),
      jsonb_build_object(
        'salary', NEW.salary,
        'bank_account_last4', right(coalesce(NEW.bank_account,''),4),
        'bank_name', NEW.bank_name,
        'commission_percent', NEW.commission_percent,
        'national_id_last4', right(coalesce(NEW.national_id,''),4)),
      NEW.branch_id, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_audit_staff_sensitive ON public.staff_profiles;
CREATE TRIGGER tr_audit_staff_sensitive
  AFTER UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_staff_sensitive();
