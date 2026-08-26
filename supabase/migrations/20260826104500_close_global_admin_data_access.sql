-- Close cross-tenant administrative access discovered by the full RLS audit.
-- This migration changes policies only; it does not mutate or delete rows.

-- Platform billing and usage are System Owner / tenant-owner scoped.
DROP POLICY IF EXISTS saas_inv_admin_write ON public.saas_invoices;
CREATE POLICY saas_inv_system_owner_write
  ON public.saas_invoices FOR ALL TO public
  USING (has_role(auth.uid(), 'system_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'system_owner'::app_role));
DROP POLICY IF EXISTS saas_inv_owner_read ON public.saas_invoices;
CREATE POLICY saas_inv_owner_read
  ON public.saas_invoices FOR SELECT TO public
  USING (is_tenant_owner(tenant_id) OR has_role(auth.uid(), 'system_owner'::app_role));

DROP POLICY IF EXISTS saas_pay_admin_write ON public.saas_payments;
CREATE POLICY saas_pay_system_owner_write
  ON public.saas_payments FOR ALL TO public
  USING (has_role(auth.uid(), 'system_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'system_owner'::app_role));
DROP POLICY IF EXISTS saas_pay_owner_read ON public.saas_payments;
CREATE POLICY saas_pay_owner_read
  ON public.saas_payments FOR SELECT TO public
  USING (is_tenant_owner(tenant_id) OR has_role(auth.uid(), 'system_owner'::app_role));

DROP POLICY IF EXISTS tenant_addons_admin_write ON public.tenant_addons;
CREATE POLICY tenant_addons_system_owner_write
  ON public.tenant_addons FOR ALL TO public
  USING (has_role(auth.uid(), 'system_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'system_owner'::app_role));
DROP POLICY IF EXISTS tenant_addons_owner_read ON public.tenant_addons;
CREATE POLICY tenant_addons_owner_read
  ON public.tenant_addons FOR SELECT TO public
  USING (is_tenant_owner(tenant_id) OR has_role(auth.uid(), 'system_owner'::app_role));

DROP POLICY IF EXISTS usage_admin_write ON public.tenant_usage;
CREATE POLICY usage_system_owner_write
  ON public.tenant_usage FOR ALL TO public
  USING (has_role(auth.uid(), 'system_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'system_owner'::app_role));
DROP POLICY IF EXISTS usage_owner_read ON public.tenant_usage;
CREATE POLICY usage_owner_read
  ON public.tenant_usage FOR SELECT TO public
  USING (is_tenant_owner(tenant_id) OR has_role(auth.uid(), 'system_owner'::app_role));

-- User-owned reports and schedules must not be visible to every settings user.
DROP POLICY IF EXISTS rs_admin ON public.report_schedules;
DROP POLICY IF EXISTS rs_select ON public.report_schedules;
DROP POLICY IF EXISTS rls_hardening_report_schedules_owner ON public.report_schedules;
CREATE POLICY rls_hardening_report_schedules_owner
  ON public.report_schedules AS RESTRICTIVE FOR ALL TO public
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'system_owner'::app_role))
  WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'system_owner'::app_role));

DROP POLICY IF EXISTS rls_hardening_saved_reports_owner ON public.saved_reports;
CREATE POLICY rls_hardening_saved_reports_owner
  ON public.saved_reports AS RESTRICTIVE FOR ALL TO public
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'system_owner'::app_role))
  WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'system_owner'::app_role));

-- Notification center entries are private to the recipient.
DROP POLICY IF EXISTS rls_hardening_notifications_recipient ON public.notifications;
CREATE POLICY rls_hardening_notifications_recipient
  ON public.notifications AS RESTRICTIVE FOR ALL TO public
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'system_owner'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'system_owner'::app_role));

-- Salary adjustments inherit the payroll branch.
DROP POLICY IF EXISTS rls_hardening_salary_adjustments_scope ON public.salary_adjustments;
CREATE POLICY rls_hardening_salary_adjustments_scope
  ON public.salary_adjustments AS RESTRICTIVE FOR ALL TO public
  USING (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.payroll p
      WHERE p.id = salary_adjustments.payroll_id
        AND p.branch_id IS NOT NULL
        AND user_has_branch_access(p.branch_id)
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.payroll p
      WHERE p.id = salary_adjustments.payroll_id
        AND p.branch_id IS NOT NULL
        AND user_has_branch_access(p.branch_id)
    )
  );

-- Backups are platform infrastructure and must never be created by clinic roles.
DROP POLICY IF EXISTS sb_insert_admin ON public.system_backups;
CREATE POLICY sb_insert_system_owner
  ON public.system_backups FOR INSERT TO public
  WITH CHECK (has_role(auth.uid(), 'system_owner'::app_role));

-- These are intentionally global reference catalogs. If insurance contracts
-- become tenant-specific, add tenant_id/branch_id before relaxing their policy.
COMMENT ON TABLE public.insurance_contracts IS
  'Global reference catalog by current schema; tenant-specific isolation requires tenant_id or branch_id before adding clinic-specific records.';
COMMENT ON TABLE public.insurance_contract_rules IS
  'Global reference catalog by current schema; tenant-specific isolation requires tenant_id or branch_id before adding clinic-specific records.';
