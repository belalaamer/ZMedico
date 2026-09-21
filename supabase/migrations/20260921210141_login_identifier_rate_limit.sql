CREATE TABLE IF NOT EXISTS public.login_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.login_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.login_rate_limits TO service_role;

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
BEGIN
  IF p_key IS NULL OR length(p_key) < 32 OR length(p_key) > 128 THEN
    RAISE EXCEPTION 'invalid_rate_limit_key';
  END IF;
  IF p_limit < 1 OR p_limit > 100 OR p_window_seconds < 30 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_rate_limit_config';
  END IF;

  v_window := make_interval(secs => p_window_seconds);

  INSERT INTO public.login_rate_limits(bucket_key, window_started_at, attempts, updated_at)
  VALUES (p_key, v_now, 1, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT * INTO v_row
  FROM public.login_rate_limits
  WHERE bucket_key = p_key
  FOR UPDATE;

  IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    UPDATE public.login_rate_limits SET updated_at = v_now WHERE bucket_key = p_key;
    RETURN false;
  END IF;

  IF v_row.window_started_at + v_window <= v_now THEN
    UPDATE public.login_rate_limits
       SET window_started_at = v_now,
           attempts = 1,
           blocked_until = NULL,
           updated_at = v_now
     WHERE bucket_key = p_key;
    RETURN true;
  END IF;

  IF v_row.attempts = 1 AND v_row.window_started_at = v_now THEN
    RETURN true;
  END IF;

  v_next := v_row.attempts + 1;
  UPDATE public.login_rate_limits
     SET attempts = v_next,
         blocked_until = CASE WHEN v_next > p_limit THEN v_now + v_window ELSE NULL END,
         updated_at = v_now
   WHERE bucket_key = p_key;

  RETURN v_next <= p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_login_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_login_rate_limit(text, integer, integer)
  TO service_role;
