-- Defend the currently deployed direct public-booking RPC.
--
-- Production frontend still calls this RPC directly until the Edge gateway
-- frontend cutover. Apply the same abuse limits here so the browser cannot
-- bypass the Edge limiter. service_role bypasses this internal limiter because
-- the Edge gateway already applies limits using the real client IP.

CREATE OR REPLACE FUNCTION public.public_create_booking_for_tenant(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_service_id uuid,
  p_slot_start timestamptz,
  p_full_name text,
  p_phone text,
  p_doctor_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_complaint text DEFAULT NULL,
  p_source text DEFAULT 'public_booking',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_patient_id uuid;
  v_phone_digits text;
  v_phone_canonical text;
  v_is_arabic boolean;
  v_result jsonb;
  v_claims jsonb;
  v_headers jsonb;
  v_jwt_role text;
  v_client_ip text;
  v_ip_key text;
  v_phone_ip_key text;
  v_ip_allowed boolean;
  v_phone_ip_allowed boolean;
BEGIN
  IF NULLIF(trim(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'full_name_required';
  END IF;
  IF NULLIF(trim(p_phone), '') IS NULL THEN
    RAISE EXCEPTION 'phone_required';
  END IF;

  -- Keep direct Data API calls inside the same input envelope as the Edge
  -- gateway. This prevents oversized payloads from bypassing Edge validation.
  IF length(trim(p_full_name)) > 160
     OR length(trim(p_phone)) > 40
     OR length(COALESCE(trim(p_email), '')) > 254
     OR length(COALESCE(trim(p_complaint), '')) > 2000
     OR length(COALESCE(trim(p_source), '')) > 100
     OR octet_length(COALESCE(p_metadata, '{}'::jsonb)::text) > 8192
  THEN
    RAISE EXCEPTION 'invalid_booking_input';
  END IF;

  v_phone_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF left(v_phone_digits, 1) = '0' THEN
    v_phone_digits := '2' || v_phone_digits;
  END IF;
  IF length(v_phone_digits) < 10 OR length(v_phone_digits) > 15 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  -- PostgREST exposes JWT claims and request headers through transaction-local
  -- settings. Only direct anon/authenticated API calls are throttled here.
  -- service_role/internal calls are handled by their own trusted gateway.
  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_claims := '{}'::jsonb;
  END;
  v_jwt_role := COALESCE(v_claims->>'role', '');

  IF v_jwt_role IN ('anon', 'authenticated') THEN
    BEGIN
      v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_headers := '{}'::jsonb;
    END;

    v_client_ip := COALESCE(
      NULLIF(trim(split_part(COALESCE(v_headers->>'cf-connecting-ip', ''), ',', 1)), ''),
      NULLIF(trim(split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1)), ''),
      'unknown'
    );

    v_ip_key := encode(
      extensions.digest(
        convert_to(
          'public-booking:ip:' || p_tenant_id::text || ':' || v_client_ip,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    v_phone_ip_key := encode(
      extensions.digest(
        convert_to(
          'public-booking:phone-ip:' || p_tenant_id::text || ':' ||
          v_phone_digits || ':' || v_client_ip,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    v_ip_allowed := public.consume_public_booking_rate_limit(v_ip_key, 20, 3600);
    v_phone_ip_allowed := public.consume_public_booking_rate_limit(v_phone_ip_key, 6, 21600);

    IF v_ip_allowed IS DISTINCT FROM true
       OR v_phone_ip_allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = p_service_id
      AND s.tenant_id = p_tenant_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND s.available_online = true
  ) THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;

  v_phone_canonical := '+' || v_phone_digits;
  v_is_arabic := p_full_name ~ '[؀-ۿ]';

  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE branch_id = p_branch_id
    AND deleted_at IS NULL
    AND public.normalize_phone_digits(phone) = v_phone_digits
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    INSERT INTO public.patients (
      first_name_en, first_name_ar, email, phone, referral_source, notes,
      branch_id, name_language
    )
    VALUES (
      trim(p_full_name),
      CASE WHEN v_is_arabic THEN trim(p_full_name) ELSE NULL END,
      NULLIF(trim(p_email), ''),
      v_phone_canonical,
      NULLIF(trim(p_source), ''),
      NULLIF(trim(p_complaint), ''),
      p_branch_id,
      CASE WHEN v_is_arabic THEN 'ar' ELSE 'en' END
    )
    RETURNING id INTO v_patient_id;
  END IF;

  v_result := public._create_booking_for_patient(
    p_tenant_id, p_branch_id, p_service_id, p_slot_start, v_patient_id,
    p_doctor_id, p_complaint, p_source,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'public_name', trim(p_full_name),
      'public_email', NULLIF(trim(p_email), ''),
      'phone_digits', v_phone_digits
    )
  );

  RETURN v_result
    - 'appointment_id'
    - 'patient_id'
    - 'doctor_id';
END;
$function$;

-- Preserve the current public cutover state: anonymous direct booking remains
-- available for the deployed frontend, while signed-in users do not need it.
REVOKE ALL ON FUNCTION public.public_create_booking_for_tenant(
  uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.public_create_booking_for_tenant(
  uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb
) TO anon, service_role;
