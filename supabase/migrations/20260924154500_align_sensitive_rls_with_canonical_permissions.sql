-- Align sensitive RLS policies with the canonical authorization model.
-- Reviewed against Production on 2026-09-24. This migration intentionally
-- changes authorization only; it does not mutate application data.

-- ---------------------------------------------------------------------------
-- 1) Tenant clinical catalogs: readable by tenant members, writable only by
--    the canonical catalog-management permission. System Owner may maintain
--    global seed rows (tenant_id IS NULL).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS medical_specialties_insert_scoped ON public.medical_specialties;
DROP POLICY IF EXISTS medical_specialties_update_scoped ON public.medical_specialties;
DROP POLICY IF EXISTS medical_specialties_delete_scoped ON public.medical_specialties;

CREATE POLICY medical_specialties_insert_scoped
ON public.medical_specialties FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

CREATE POLICY medical_specialties_update_scoped
ON public.medical_specialties FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

CREATE POLICY medical_specialties_delete_scoped
ON public.medical_specialties FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

DROP POLICY IF EXISTS medications_insert_scoped ON public.medications;
DROP POLICY IF EXISTS medications_update_scoped ON public.medications;
DROP POLICY IF EXISTS medications_delete_scoped ON public.medications;

CREATE POLICY medications_insert_scoped
ON public.medications FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

CREATE POLICY medications_update_scoped
ON public.medications FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

CREATE POLICY medications_delete_scoped
ON public.medications FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

DROP POLICY IF EXISTS diagnoses_insert_scoped ON public.diagnoses;
DROP POLICY IF EXISTS diagnoses_update_scoped ON public.diagnoses;
DROP POLICY IF EXISTS diagnoses_delete_scoped ON public.diagnoses;

CREATE POLICY diagnoses_insert_scoped
ON public.diagnoses FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

CREATE POLICY diagnoses_update_scoped
ON public.diagnoses FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

CREATE POLICY diagnoses_delete_scoped
ON public.diagnoses FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

DROP POLICY IF EXISTS proc_admin_tenant ON public.procedures;
CREATE POLICY proc_admin_tenant
ON public.procedures FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    tenant_id IS NOT NULL
    AND public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.catalog.update')
  )
);

-- ---------------------------------------------------------------------------
-- 2) Medical child tables: remove stale manager access and make the action
--    policies follow medical_records permissions. Branch isolation policies
--    already remain in force as RESTRICTIVE policies where present.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS hist_select_clinical ON public.medical_history;
DROP POLICY IF EXISTS hist_insert_clinical ON public.medical_history;
DROP POLICY IF EXISTS nurse_history_insert ON public.medical_history;
DROP POLICY IF EXISTS hist_update_clinical ON public.medical_history;
DROP POLICY IF EXISTS nurse_history_update ON public.medical_history;
DROP POLICY IF EXISTS hist_delete ON public.medical_history;

CREATE POLICY hist_select_clinical ON public.medical_history
FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.view'));

CREATE POLICY hist_insert_clinical ON public.medical_history
FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.create'));

CREATE POLICY hist_update_clinical ON public.medical_history
FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));

CREATE POLICY hist_delete ON public.medical_history
FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.delete'));

DROP POLICY IF EXISTS dent_select_clinical ON public.dental_chart;
DROP POLICY IF EXISTS dent_insert_clinical ON public.dental_chart;
DROP POLICY IF EXISTS dent_update_clinical ON public.dental_chart;
DROP POLICY IF EXISTS dent_delete ON public.dental_chart;

CREATE POLICY dent_select_clinical ON public.dental_chart
FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.view'));

CREATE POLICY dent_insert_clinical ON public.dental_chart
FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.create'));

CREATE POLICY dent_update_clinical ON public.dental_chart
FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));

CREATE POLICY dent_delete ON public.dental_chart
FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.delete'));

DROP POLICY IF EXISTS rx_select_clinical ON public.prescriptions;
DROP POLICY IF EXISTS rx_insert_clinical ON public.prescriptions;
DROP POLICY IF EXISTS rx_update_clinical ON public.prescriptions;
DROP POLICY IF EXISTS rx_delete ON public.prescriptions;

CREATE POLICY rx_select_clinical ON public.prescriptions
FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.view'));

CREATE POLICY rx_insert_clinical ON public.prescriptions
FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.create'));

CREATE POLICY rx_update_clinical ON public.prescriptions
FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));

CREATE POLICY rx_delete ON public.prescriptions
FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.delete'));

DROP POLICY IF EXISTS rxi_select_clinical ON public.prescription_items;
DROP POLICY IF EXISTS rxi_write ON public.prescription_items;
DROP POLICY IF EXISTS rxi_update ON public.prescription_items;
DROP POLICY IF EXISTS rxi_delete ON public.prescription_items;

CREATE POLICY rxi_select_clinical ON public.prescription_items
FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.view'));

CREATE POLICY rxi_write ON public.prescription_items
FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));

CREATE POLICY rxi_update ON public.prescription_items
FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));

-- Removing an item from a prescription is an edit to the prescription, not a
-- hard delete of the parent medical record.
CREATE POLICY rxi_delete ON public.prescription_items
FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));

DROP POLICY IF EXISTS rdx_select_clinical ON public.record_diagnoses;
DROP POLICY IF EXISTS rdx_write ON public.record_diagnoses;
DROP POLICY IF EXISTS rdx_update ON public.record_diagnoses;
DROP POLICY IF EXISTS rdx_delete ON public.record_diagnoses;

CREATE POLICY rdx_select_clinical ON public.record_diagnoses
FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.view'));
CREATE POLICY rdx_write ON public.record_diagnoses
FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));
CREATE POLICY rdx_update ON public.record_diagnoses
FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));
CREATE POLICY rdx_delete ON public.record_diagnoses
FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));

DROP POLICY IF EXISTS rproc_select_clinical ON public.record_procedures;
DROP POLICY IF EXISTS rproc_write ON public.record_procedures;
DROP POLICY IF EXISTS rproc_update ON public.record_procedures;
DROP POLICY IF EXISTS rproc_delete ON public.record_procedures;

CREATE POLICY rproc_select_clinical ON public.record_procedures
FOR SELECT TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.view'));
CREATE POLICY rproc_write ON public.record_procedures
FOR INSERT TO authenticated
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));
CREATE POLICY rproc_update ON public.record_procedures
FOR UPDATE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'))
WITH CHECK (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));
CREATE POLICY rproc_delete ON public.record_procedures
FOR DELETE TO authenticated
USING (public.has_permission((SELECT auth.uid()), 'medical_records.edit'));

DROP POLICY IF EXISTS physio_sessions_select ON public.physio_sessions;
CREATE POLICY physio_sessions_select ON public.physio_sessions
FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'medical_records.view')
  AND public.user_has_branch_access_via_physio_case(case_id)
);

DROP POLICY IF EXISTS physio_reassessments_select ON public.physio_reassessments;
CREATE POLICY physio_reassessments_select ON public.physio_reassessments
FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'medical_records.view')
  AND public.user_has_branch_access_via_physio_case(case_id)
);

-- ---------------------------------------------------------------------------
-- 3) Treatment plan children: keep doctor-own write restrictions, but remove
--    legacy manager/reception/accountant/nurse mutation or read paths that no
--    longer exist in canonical treatment_plans permissions.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "tp select" ON public.treatment_plans;
DROP POLICY IF EXISTS "tp insert" ON public.treatment_plans;
DROP POLICY IF EXISTS "tp update" ON public.treatment_plans;
DROP POLICY IF EXISTS "tp delete" ON public.treatment_plans;

CREATE POLICY "tp select" ON public.treatment_plans
FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.view')
  AND public.user_has_branch_access(branch_id)
);

CREATE POLICY "tp insert" ON public.treatment_plans
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.create')
  AND public.user_has_branch_access(branch_id)
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR doctor_id IS NULL
    OR doctor_id = (SELECT auth.uid())
  )
);

CREATE POLICY "tp update" ON public.treatment_plans
FOR UPDATE TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  AND public.user_has_branch_access(branch_id)
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR doctor_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  AND public.user_has_branch_access(branch_id)
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR doctor_id IS NULL
    OR doctor_id = (SELECT auth.uid())
  )
);

CREATE POLICY "tp delete" ON public.treatment_plans
FOR DELETE TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.delete')
  AND public.user_has_branch_access(branch_id)
);

DROP POLICY IF EXISTS "ts select" ON public.treatment_sessions;
DROP POLICY IF EXISTS "ts insert" ON public.treatment_sessions;
DROP POLICY IF EXISTS "ts update" ON public.treatment_sessions;
DROP POLICY IF EXISTS "ts delete" ON public.treatment_sessions;

CREATE POLICY "ts select" ON public.treatment_sessions
FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.view')
  AND public.user_has_branch_access_via_treatment_plan(treatment_plan_id)
);

CREATE POLICY "ts insert" ON public.treatment_sessions
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  AND public.user_has_branch_access_via_treatment_plan(treatment_plan_id)
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.treatment_plans tp
      WHERE tp.id = treatment_sessions.treatment_plan_id
        AND tp.doctor_id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "ts update" ON public.treatment_sessions
FOR UPDATE TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  AND public.user_has_branch_access_via_treatment_plan(treatment_plan_id)
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.treatment_plans tp
      WHERE tp.id = treatment_sessions.treatment_plan_id
        AND tp.doctor_id = (SELECT auth.uid())
    )
  )
)
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.edit')
  AND public.user_has_branch_access_via_treatment_plan(treatment_plan_id)
  AND (
    NOT public.has_role((SELECT auth.uid()), 'doctor'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.treatment_plans tp
      WHERE tp.id = treatment_sessions.treatment_plan_id
        AND tp.doctor_id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "ts delete" ON public.treatment_sessions
FOR DELETE TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'treatment_plans.delete')
  AND public.user_has_branch_access_via_treatment_plan(treatment_plan_id)
);

-- ---------------------------------------------------------------------------
-- 4) Finance / HR: use canonical action permissions instead of broad role ALL.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS coupons_manage_billing_admin ON public.coupons;

CREATE POLICY coupons_select_authorized ON public.coupons
FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'coupons.view')
  AND public.user_has_branch_access(branch_id)
);

CREATE POLICY coupons_insert_authorized ON public.coupons
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'coupons.create')
  AND public.user_has_branch_access(branch_id)
);

CREATE POLICY coupons_update_authorized ON public.coupons
FOR UPDATE TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'coupons.edit')
  AND public.user_has_branch_access(branch_id)
)
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'coupons.edit')
  AND public.user_has_branch_access(branch_id)
);

CREATE POLICY coupons_delete_authorized ON public.coupons
FOR DELETE TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'coupons.delete')
  AND public.user_has_branch_access(branch_id)
);

-- Receptionist read remains covered by coupons.view through the canonical
-- grant. Remove the redundant role-specific policy to avoid OR-policy drift.
DROP POLICY IF EXISTS coupons_select_reception ON public.coupons;

-- HR may create/edit payroll rows, but canonical hr.delete is Admin-only.
DROP POLICY IF EXISTS hr_payroll_delete ON public.payroll;

DROP POLICY IF EXISTS "Admin/HR/manager full access on staff_targets" ON public.staff_targets;

CREATE POLICY staff_targets_role_select ON public.staff_targets
FOR SELECT TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'hr.view')
  AND public.user_has_branch_access(branch_id)
);

CREATE POLICY staff_targets_role_insert ON public.staff_targets
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'hr.create')
  AND public.user_has_branch_access(branch_id)
);

CREATE POLICY staff_targets_role_update ON public.staff_targets
FOR UPDATE TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'hr.edit')
  AND public.user_has_branch_access(branch_id)
)
WITH CHECK (
  public.has_permission((SELECT auth.uid()), 'hr.edit')
  AND public.user_has_branch_access(branch_id)
);

CREATE POLICY staff_targets_role_delete ON public.staff_targets
FOR DELETE TO authenticated
USING (
  public.has_permission((SELECT auth.uid()), 'hr.delete')
  AND public.user_has_branch_access(branch_id)
);

-- ---------------------------------------------------------------------------
-- 5) Integration configuration: tenant membership is a scope check, not an
--    authorization grant. Writes require settings.integrations.manage.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS ai_tenant_settings_write_scoped ON public.ai_tenant_settings;
CREATE POLICY ai_tenant_settings_write_scoped ON public.ai_tenant_settings
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
);

DROP POLICY IF EXISTS channel_accounts_write_scoped ON public.channel_accounts;
CREATE POLICY channel_accounts_write_scoped ON public.channel_accounts
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR (
    public.user_has_tenant_access(tenant_id)
    AND public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
);

DROP POLICY IF EXISTS "comm_tpl admin write" ON public.communication_templates;
CREATE POLICY "comm_tpl admin write" ON public.communication_templates
FOR ALL TO authenticated
USING (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
  AND public.user_has_branch_access(branch_id)
)
WITH CHECK (
  (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'settings.integrations.manage')
  )
  AND public.user_has_branch_access(branch_id)
);
