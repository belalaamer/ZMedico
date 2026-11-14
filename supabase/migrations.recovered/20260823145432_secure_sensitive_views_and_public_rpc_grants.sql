-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260823145432
-- name: secure_sensitive_views_and_public_rpc_grants
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

BEGIN;

ALTER VIEW public.staff_profiles_self SET (security_invoker = true);
ALTER VIEW public.payroll_self SET (security_invoker = true);
ALTER VIEW public.v_phi_access_by_patient SET (security_invoker = true);

DROP POLICY IF EXISTS staff_profiles_select_self_view ON public.staff_profiles;
CREATE POLICY staff_profiles_select_self_view ON public.staff_profiles FOR SELECT TO authenticated USING (linked_user_id = auth.uid());

DROP POLICY IF EXISTS payroll_select_self_view ON public.payroll;
CREATE POLICY payroll_select_self_view ON public.payroll FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.id = payroll.staff_id AND sp.linked_user_id = auth.uid()));

DROP POLICY IF EXISTS phi_log_select_admin ON public.phi_access_log;
CREATE POLICY phi_log_select_admin ON public.phi_access_log FOR SELECT TO authenticated USING (has_role(auth.uid(), 'system_owner'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND branch_id IS NOT NULL AND user_has_branch_access(branch_id)));

REVOKE ALL ON public.v_phi_access_by_patient FROM PUBLIC, anon;
GRANT SELECT ON public.v_phi_access_by_patient TO authenticated, service_role;

DROP POLICY IF EXISTS patients_select_system_owner ON public.patients;
CREATE POLICY patients_select_system_owner ON public.patients FOR SELECT TO authenticated USING (has_role(auth.uid(), 'system_owner'::app_role));

ALTER FUNCTION public.tg_lead_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tg_meta_ads_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tg_saas_tenant_updated_at() SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION public.branch_invoice_code(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lead_staff_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_phi_access_log(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_lead_activity_automation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_public_booking_to_lead() FROM anon;

COMMIT;
