-- Public patient booking foundation for ZMedico.
-- Anonymous clients never receive direct INSERT/SELECT access to patients or appointments.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_source text,
  ADD COLUMN IF NOT EXISTS public_booking_reference text,
  ADD COLUMN IF NOT EXISTS public_booking_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_booking_metadata jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_public_booking_reference_uidx
  ON public.appointments(public_booking_reference)
  WHERE public_booking_reference IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.public_booking_reference_seq START 1;

CREATE OR REPLACE FUNCTION public.public_booking_options()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'branches', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'name_en', b.name_en,
          'name_ar', b.name_ar,
          'address', b.address,
          'phone', b.phone,
          'city', b.city,
          'working_hours_start', b.working_hours_start,
          'working_hours_end', b.working_hours_end,
          'working_days', b.working_days,
          'max_future_booking_days', COALESCE(s.max_future_booking_days, 30),
          'min_advance_booking_hours', COALESCE(s.min_advance_booking_hours, 1),
          'slot_duration_minutes', COALESCE(s.slot_duration_minutes, 30),
          'require_confirmation', COALESCE(s.require_confirmation, false)
        ) ORDER BY b.name_en
      )
      FROM public.branches b
      LEFT JOIN public.appointment_settings s ON s.branch_id = b.id
      WHERE b.is_active = true
        AND COALESCE(s.allow_online_booking, true) = true
    ), '[]'::jsonb),
    'services', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name_en', s.name_en,
          'name_ar', s.name_ar,
          'duration_minutes', s.default_duration_minutes,
          'source', 'service'
        ) ORDER BY COALESCE(s.display_order, 0), s.name_en
      )
      FROM public.services s
      WHERE s.is_active = true
        AND s.deleted_at IS NULL
        AND s.available_online = true
    ), '[]'::jsonb),
    'procedures', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name_en', p.name_en,
          'name_ar', p.name_ar,
          'duration_minutes', COALESCE(p.default_duration, 30),
          'source', 'procedure'
        ) ORDER BY p.name_en
      )
      FROM public.procedures p
      WHERE p.is_active = true
        AND p.deleted_at IS NULL
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'full_name_en', p.full_name_en,
          'full_name_ar', p.full_name_ar
        ) ORDER BY COALESCE(p.full_name_en, p.full_name)
      )
      FROM public.profiles p
      WHERE EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = p.id
          AND ur.role = 'doctor'::public.app_role
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.staff_profiles sp
        WHERE sp.linked_user_id = p.id
          AND sp.deleted_at IS NULL
          AND sp.status IS NOT NULL
          AND sp.status::text NOT IN ('active', 'on_leave')
      )
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.public_booking_slots(
  p_branch_id uuid,
  p_service_id uuid,
  p_date date,
  p_doctor_id uuid DEFAULT NULL
)
RETURNS TABLE(slot_start timestamptz, slot_end timestamptz, available boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.appointment_settings%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_duration integer;
  v_service_name text;
  v_start timestamp;
  v_end timestamp;
  v_slot timestamp;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_slot_end timestamptz;
  v_count integer;
BEGIN
  SELECT * INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id AND is_active = true;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_settings
  FROM public.appointment_settings
  WHERE branch_id = p_branch_id
  LIMIT 1;

  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RETURN; END IF;
  IF p_date < CURRENT_DATE THEN RETURN; END IF;
  IF p_date > CURRENT_DATE + COALESCE(v_settings.max_future_booking_days, 30) THEN RETURN; END IF;
  IF NOT (EXTRACT(DOW FROM p_date)::integer = ANY(COALESCE(v_branch.working_days, ARRAY[0,1,2,3,4,5,6]))) THEN RETURN; END IF;

  v_duration := COALESCE(v_settings.slot_duration_minutes, 30);
  SELECT s.default_duration_minutes, s.name_en
    INTO v_duration, v_service_name
  FROM public.services s
  WHERE s.id = p_service_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND s.available_online = true
  LIMIT 1;

  IF v_service_name IS NULL THEN
    SELECT COALESCE(p.default_duration, v_duration), p.name_en
      INTO v_duration, v_service_name
    FROM public.procedures p
    WHERE p.id = p_service_id
      AND p.is_active = true
      AND p.deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_service_name IS NULL THEN RETURN; END IF;

  v_start := p_date + COALESCE(v_branch.working_hours_start, '09:00'::time);
  v_end := p_date + COALESCE(v_branch.working_hours_end, '21:00'::time);
  v_start_at := v_start AT TIME ZONE 'Africa/Cairo';
  v_end_at := v_end AT TIME ZONE 'Africa/Cairo';

  FOR v_slot IN
    SELECT gs
    FROM generate_series(
      v_start,
      v_end - make_interval(mins => v_duration),
      make_interval(mins => COALESCE(v_settings.slot_duration_minutes, 30) + COALESCE(v_settings.buffer_minutes, 0))
    ) gs
  LOOP
    slot_start := v_slot AT TIME ZONE 'Africa/Cairo';
    v_slot_end := slot_start + make_interval(mins => v_duration);
    slot_end := v_slot_end;

    SELECT count(*)::integer INTO v_count
    FROM public.appointments a
    WHERE a.branch_id = p_branch_id
      AND a.deleted_at IS NULL
      AND a.status::text NOT IN ('cancelled', 'no_show')
      AND a.scheduled_at < v_slot_end
      AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id);

    available := slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1))
      AND v_count < COALESCE(v_settings.max_appointments_per_slot, 1);
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_create_booking(
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
SET search_path = public
AS $$
DECLARE
  v_branch public.branches%ROWTYPE;
  v_settings public.appointment_settings%ROWTYPE;
  v_patient_id uuid;
  v_appointment_id uuid;
  v_status public.appointment_status;
  v_duration integer;
  v_service_name text;
  v_phone_digits text;
  v_phone_canonical text;
  v_reference text;
  v_is_arabic boolean;
BEGIN
  IF NULLIF(trim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'full_name_required'; END IF;
  IF NULLIF(trim(p_phone), '') IS NULL THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF length(trim(p_full_name)) > 160 OR length(trim(p_phone)) > 40 THEN RAISE EXCEPTION 'invalid_booking_input'; END IF;

  v_phone_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF left(v_phone_digits, 1) = '0' THEN v_phone_digits := '2' || v_phone_digits; END IF;
  IF length(v_phone_digits) < 10 OR length(v_phone_digits) > 15 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  v_phone_canonical := '+' || v_phone_digits;
  v_is_arabic := p_full_name ~ '[\u0600-\u06FF]';

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch_unavailable'; END IF;

  SELECT * INTO v_settings FROM public.appointment_settings WHERE branch_id = p_branch_id LIMIT 1;
  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RAISE EXCEPTION 'online_booking_disabled'; END IF;

  SELECT s.default_duration_minutes, s.name_en
    INTO v_duration, v_service_name
  FROM public.services s
  WHERE s.id = p_service_id AND s.is_active = true AND s.deleted_at IS NULL AND s.available_online = true
  LIMIT 1;
  IF v_service_name IS NULL THEN
    SELECT COALESCE(p.default_duration, COALESCE(v_settings.slot_duration_minutes, 30)), p.name_en
      INTO v_duration, v_service_name
    FROM public.procedures p
    WHERE p.id = p_service_id AND p.is_active = true AND p.deleted_at IS NULL
    LIMIT 1;
  END IF;
  IF v_service_name IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.public_booking_slots(p_branch_id, p_service_id, (p_slot_start AT TIME ZONE 'Africa/Cairo')::date, p_doctor_id)
    WHERE slot_start = p_slot_start AND available = true
  ) THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE deleted_at IS NULL
    AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    INSERT INTO public.patients (
      first_name_en, first_name_ar, email, phone, referral_source, notes, branch_id, name_language
    ) VALUES (
      trim(p_full_name), CASE WHEN v_is_arabic THEN trim(p_full_name) ELSE NULL END,
      NULLIF(trim(p_email), ''), v_phone_canonical, NULLIF(trim(p_source), ''),
      NULLIF(trim(p_complaint), ''), p_branch_id, CASE WHEN v_is_arabic THEN 'ar' ELSE 'en' END
    ) RETURNING id INTO v_patient_id;
  ELSE
    UPDATE public.patients
    SET email = COALESCE(NULLIF(trim(p_email), ''), email),
        branch_id = COALESCE(branch_id, p_branch_id),
        updated_at = now()
    WHERE id = v_patient_id;
  END IF;

  v_status := CASE WHEN COALESCE(v_settings.require_confirmation, false) THEN 'scheduled'::public.appointment_status ELSE 'confirmed'::public.appointment_status END;
  v_reference := 'BZ-' || to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY') || '-' || lpad(nextval('public.public_booking_reference_seq')::text, 6, '0');

  INSERT INTO public.appointments (
    patient_id, doctor_id, branch_id, scheduled_at, duration_minutes, status, procedure, notes,
    booking_source, public_booking_reference, public_booking_created_at, public_booking_metadata
  ) VALUES (
    v_patient_id, p_doctor_id, p_branch_id, p_slot_start, v_duration, v_status, v_service_name,
    NULLIF(trim(p_complaint), ''), NULLIF(trim(p_source), 'public_booking'), v_reference, now(),
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('public_name', trim(p_full_name), 'phone_digits', v_phone_digits)
  ) RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object(
    'booking_reference', v_reference,
    'appointment_id', v_appointment_id,
    'patient_id', v_patient_id,
    'scheduled_at', p_slot_start,
    'status', v_status,
    'service_name', v_service_name,
    'branch_name_en', v_branch.name_en,
    'branch_name_ar', v_branch.name_ar
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_booking_options() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_create_booking(uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_options() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_create_booking(uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb) TO anon, authenticated;
