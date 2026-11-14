-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260925123608
-- name: revoke_readonly_view_dml
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Remove meaningless DML grants from read-only public views.
-- All listed views are non-updatable/non-insertable and are consumed as reports
-- or authorization read models. Keeping INSERT/UPDATE/DELETE grants adds API
-- surface without enabling a legitimate workflow.

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.v_authz_effective_permissions,
  public.v_authz_shadow_exit_criteria,
  public.v_authz_shadow_key_coverage,
  public.v_authz_shadow_matrix_hr,
  public.v_authz_shadow_matrix_invoices,
  public.v_authz_shadow_matrix_medical_records,
  public.v_authz_shadow_matrix_patients,
  public.v_authz_shadow_matrix_settings,
  public.v_authz_shadow_parity_report,
  public.v_authz_state,
  public.v_phi_access_by_patient
FROM authenticated;

