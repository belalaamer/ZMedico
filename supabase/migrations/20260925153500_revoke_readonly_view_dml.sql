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
