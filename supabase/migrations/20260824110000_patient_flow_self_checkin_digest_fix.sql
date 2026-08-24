-- pgcrypto compatibility fix: cast the digest algorithm argument explicitly.
CREATE OR REPLACE FUNCTION public.create_self_checkin_link(
  p_appointment_id uuid,
  p_ttl_minutes integer DEFAULT 180
)
RETURNS TABLE(token text, expires_at timestamptz, appointment_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  raw_token text;
  token_expiry timestamptz;
  tenant_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_ttl_minutes < 5 OR p_ttl_minutes > 1440 THEN
    RAISE EXCEPTION 'ttl must be between 5 and 1440 minutes' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT a.id, a.branch_id, a.status, a.scheduled_at, b.tenant_id
    INTO a
    FROM public.appointments a
    LEFT JOIN public.branches b ON b.id = a.branch_id
   WHERE a.id = p_appointment_id
     AND a.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.user_has_branch_access(a.branch_id)
  ) THEN
    RAISE EXCEPTION 'branch access required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
     WHERE t.id = a.tenant_id
       AND t.is_active = true
       AND t.subscription_status IN ('active'::public.subscription_status, 'trial'::public.subscription_status)
       AND (t.subscription_ends_at IS NULL OR t.subscription_ends_at > now())
       AND (t.trial_ends_at IS NULL OR t.trial_ends_at > now())
  ) INTO tenant_active;
  IF NOT tenant_active THEN
    RAISE EXCEPTION 'tenant subscription is not active' USING ERRCODE = 'check_violation';
  END IF;
  IF a.status NOT IN ('scheduled'::public.appointment_status, 'confirmed'::public.appointment_status) THEN
    RAISE EXCEPTION 'appointment is not eligible for self check-in' USING ERRCODE = 'check_violation';
  END IF;

  raw_token := encode(gen_random_bytes(32), 'hex');
  token_expiry := now() + make_interval(mins => p_ttl_minutes);
  UPDATE public.self_checkin_tokens
     SET revoked_at = now()
   WHERE self_checkin_tokens.appointment_id = a.id
     AND revoked_at IS NULL;

  INSERT INTO public.self_checkin_tokens (appointment_id, token_hash, expires_at, created_by)
  VALUES (a.id, encode(digest(raw_token, 'sha256'::text), 'hex'), token_expiry, auth.uid());

  INSERT INTO public.audit_logs (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), a.branch_id, 'self_checkin_link_created', 'appointment', a.id, NULL,
          jsonb_build_object('expires_at', token_expiry, 'method', 'self'));

  RETURN QUERY SELECT raw_token, token_expiry, a.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_self_checkin_details(p_token text)
RETURNS TABLE(
  valid boolean,
  status text,
  tenant_name_en text,
  tenant_name_ar text,
  branch_name_en text,
  branch_name_ar text,
  scheduled_at timestamptz,
  procedure_name text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 OR p_token !~ '^[0-9a-fA-F]+$' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true,
         a.status::text,
         t.name,
         NULL::text,
         b.name_en,
         b.name_ar,
         a.scheduled_at,
         NULL::text,
         s.expires_at
    FROM public.self_checkin_tokens s
    JOIN public.appointments a ON a.id = s.appointment_id
    JOIN public.branches b ON b.id = a.branch_id
    JOIN public.tenants t ON t.id = b.tenant_id
   WHERE s.token_hash = encode(digest(lower(p_token), 'sha256'::text), 'hex')
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
     AND a.deleted_at IS NULL
     AND a.scheduled_at BETWEEN now() - interval '12 hours' AND now() + interval '3 hours'
     AND a.status IN ('scheduled'::public.appointment_status, 'confirmed'::public.appointment_status)
     AND t.is_active = true
     AND t.subscription_status IN ('active'::public.subscription_status, 'trial'::public.subscription_status)
     AND (t.subscription_ends_at IS NULL OR t.subscription_ends_at > now())
     AND (t.trial_ends_at IS NULL OR t.trial_ends_at > now())
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_self_checkin(p_token text)
RETURNS TABLE(success boolean, state text, checked_in_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  a record;
  now_value timestamptz := now();
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 OR p_token !~ '^[0-9a-fA-F]+$' THEN
    RETURN QUERY SELECT false, 'invalid'::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT s.id, s.appointment_id
    INTO s
    FROM public.self_checkin_tokens s
   WHERE s.token_hash = encode(digest(lower(p_token), 'sha256'::text), 'hex')
     AND s.revoked_at IS NULL
     AND s.expires_at > now_value
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid'::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT a.id, a.branch_id, a.status, a.checked_in_at, a.deleted_at, a.scheduled_at,
         b.tenant_id, t.is_active AS tenant_is_active, t.subscription_status,
         t.subscription_ends_at, t.trial_ends_at
    INTO a
    FROM public.appointments a
    JOIN public.branches b ON b.id = a.branch_id
    JOIN public.tenants t ON t.id = b.tenant_id
   WHERE a.id = s.appointment_id
   FOR UPDATE;
  IF NOT FOUND OR a.deleted_at IS NOT NULL
     OR NOT a.tenant_is_active
     OR a.subscription_status NOT IN ('active'::public.subscription_status, 'trial'::public.subscription_status)
     OR (a.subscription_ends_at IS NOT NULL AND a.subscription_ends_at <= now_value)
     OR (a.trial_ends_at IS NOT NULL AND a.trial_ends_at <= now_value) THEN
    RETURN QUERY SELECT false, 'closed'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF a.scheduled_at < now_value - interval '12 hours'
     OR a.scheduled_at > now_value + interval '3 hours' THEN
    RETURN QUERY SELECT false, 'closed'::text, a.checked_in_at;
    RETURN;
  END IF;

  IF a.status IN ('cancelled'::public.appointment_status, 'no_show'::public.appointment_status, 'completed'::public.appointment_status, 'departed'::public.appointment_status) THEN
    RETURN QUERY SELECT false, 'closed'::text, a.checked_in_at;
    RETURN;
  END IF;

  UPDATE public.appointments
     SET status = 'confirmed'::public.appointment_status,
         checked_in_at = COALESCE(a.checked_in_at, now_value),
         self_checked_in_at = COALESCE(self_checked_in_at, now_value),
         check_in_method = CASE WHEN a.checked_in_at IS NULL THEN 'self' ELSE COALESCE(check_in_method, 'self') END
   WHERE id = a.id;

  UPDATE public.self_checkin_tokens SET last_used_at = now_value WHERE id = s.id;

  INSERT INTO public.audit_logs (user_id, branch_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (NULL, a.branch_id, 'self_checkin_completed', 'appointment', a.id,
          jsonb_build_object('status', a.status::text),
          jsonb_build_object('status', 'confirmed', 'method', 'self'));

  RETURN QUERY SELECT true, 'checked_in'::text, COALESCE(a.checked_in_at, now_value);
END;
$$;

REVOKE ALL ON FUNCTION public.create_self_checkin_link(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_self_checkin_details(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_self_checkin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_self_checkin_link(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_self_checkin_details(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_self_checkin(text) TO anon, authenticated;
