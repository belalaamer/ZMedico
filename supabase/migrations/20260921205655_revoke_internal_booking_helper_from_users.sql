-- Internal booking helper must never be callable directly by end-user roles.
-- Public and patient-portal booking RPCs call it internally as SECURITY DEFINER.
REVOKE ALL ON FUNCTION public._create_booking_for_patient(
  uuid, uuid, uuid, timestamptz, uuid, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._create_booking_for_patient(
  uuid, uuid, uuid, timestamptz, uuid, uuid, text, text, jsonb
) TO service_role;
