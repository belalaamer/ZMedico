-- ZMED-293: stop the login and subscription-request throttles from storing caller key material verbatim.
--
-- Closes the two paths that 20261022115129_f6_harden_public_booking_key_hash.sql deliberately left alone
-- (see docs/PRODUCTION_PATCH_MANIFEST.md §5.2). Both functions wrote `p_key` straight into the primary key
-- column of their bucket table, so any caller could turn a rate-limit row into a plaintext identifier store.
--
-- Live reads on Production rqcmnfzfytyyicelvifk, 2026-10-22, that set the scope:
--   * consume_login_rate_limit(text,integer,integer)                   proacl {postgres=X, service_role=X}
--   * consume_subscription_request_rate_limit(text,integer,integer)    proacl {postgres=X, service_role=X}
--   * both tables: relrowsecurity = true, relacl {postgres=arwdDxtm, service_role=arwdDxtm}, 0 rows each
--   * both tables: bucket_key is `text` and is the PRIMARY KEY
-- The 0-row measurement is why no re-hash data migration accompanies this file: there is no historical
-- bucket_key to rewrite, so the new CHECK constraint validates instantly against an empty relation.
--
-- Behaviour is unchanged for every existing caller. Both Edge callers already hash before calling
-- (login-by-identifier/index.ts sends sha256Hex(`${clientIp}|${normalizedIdentifier}`),
-- public-subscription-request/index.ts sends sha256Hex(clientIp)), so a 64-hex p_key goes in and now comes
-- out as sha256(that digest) — a different bucket_key value than before, but on empty tables nothing is
-- reset. Because the fold happens inside the function, the CHECK cannot be tripped by any future caller
-- passing raw identifier material: it is stored hashed or not at all.
--
-- Deliberately NOT changed: the input guards (length 32..128, limit/window bounds) and the `now()` based
-- window arithmetic. Narrowing or relaxing either would change who gets throttled, which is outside this
-- finding. Re-runnable by design: CREATE OR REPLACE plus drop-then-add constraint.

-- 1. Fold the key on write, and read back by the same digest.
CREATE OR REPLACE FUNCTION public.consume_login_rate_limit(
  p_key text,
  p_limit integer DEFAULT 10,
  p_window_seconds integer DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.login_rate_limits%ROWTYPE;
  v_now timestamptz := now();
  v_window interval;
  v_next integer;
  v_bucket_key text;
BEGIN
  IF p_key IS NULL OR length(p_key) < 32 OR length(p_key) > 128 THEN
    RAISE EXCEPTION 'invalid_rate_limit_key';
  END IF;
  IF p_limit < 1 OR p_limit > 100 OR p_window_seconds < 30 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_rate_limit_config';
  END IF;

  v_window := make_interval(secs => p_window_seconds);

  -- Fold the caller's key material here. The pre-image is never written, never logged, and never leaves
  -- this function.
  v_bucket_key := lower(encode(extensions.digest(convert_to(p_key, 'utf8'), 'sha256'), 'hex'));

  INSERT INTO public.login_rate_limits(bucket_key, window_started_at, attempts, updated_at)
  VALUES (v_bucket_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO v_row
  FROM public.login_rate_limits
  WHERE bucket_key = v_bucket_key
  FOR UPDATE;

  IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    UPDATE public.login_rate_limits SET updated_at = v_now WHERE bucket_key = v_bucket_key;
    RETURN false;
  END IF;

  IF v_row.window_started_at + v_window <= v_now THEN
    UPDATE public.login_rate_limits
       SET window_started_at = v_now,
           attempts = 1,
           blocked_until = NULL,
           updated_at = v_now
     WHERE bucket_key = v_bucket_key;
    RETURN true;
  END IF;

  -- Freshly inserted rows already represent the first allowed attempt.
  IF v_row.attempts = 1 AND v_row.window_started_at = v_now THEN
    RETURN true;
  END IF;

  v_next := v_row.attempts + 1;
  UPDATE public.login_rate_limits
     SET attempts = v_next,
         blocked_until = CASE WHEN v_next > p_limit THEN v_now + v_window ELSE NULL END,
         updated_at = v_now
   WHERE bucket_key = v_bucket_key;

  RETURN v_next <= p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_subscription_request_rate_limit(
  p_key text,
  p_limit integer DEFAULT 8,
  p_window_seconds integer DEFAULT 3600
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.subscription_request_rate_limits%ROWTYPE;
  v_now timestamptz := now();
  v_window interval;
  v_next integer;
  v_bucket_key text;
BEGIN
  IF p_key IS NULL OR length(p_key) < 32 OR length(p_key) > 128 THEN
    RAISE EXCEPTION 'invalid_rate_limit_key';
  END IF;
  IF p_limit < 1 OR p_limit > 100 OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_rate_limit_config';
  END IF;

  v_window := make_interval(secs => p_window_seconds);

  v_bucket_key := lower(encode(extensions.digest(convert_to(p_key, 'utf8'), 'sha256'), 'hex'));

  INSERT INTO public.subscription_request_rate_limits(bucket_key, window_started_at, attempts, updated_at)
  VALUES (v_bucket_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO v_row
  FROM public.subscription_request_rate_limits
  WHERE bucket_key = v_bucket_key
  FOR UPDATE;

  IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    UPDATE public.subscription_request_rate_limits SET updated_at=v_now WHERE bucket_key=v_bucket_key;
    RETURN false;
  END IF;

  IF v_row.window_started_at + v_window <= v_now THEN
    UPDATE public.subscription_request_rate_limits
       SET window_started_at=v_now, attempts=1, blocked_until=NULL, updated_at=v_now
     WHERE bucket_key=v_bucket_key;
    RETURN true;
  END IF;

  IF v_row.attempts = 1 AND v_row.window_started_at = v_now THEN
    RETURN true;
  END IF;

  v_next := v_row.attempts + 1;
  UPDATE public.subscription_request_rate_limits
     SET attempts=v_next,
         blocked_until=CASE WHEN v_next > p_limit THEN v_now + v_window ELSE NULL END,
         updated_at=v_now
   WHERE bucket_key=v_bucket_key;

  RETURN v_next <= p_limit;
END;
$function$;

-- 2. Make plaintext unrepresentable in the column itself, so a hand-written INSERT or a future function
--    cannot reintroduce the defect. Empty relations today, so validation is immediate.
ALTER TABLE public.login_rate_limits
  DROP CONSTRAINT IF EXISTS login_rate_limits_bucket_key_is_sha256_hex;
ALTER TABLE public.login_rate_limits
  ADD CONSTRAINT login_rate_limits_bucket_key_is_sha256_hex
  CHECK (bucket_key ~ '^[0-9a-f]{64}$');

ALTER TABLE public.subscription_request_rate_limits
  DROP CONSTRAINT IF EXISTS subscription_request_rate_limits_bucket_key_is_sha256_hex;
ALTER TABLE public.subscription_request_rate_limits
  ADD CONSTRAINT subscription_request_rate_limits_bucket_key_is_sha256_hex
  CHECK (bucket_key ~ '^[0-9a-f]{64}$');

-- 3. Re-assert the grants the 20260921210141 / 20260922154103 files already set. Production's live ACLs
--    already match, so this changes nothing; it makes the invariant part of the migration history instead
--    of the dashboard state, and it is what keeps a rebuilt environment from inheriting PUBLIC EXECUTE.
REVOKE ALL ON FUNCTION public.consume_login_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_login_rate_limit(text, integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.consume_subscription_request_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_subscription_request_rate_limit(text, integer, integer)
  TO service_role;

-- 4. Post-write self-check: both functions must be defined to fold, and no client role may hold EXECUTE.
DO $assertion$
DECLARE
  v_body text;
BEGIN
  FOR v_body IN
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('consume_login_rate_limit', 'consume_subscription_request_rate_limit')
  LOOP
    IF v_body NOT LIKE '%extensions.digest(convert_to(p_key%' THEN
      RAISE EXCEPTION 'throttle_key_fold_missing';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN aclexplode(p.proacl) a ON true
     WHERE n.nspname = 'public'
       AND p.proname IN ('consume_login_rate_limit', 'consume_subscription_request_rate_limit')
       AND a.privilege_type = 'EXECUTE'
       AND a.grantee IN (to_regrole('anon'), to_regrole('authenticated'))
  ) THEN
    RAISE EXCEPTION 'throttle_execute_open_to_client_roles';
  END IF;
END;
$assertion$;
