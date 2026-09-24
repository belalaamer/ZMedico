-- Rate-limit anonymous public bookings and close direct RPC bypass.
--
-- DEPLOYMENT ORDER (important):
--   1. Deploy the public-booking-submit Edge Function.
--   2. Deploy the frontend that calls that Edge Function.
--   3. Apply this migration to revoke anonymous access to the raw booking RPC.
--
-- Do not apply step 3 before steps 1-2 or anonymous public booking will be
-- temporarily unavailable.

CREATE TABLE IF NOT EXISTS public.public_booking_rate_limits (
  key_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.public_booking_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_booking_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_booking_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_public_booking_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_count integer;
BEGIN
  IF p_key IS NULL OR length(p_key) < 16
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.public_booking_rate_limits AS r (
    key_hash, window_started_at, attempt_count, updated_at
  )
  VALUES (p_key, v_now, 1, v_now)
  ON CONFLICT (key_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN r.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        THEN v_now
      ELSE r.window_started_at
    END,
    attempt_count = CASE
      WHEN r.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        THEN 1
      ELSE r.attempt_count + 1
    END,
    updated_at = v_now
  RETURNING attempt_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.consume_public_booking_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_booking_rate_limit(text, integer, integer)
  TO service_role;

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
