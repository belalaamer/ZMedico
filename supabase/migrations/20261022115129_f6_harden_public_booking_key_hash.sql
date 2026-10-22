-- ZMED-292 follow-up (owner authorization of 22 October, item 4): make the column named
-- key_hash actually be a hash.
--
-- WHAT WAS MEASURED BEFORE WRITING THIS (Production, read-only):
--   * public.public_booking_rate_limits        -> 0 rows
--   * public.login_rate_limits                 -> 0 rows
--   * public.subscription_request_rate_limits  -> 0 rows
--   * Both live callers already send a SHA-256 hex digest, so nothing today is plaintext:
--       - public._create_booking_for_patient (RPC, lines 68-90):
--           public.consume_public_booking_rate_limit(v_ip_key, 20, 3600)
--           public.consume_public_booking_rate_limit(v_phone_ip_key, 6, 21600)
--         with v_ip_key / v_phone_ip_key built by extensions.digest(convert_to(...), 'sha256')
--       - Edge Function public-booking-submit: sha256Hex(`public-booking:ip:...`) /
--         sha256Hex(`public-booking:phone-ip:...`) before the same two RPC calls.
--   So this is NOT an active leak and NOT an outage fix. The defect is that nothing in the
--   database enforced the promise the column name makes: the function stored whatever text a
--   caller put in p_key, verbatim. One future caller that passes "ip:1.2.3.4" or an email
--   address would silently turn an identifier column into a plaintext identifier store.
--
-- WHAT THIS DOES
--   1. The function folds p_key into a SHA-256 digest itself, so the value written to key_hash
--      is always 64 lowercase hex characters no matter what a caller passes.
--   2. A CHECK constraint states the same promise in the schema, so a direct INSERT (or a
--      future function that regresses) is refused rather than accepted quietly.
--   3. Nothing else changes: same guards, same window maths, same RETURN v_count <= p_limit,
--      same signature, same security definer / search_path pin, same grants.
--
-- DOES ANY CURRENTLY WORKING KEY NEED TO BE UPDATED? No.
--   * All three throttle tables are empty, so there is no stored key to recompute.
--   * Keys are derived per request by the callers and never read back, so the folded value is
--     invisible to them. Buckets start fresh at the first request after this apply; the counter
--     that had been running for an IP is reset once, which is the only observable effect and it
--     lasts one window.
--
-- SCOPE DELIBERATELY NOT TAKEN
--   consume_login_rate_limit and consume_subscription_request_rate_limit store their argument in
--   login_rate_limits.bucket_key / subscription_request_rate_limits.bucket_key the same way. They
--   already refuse p_key outside 32..128 characters (a 64-char digest fits), so they cannot hold
--   a short plaintext identifier, and consume_login_rate_limit sits on the authentication path.
--   Changing it was not authorized, so it is reported as a proposal instead of done here.
--
-- DEPENDENCY: extensions.digest requires pgcrypto. Measured on Production: pgcrypto is installed
-- in schema "extensions" (pg_extension: pgcrypto@extensions) and
-- encode(extensions.digest(convert_to('...','utf8'),'sha256'),'hex') returns 64 lowercase hex.
-- The call is schema-qualified because the function pins search_path to 'public'.

-- 1. The schema-level promise. Table is empty, so this validates trivially and takes no lock
--    scan on existing data.
ALTER TABLE public.public_booking_rate_limits
  DROP CONSTRAINT IF EXISTS public_booking_rate_limits_key_hash_is_sha256_hex_check;

ALTER TABLE public.public_booking_rate_limits
  ADD CONSTRAINT public_booking_rate_limits_key_hash_is_sha256_hex_check
  CHECK (key_hash ~ '^[0-9a-f]{64}$');

-- 2. The function. Diff against the live definition is exactly: one new variable, one new
--    assignment, and VALUES (v_key_hash, ...) in place of VALUES (p_key, ...).
CREATE OR REPLACE FUNCTION public.consume_public_booking_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_key_hash text;
BEGIN
  IF p_key IS NULL OR length(p_key) < 16
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
  THEN
    RETURN false;
  END IF;

  -- Fold the caller's key material here. The plaintext is never written, never logged, and
  -- never leaves this function.
  v_key_hash := lower(encode(extensions.digest(convert_to(p_key, 'utf8'), 'sha256'), 'hex'));

  INSERT INTO public.public_booking_rate_limits AS r (
    key_hash, window_started_at, attempt_count, updated_at
  )
  VALUES (v_key_hash, v_now, 1, v_now)
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
$function$;

-- 3. Re-assert the access path. CREATE OR REPLACE preserves these, but the grant set is the
--    reason the throttle is not readable by anon/authenticated, so it belongs in the record.
REVOKE ALL ON FUNCTION public.consume_public_booking_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_booking_rate_limit(text, integer, integer)
  TO service_role;
