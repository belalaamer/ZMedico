-- P2-db: public_self_checkin_details collapsed five distinct failures into
-- one byte-identical all-NULL row, so the check-in page could not tell a
-- forged token from an out-of-window appointment or a lapsed tenant, and it
-- projected tenants.name_ar as NULL while the column is populated.
--
-- This mirrors the state machine public_self_checkin already implements:
--   invalid           -> malformed, unknown, revoked or expired token
--   closed            -> deleted appointment, outside [-12h, +3h], ineligible status
--   clinic_unavailable -> tenant inactive or subscription lapsed
--
-- The trailing `reason` column changes the return type, so the function must
-- be dropped and recreated; its grants are restored in the same transaction.

DROP FUNCTION IF EXISTS public.public_self_checkin_details(text);

CREATE FUNCTION public.public_self_checkin_details(p_token text)
RETURNS TABLE(
  valid boolean,
  status text,
  tenant_name_en text,
  tenant_name_ar text,
  branch_name_en text,
  branch_name_ar text,
  scheduled_at timestamptz,
  procedure_name text,
  expires_at timestamptz,
  reason text
)
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
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz, 'invalid'::text;
    RETURN;
  END IF;

  SELECT tok.id, tok.appointment_id, tok.expires_at
    INTO s
    FROM public.self_checkin_tokens tok
   WHERE tok.token_hash = encode(extensions.digest(convert_to(lower(p_token), 'UTF8'), 'sha256'::text), 'hex')
     AND tok.revoked_at IS NULL
     AND tok.expires_at > now_value
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz, 'invalid'::text;
    RETURN;
  END IF;

  SELECT appt.status,
         appt.scheduled_at,
         appt.deleted_at,
         b.name_en AS branch_name_en,
         b.name_ar AS branch_name_ar,
         t.name AS tenant_name_en,
         t.name_ar AS tenant_name_ar,
         t.is_active AS tenant_is_active,
         t.subscription_status,
         t.subscription_ends_at,
         t.trial_ends_at
    INTO a
    FROM public.appointments appt
    JOIN public.branches b ON b.id = appt.branch_id
    JOIN public.tenants t ON t.id = b.tenant_id
   WHERE appt.id = s.appointment_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz, 'closed'::text;
    RETURN;
  END IF;
  IF a.deleted_at IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz, 'closed'::text;
    RETURN;
  END IF;

  IF NOT a.tenant_is_active
     OR a.subscription_status NOT IN ('active'::public.subscription_status, 'trial'::public.subscription_status)
     OR (a.subscription_ends_at IS NOT NULL AND a.subscription_ends_at <= now_value)
     OR (a.trial_ends_at IS NOT NULL AND a.trial_ends_at <= now_value) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz, 'clinic_unavailable'::text;
    RETURN;
  END IF;

  IF a.scheduled_at < now_value - interval '12 hours'
     OR a.scheduled_at > now_value + interval '3 hours' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz, 'closed'::text;
    RETURN;
  END IF;

  IF a.status NOT IN ('scheduled'::public.appointment_status, 'confirmed'::public.appointment_status) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::timestamptz, 'closed'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true,
                      a.status::text,
                      a.tenant_name_en,
                      a.tenant_name_ar,
                      a.branch_name_en,
                      a.branch_name_ar,
                      a.scheduled_at,
                      NULL::text,
                      s.expires_at,
                      NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.public_self_checkin_details(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_self_checkin_details(text) TO anon, authenticated, service_role;

notify pgrst, 'reload schema';
