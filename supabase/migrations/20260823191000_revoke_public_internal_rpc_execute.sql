-- Remove the implicit PUBLIC EXECUTE grant from internal SECURITY DEFINER
-- routines. Authenticated compatibility grants are retained where existing
-- policies or server-side client flows may invoke the routines.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.branch_invoice_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branch_invoice_code(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.lead_staff_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_staff_access(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.prune_phi_access_log(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_phi_access_log(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.tg_lead_activity_automation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tg_lead_activity_automation() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.tg_public_booking_to_lead() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tg_public_booking_to_lead() TO authenticated, service_role;

COMMIT;
