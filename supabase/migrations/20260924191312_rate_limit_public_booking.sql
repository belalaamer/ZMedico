-- Add rate-limit infrastructure for anonymous public bookings.
-- This migration is intentionally additive: it does NOT revoke the legacy
-- raw booking RPC. Apply it before switching the frontend to the Edge gateway.

CREATE TABLE IF NOT EXISTS public.public_booking_rate_limits (
  key_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.public_booking_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_booking_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_booking_rate_limits TO service_role;

-- Keep cleanup efficient even if an abusive client rotates IPs/phones and
-- creates many distinct limiter keys.
CREATE INDEX IF NOT EXISTS public_booking_rate_limits_updated_at_idx
  ON public.public_booking_rate_limits (updated_at);

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

-- The limiter keyspace is attacker-controlled (unique IP/phone combinations),
-- so expired rows must not accumulate forever. The longest accepted limiter
-- window is 24h; keeping 48h leaves ample margin while bounding table growth.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-public-booking-rate-limits');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'cleanup-public-booking-rate-limits',
  '17 3 * * *',
  $cron$DELETE FROM public.public_booking_rate_limits
        WHERE updated_at < now() - interval '48 hours'$cron$
);
