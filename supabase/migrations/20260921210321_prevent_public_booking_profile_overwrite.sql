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
BEGIN
  IF NULLIF(trim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'full_name_required'; END IF;
  IF NULLIF(trim(p_phone), '') IS NULL THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF length(trim(p_full_name)) > 160 OR length(trim(p_phone)) > 40 THEN RAISE EXCEPTION 'invalid_booking_input'; END IF;

  v_phone_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF left(v_phone_digits, 1) = '0' THEN v_phone_digits := '2' || v_phone_digits; END IF;
  IF length(v_phone_digits) < 10 OR length(v_phone_digits) > 15 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
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
      first_name_en, first_name_ar, email, phone, referral_source, notes, branch_id, name_language
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

  RETURN v_result - 'appointment_id' - 'patient_id' - 'doctor_id';
END;
$function$;
