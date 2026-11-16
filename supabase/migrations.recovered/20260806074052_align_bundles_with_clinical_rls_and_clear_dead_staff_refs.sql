-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260806074052
-- name: align_bundles_with_clinical_rls_and_clear_dead_staff_refs
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Found by walking every route against every role: three roles are still OFFERED
-- clinical screens that now return nothing.
--
-- Yesterday's minimum-necessary work removed row access to clinical data from
-- manager, receptionist and accountant. But their permission BUNDLES still grant
-- the matching .view keys, and PermissionRoute admits a user to a screen based on
-- the bundle. So the route opens and the query comes back empty. That is the exact
-- drift this project has been fixing all along -- I introduced three new instances
-- of it, and this closes them.
--
--   manager       medical_records.view, treatment_plans.view, vitals.view
--   receptionist  treatment_plans.view
--   accountant    treatment_plans.view
--
-- A screen that opens and shows nothing is worse than a screen that is absent: the
-- user cannot tell whether there is no data or they are not allowed to see it, and
-- neither can the person they ask for help.

DELETE FROM public.authz_bundle_permissions
WHERE bundle_key = 'bundle.role.manager'
  AND permission_key IN ('medical_records.view','treatment_plans.view','vitals.view',
                         'reports_medical.view','reports_medical.export');

DELETE FROM public.authz_bundle_permissions
WHERE bundle_key IN ('bundle.role.receptionist','bundle.role.accountant')
  AND permission_key = 'treatment_plans.view';

-- Keep the legacy table in step, since a browser can still resolve permissions
-- through it and the two must not disagree. role is stored as text here.
UPDATE public.role_permissions
   SET actions = '{}'
 WHERE role = 'manager'
   AND module IN ('medical_records','treatment_plans','vitals','reports_medical');

UPDATE public.role_permissions
   SET actions = '{}'
 WHERE role IN ('receptionist','accountant')
   AND module = 'treatment_plans';

-- =====================================================================
-- vital_signs was inconsistent with the rest of the clinical tables: manager was
-- removed from medical_records and treatment_plans but still had SELECT here.
-- Blood pressure and pulse are clinical measurements about an identified patient;
-- the same minimum-necessary reasoning applies (HIPAA 164.502(b), GDPR 5(1)(c)).
-- =====================================================================
DROP POLICY IF EXISTS vit_select_clinical ON public.vital_signs;
CREATE POLICY vit_select_clinical
  ON public.vital_signs
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'doctor'::public.app_role)
    OR public.has_role(auth.uid(), 'nurse'::public.app_role)
  );

-- =====================================================================
-- Two vital_signs policies still name the retired 'staff' role. Its grants are
-- gone and a trigger rejects new ones, so these clauses can never match -- they
-- are dead conditions that make the next reader think 'staff' is still live.
-- Removed for clarity, with no behavioural change.
--
-- Nurses keep their own write path through nurse_vitals_insert /
-- nurse_vitals_update, which is untouched -- recording vitals is a nurse's core
-- duty and must not be affected.
-- =====================================================================
DROP POLICY IF EXISTS vit_insert_clinical ON public.vital_signs;
CREATE POLICY vit_insert_clinical
  ON public.vital_signs
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'doctor'::public.app_role)
  );

DROP POLICY IF EXISTS vit_update_clinical ON public.vital_signs;
CREATE POLICY vit_update_clinical
  ON public.vital_signs
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'doctor'::public.app_role)
  );
