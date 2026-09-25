-- Align tenant clinical catalog writes with the canonical catalog permission.
--
-- Global seed rows (tenant_id IS NULL) remain System-Owner maintained.
-- Tenant rows remain readable by tenant members under existing SELECT policies,
-- but mutations require settings.catalog.update instead of tenant membership.

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
