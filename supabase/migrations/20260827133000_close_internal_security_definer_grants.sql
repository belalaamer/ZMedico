-- Close exposed EXECUTE grants for internal trigger/helper functions.
-- Public booking and patient-facing functions intentionally keep their own
-- narrowly scoped anon grants; only internal trigger wrappers and server-side
-- setters are revoked here.

REVOKE EXECUTE ON FUNCTION public.enforce_doctor_service_eligibility() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_appointment_reminders(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_doctor_service_assignment_tenant() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_patient_portal_settings_tenant() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_patient_portal_branch_enabled() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_public_booking_request_defaults() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_invoice_enqueue_communication() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_payment_enqueue_communication() FROM PUBLIC, anon, authenticated;

-- This view intentionally exposes only non-secret columns. Keep the caller's
-- privileges and RLS in force instead of the view owner's privileges.
ALTER VIEW public.safe_notification_settings SET (security_invoker = true);
