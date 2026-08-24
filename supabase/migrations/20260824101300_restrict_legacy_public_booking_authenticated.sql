-- Restrict the legacy default-tenant compatibility bridge.
-- The current tenant-aware booking flow remains available to anon/authenticated.
-- Legacy browser visitors still use anon; signed-in users do not need these
-- default-tenant wrappers and should not call them directly.

REVOKE EXECUTE ON FUNCTION public.public_booking_options()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_options()
  TO anon, service_role;

REVOKE EXECUTE ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid)
  TO anon, service_role;

REVOKE EXECUTE ON FUNCTION public.public_create_booking(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_create_booking(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) TO anon, service_role;
