-- Close the direct anonymous booking RPC bypass after the Edge gateway is live.
--
-- SAFE RELEASE ORDER:
--   1. Apply 20260924161000_rate_limit_public_booking.sql.
--   2. Deploy public-booking-submit and verify it is ACTIVE.
--   3. Deploy the frontend that submits anonymous bookings through the gateway.
--   4. Apply THIS migration to revoke direct browser execution of the raw RPCs.
--
-- Applying this migration before step 3 would break the currently deployed
-- frontend, which still calls public_create_booking_for_tenant directly.

-- The Edge Function calls these with service_role. Browsers must no longer be
-- able to bypass the gateway and its throttles through PostgREST directly.
REVOKE EXECUTE ON FUNCTION public.public_create_booking(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.public_create_booking_for_tenant(
  uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.public_create_booking(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) TO service_role;

GRANT EXECUTE ON FUNCTION public.public_create_booking_for_tenant(
  uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) TO service_role;
