-- Remove the explicit authenticated grants left by the original compatibility
-- migrations. The previous REVOKE FROM PUBLIC alone does not remove an
-- explicit authenticated grant.

REVOKE EXECUTE ON FUNCTION public.public_booking_options()
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.public_create_booking(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.public_booking_options()
  TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid)
  TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.public_create_booking(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) TO anon, service_role;
