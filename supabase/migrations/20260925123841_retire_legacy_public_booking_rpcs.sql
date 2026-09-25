-- Retire pre-multitenant public-booking compatibility RPCs.
--
-- The current production frontend uses only the tenant-scoped RPCs:
--   public_booking_options_for_tenant
--   public_booking_slots_for_tenant
--   public_create_booking_for_tenant
-- The legacy wrappers below hard-code tenant slug 'default' and have no current
-- callers in the repository or recent API logs. Keep them available only to
-- service_role for emergency/internal compatibility.

REVOKE ALL ON FUNCTION public.public_booking_options()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_create_booking(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.public_booking_options() TO service_role;
GRANT EXECUTE ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.public_create_booking(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) TO service_role;
