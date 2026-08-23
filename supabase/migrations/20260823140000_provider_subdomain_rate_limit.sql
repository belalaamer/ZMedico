-- Extend durable custom-domain rate limiting to the provider-subdomain operation.
ALTER TABLE public.custom_domain_rate_limits
  DROP CONSTRAINT IF EXISTS custom_domain_rate_limits_action_check;

ALTER TABLE public.custom_domain_rate_limits
  ADD CONSTRAINT custom_domain_rate_limits_action_check
  CHECK (action IN ('list', 'create', 'create_subdomain', 'status', 'disable', 'remove'));

CREATE OR REPLACE FUNCTION public.consume_custom_domain_rate_limit(
  _actor_id uuid,
  _action text,
  _limit integer DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz := date_trunc('minute', now());
  v_limit integer := greatest(1, least(coalesce(_limit, 20), 100));
  v_count integer;
BEGIN
  IF _actor_id IS NULL OR _action NOT IN ('list', 'create', 'create_subdomain', 'status', 'disable', 'remove') THEN
    RETURN false;
  END IF;

  INSERT INTO public.custom_domain_rate_limits (actor_id, action, window_started_at, request_count)
  VALUES (_actor_id, _action, v_window, 1)
  ON CONFLICT (actor_id, action, window_started_at)
  DO UPDATE SET request_count = public.custom_domain_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  DELETE FROM public.custom_domain_rate_limits
  WHERE window_started_at < now() - interval '15 minutes';

  RETURN v_count <= v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_custom_domain_rate_limit(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_custom_domain_rate_limit(uuid, text, integer) TO service_role;
