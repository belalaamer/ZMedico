-- Harden exposed views and internal SECURITY DEFINER functions.
-- This migration is intentionally additive/restrictive and does not change tenant data.

BEGIN;

-- Self-service views must obey the querying user's RLS context.
ALTER VIEW public.staff_profiles_self SET (security_invoker = true);
ALTER VIEW public.payroll_self SET (security_invoker = true);
ALTER VIEW public.v_phi_access_by_patient SET (security_invoker = true);

-- The self-service views are intentionally limited projections. Allow a user to
-- read only the base row linked to that same authenticated identity.
DROP POLICY IF EXISTS staff_profiles_select_self_view ON public.staff_profiles;
CREATE POLICY staff_profiles_select_self_view
  ON public.staff_profiles
  FOR SELECT
  TO authenticated
  USING (linked_user_id = auth.uid());

DROP POLICY IF EXISTS payroll_select_self_view ON public.payroll;
CREATE POLICY payroll_select_self_view
  ON public.payroll
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.id = payroll.staff_id
        AND sp.linked_user_id = auth.uid()
    )
  );

-- PHI audit reads are platform-wide for System Owner and branch-scoped for
-- Clinic Admin. A null branch log is visible only to System Owner.
DROP POLICY IF EXISTS phi_log_select_admin ON public.phi_access_log;
CREATE POLICY phi_log_select_admin
  ON public.phi_access_log
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'system_owner'::app_role)
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND branch_id IS NOT NULL
      AND user_has_branch_access(branch_id)
    )
  );

-- The PHI view is not an anonymous API surface.
REVOKE ALL ON public.v_phi_access_by_patient FROM PUBLIC, anon;
GRANT SELECT ON public.v_phi_access_by_patient TO authenticated, service_role;

-- System Owner is the platform-level auditor and may inspect patients through
-- the PHI audit view; ordinary clinic roles remain branch-scoped.
DROP POLICY IF EXISTS patients_select_system_owner ON public.patients;
CREATE POLICY patients_select_system_owner
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'system_owner'::app_role));

-- Pin search_path for trigger functions to avoid object-shadowing risks.
ALTER FUNCTION public.tg_lead_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tg_meta_ads_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tg_saas_tenant_updated_at() SET search_path = pg_catalog, public;

-- These functions are used by triggers/internal authenticated code, not by an
-- anonymous caller. Keep authenticated grants unchanged for compatibility.
REVOKE EXECUTE ON FUNCTION public.branch_invoice_code(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lead_staff_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_phi_access_log(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_lead_activity_automation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_public_booking_to_lead() FROM anon;

COMMIT;
