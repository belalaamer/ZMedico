-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260904164957
-- name: add_tenant_scoping_to_shared_medical_reference_tables
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Add nullable tenant_id: NULL = shared/global reference row, non-null = clinic-owned custom row.
ALTER TABLE public.diagnoses ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.medications ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.medical_specialties ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS diagnoses_tenant_id_idx ON public.diagnoses(tenant_id);
CREATE INDEX IF NOT EXISTS medications_tenant_id_idx ON public.medications(tenant_id);
CREATE INDEX IF NOT EXISTS medical_specialties_tenant_id_idx ON public.medical_specialties(tenant_id);

-- diagnoses: drop old permissive/global policies
DROP POLICY IF EXISTS dx_select ON public.diagnoses;
DROP POLICY IF EXISTS dx_admin ON public.diagnoses;

CREATE POLICY diagnoses_select_scoped ON public.diagnoses
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR public.user_has_tenant_access(tenant_id));

CREATE POLICY diagnoses_insert_scoped ON public.diagnoses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

CREATE POLICY diagnoses_update_scoped ON public.diagnoses
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

CREATE POLICY diagnoses_delete_scoped ON public.diagnoses
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

-- medications: drop old permissive/global policies
DROP POLICY IF EXISTS med_select ON public.medications;
DROP POLICY IF EXISTS med_admin ON public.medications;

CREATE POLICY medications_select_scoped ON public.medications
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR public.user_has_tenant_access(tenant_id));

CREATE POLICY medications_insert_scoped ON public.medications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

CREATE POLICY medications_update_scoped ON public.medications
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

CREATE POLICY medications_delete_scoped ON public.medications
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

-- medical_specialties: drop old permissive/global policies (RLS already enabled)
DROP POLICY IF EXISTS spec_select ON public.medical_specialties;
DROP POLICY IF EXISTS spec_admin ON public.medical_specialties;

CREATE POLICY medical_specialties_select_scoped ON public.medical_specialties
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR public.user_has_tenant_access(tenant_id));

CREATE POLICY medical_specialties_insert_scoped ON public.medical_specialties
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

CREATE POLICY medical_specialties_update_scoped ON public.medical_specialties
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

CREATE POLICY medical_specialties_delete_scoped ON public.medical_specialties
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (tenant_id IS NOT NULL AND public.user_has_tenant_access(tenant_id))
  );

