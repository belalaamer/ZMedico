-- Public booking is intentionally service-only.
-- Procedures are clinical actions recorded after attendance and must not be exposed
-- or accepted by anonymous booking or the patient portal.
-- Keep the legacy "procedures" response key as an empty array for older clients.

CREATE OR REPLACE FUNCTION public.public_booking_options_for_tenant(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'tenant_id', t.id,
    'tenant_name', COALESCE(t.name_en, t.name_ar, t.name),
    'tenant_name_en', t.name_en,
    'tenant_name_ar', t.name_ar,
    'tenant_slug', t.slug,
    'branches', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name_en', b.name_en, 'name_ar', b.name_ar, 'address', b.address, 'phone', b.phone, 'city', b.city, 'working_hours_start', b.working_hours_start, 'working_hours_end', b.working_hours_end, 'working_days', b.working_days, 'max_future_booking_days', COALESCE(s.max_future_booking_days, 30), 'min_advance_booking_hours', COALESCE(s.min_advance_booking_hours, 1), 'slot_duration_minutes', COALESCE(s.slot_duration_minutes, 30), 'require_confirmation', COALESCE(s.require_confirmation, false)) ORDER BY b.name_en) FROM public.branches b LEFT JOIN public.appointment_settings s ON s.branch_id = b.id WHERE b.tenant_id = t.id AND b.is_active = true AND COALESCE(s.allow_online_booking, true) = true), '[]'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name_en', s.name_en, 'name_ar', s.name_ar, 'duration_minutes', s.default_duration_minutes, 'price', s.default_price, 'description_en', s.description_en, 'description_ar', s.description_ar, 'source', 'service') ORDER BY COALESCE(s.display_order, 0), s.name_en) FROM public.services s WHERE s.tenant_id = t.id AND s.is_active = true AND s.deleted_at IS NULL AND s.available_online = true), '[]'::jsonb),
    'procedures', '[]'::jsonb,
    'doctors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name, 'full_name_en', pr.full_name_en, 'full_name_ar', pr.full_name_ar) ORDER BY COALESCE(pr.full_name_en, pr.full_name)) FROM public.profiles pr WHERE EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff_branches sb ON sb.user_id = ur.user_id JOIN public.branches b ON b.id = sb.branch_id WHERE ur.user_id = pr.id AND ur.role = 'doctor'::public.app_role AND b.tenant_id = t.id)), '[]'::jsonb)
  )
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND public.tenant_has_active_subscription(t.id);
$function$;

CREATE OR REPLACE FUNCTION public.public_booking_slots_for_tenant(p_tenant_id uuid, p_branch_id uuid, p_service_id uuid, p_date date, p_doctor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot_start timestamp with time zone, slot_end timestamp with time zone, available boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.appointment_settings%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_duration integer;
  v_service_name text;
  v_service_kind text := 'service';
  v_start timestamp;
  v_end timestamp;
  v_slot timestamp;
  v_slot_end timestamptz;
  v_count integer;
  v_resource_count integer;
  v_resource public.booking_resources%ROWTYPE;
  v_has_doctor_assignments boolean := false;
  v_doctor_available boolean;
  v_resource_available boolean;
BEGIN
  SELECT * INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND OR NOT public.tenant_has_active_subscription(p_tenant_id) THEN RETURN; END IF;

  SELECT * INTO v_settings
  FROM public.appointment_settings
  WHERE branch_id = p_branch_id
  LIMIT 1;

  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RETURN; END IF;
  IF p_date < (now() AT TIME ZONE 'Africa/Cairo')::date
     OR p_date > (now() AT TIME ZONE 'Africa/Cairo')::date + COALESCE(v_settings.max_future_booking_days, 30) THEN RETURN; END IF;
  IF NOT (EXTRACT(DOW FROM p_date)::integer = ANY(COALESCE(v_branch.working_days, ARRAY[0,1,2,3,4,5,6]))) THEN RETURN; END IF;

  SELECT s.default_duration_minutes, s.name_en
    INTO v_duration, v_service_name
  FROM public.services s
  WHERE s.id = p_service_id
    AND s.tenant_id = p_tenant_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND s.available_online = true
  LIMIT 1;

  IF v_service_name IS NULL THEN RETURN; END IF;

  IF p_doctor_id IS NOT NULL
     AND NOT public.doctor_service_assignment_allowed(p_doctor_id, p_branch_id, p_service_id, v_service_kind) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.doctor_service_assignments dsa
    WHERE dsa.branch_id = p_branch_id
      AND dsa.service_id = p_service_id
      AND dsa.service_kind = v_service_kind
  ) INTO v_has_doctor_assignments;

  SELECT count(*)::integer INTO v_resource_count
  FROM public.booking_resources r
  WHERE r.branch_id = p_branch_id AND r.is_active = true;

  v_duration := GREATEST(COALESCE(v_duration, COALESCE(v_settings.slot_duration_minutes, 30)), 5);
  v_start := p_date + COALESCE(v_branch.working_hours_start, '09:00'::time);
  v_end := p_date + COALESCE(v_branch.working_hours_end, '21:00'::time);

  -- The step is the selected service duration, not the branch default slot
  -- duration. This prevents a 45-minute branch setting from forcing every
  -- service to appear at 45-minute increments.
  FOR v_slot IN
    SELECT gs
    FROM generate_series(
      v_start,
      v_end - make_interval(mins => v_duration),
      make_interval(mins => v_duration + GREATEST(COALESCE(v_settings.buffer_minutes, 0), 0))
    ) gs
  LOOP
    slot_start := v_slot AT TIME ZONE 'Africa/Cairo';
    v_slot_end := slot_start + make_interval(mins => v_duration);
    slot_end := v_slot_end;

    v_doctor_available := true;
    IF p_doctor_id IS NOT NULL THEN
      SELECT count(*)::integer INTO v_count
      FROM public.appointments a
      WHERE a.branch_id = p_branch_id
        AND a.doctor_id = p_doctor_id
        AND a.deleted_at IS NULL
        AND a.status::text NOT IN ('cancelled', 'no_show')
        AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
        AND a.scheduled_at < v_slot_end
        AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
      v_doctor_available := v_count = 0;
    ELSIF v_has_doctor_assignments THEN
      -- Any available doctor means any doctor explicitly assigned to this
      -- service, not an unassigned doctor from the whole branch.
      SELECT EXISTS (
        SELECT 1
        FROM public.doctor_service_assignments dsa
        JOIN public.staff_branches sb ON sb.user_id = dsa.doctor_id AND sb.branch_id = p_branch_id
        JOIN public.user_roles ur ON ur.user_id = dsa.doctor_id AND ur.role = 'doctor'::public.app_role
        WHERE dsa.branch_id = p_branch_id
          AND dsa.service_id = p_service_id
          AND dsa.service_kind = v_service_kind
          AND NOT EXISTS (
            SELECT 1
            FROM public.appointments a
            WHERE a.branch_id = p_branch_id
              AND a.doctor_id = dsa.doctor_id
              AND a.deleted_at IS NULL
              AND a.status::text NOT IN ('cancelled', 'no_show')
              AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
              AND a.scheduled_at < v_slot_end
              AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start
          )
      ) INTO v_doctor_available;
    END IF;

    v_resource_available := true;
    IF v_resource_count > 0 THEN
      v_resource_available := false;
      FOR v_resource IN
        SELECT r.*
        FROM public.booking_resources r
        WHERE r.branch_id = p_branch_id
          AND r.is_active = true
          AND public.booking_resource_is_eligible(r.id, p_service_id, v_service_kind)
        ORDER BY r.display_order, r.name_en, r.id
      LOOP
        SELECT count(*)::integer INTO v_count
        FROM public.appointments a
        WHERE a.branch_id = p_branch_id
          AND (a.resource_id = v_resource.id OR (a.resource_id IS NULL AND lower(trim(COALESCE(a.room, ''))) IN (lower(v_resource.name_en), lower(v_resource.name_ar))))
          AND a.deleted_at IS NULL
          AND a.status::text NOT IN ('cancelled', 'no_show')
          AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
          AND a.scheduled_at < v_slot_end
          AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
        IF v_count < v_resource.capacity THEN
          v_resource_available := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF v_resource_count > 0 THEN
      available := v_doctor_available
        AND v_resource_available
        AND slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1));
    ELSIF v_has_doctor_assignments OR p_doctor_id IS NOT NULL THEN
      available := v_doctor_available
        AND slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1));
    ELSE
      SELECT count(*)::integer INTO v_count
      FROM public.appointments a
      WHERE a.branch_id = p_branch_id
        AND a.deleted_at IS NULL
        AND a.status::text NOT IN ('cancelled', 'no_show')
        AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
        AND a.scheduled_at < v_slot_end
        AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
      available := slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1))
        AND v_count < COALESCE(v_settings.max_appointments_per_slot, 1);
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public._create_booking_for_patient(p_tenant_id uuid, p_branch_id uuid, p_service_id uuid, p_slot_start timestamp with time zone, p_patient_id uuid, p_doctor_id uuid DEFAULT NULL::uuid, p_complaint text DEFAULT NULL::text, p_source text DEFAULT 'public_booking'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_branch public.branches%ROWTYPE;
  v_settings public.appointment_settings%ROWTYPE;
  v_appointment_id uuid;
  v_status public.appointment_status;
  v_booking_request_status text;
  v_booking_request_expires_at timestamptz;
  v_duration integer;
  v_service_name text;
  v_service_name_ar text;
  v_service_kind text := 'service';
  v_effective_doctor_id uuid := p_doctor_id;
  v_has_doctor_assignments boolean := false;
  v_reference text;
  v_resource public.booking_resources%ROWTYPE;
  v_resource_count integer;
  v_count integer;
  v_candidate_doctor_id uuid;
BEGIN
  IF NOT public.tenant_has_active_subscription(p_tenant_id) THEN RAISE EXCEPTION 'tenant_subscription_inactive'; END IF;

  SELECT * INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch_unavailable'; END IF;

  SELECT * INTO v_settings FROM public.appointment_settings WHERE branch_id = p_branch_id LIMIT 1;
  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RAISE EXCEPTION 'online_booking_disabled'; END IF;

  SELECT s.default_duration_minutes, s.name_en, s.name_ar
    INTO v_duration, v_service_name, v_service_name_ar
  FROM public.services s
  WHERE s.id = p_service_id AND s.tenant_id = p_tenant_id AND s.is_active = true AND s.deleted_at IS NULL AND s.available_online = true
  LIMIT 1;
  IF v_service_name IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;
  v_duration := GREATEST(COALESCE(v_duration, COALESCE(v_settings.slot_duration_minutes, 30)), 5);

  IF p_doctor_id IS NOT NULL AND NOT public.doctor_service_assignment_allowed(p_doctor_id, p_branch_id, p_service_id, v_service_kind) THEN
    RAISE EXCEPTION 'doctor_unavailable';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_branch_id::text || ':' || p_slot_start::text || ':' || p_service_id::text, 0));

  SELECT EXISTS (
    SELECT 1 FROM public.doctor_service_assignments dsa
    WHERE dsa.branch_id = p_branch_id AND dsa.service_id = p_service_id AND dsa.service_kind = v_service_kind
  ) INTO v_has_doctor_assignments;

  IF p_doctor_id IS NULL AND v_has_doctor_assignments THEN
    FOR v_candidate_doctor_id IN
      SELECT dsa.doctor_id
      FROM public.doctor_service_assignments dsa
      JOIN public.staff_branches sb ON sb.user_id = dsa.doctor_id AND sb.branch_id = p_branch_id
      JOIN public.user_roles ur ON ur.user_id = dsa.doctor_id AND ur.role = 'doctor'::public.app_role
      WHERE dsa.branch_id = p_branch_id AND dsa.service_id = p_service_id AND dsa.service_kind = v_service_kind
      ORDER BY dsa.doctor_id
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.public_booking_slots_for_tenant(
          p_tenant_id, p_branch_id, p_service_id, (p_slot_start AT TIME ZONE 'Africa/Cairo')::date, v_candidate_doctor_id
        ) WHERE slot_start = p_slot_start AND available = true
      ) THEN
        v_effective_doctor_id := v_candidate_doctor_id;
        EXIT;
      END IF;
    END LOOP;
    IF v_effective_doctor_id IS NULL THEN RAISE EXCEPTION 'slot_unavailable'; END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.public_booking_slots_for_tenant(
      p_tenant_id, p_branch_id, p_service_id, (p_slot_start AT TIME ZONE 'Africa/Cairo')::date, v_effective_doctor_id
    ) WHERE slot_start = p_slot_start AND available = true
  ) THEN RAISE EXCEPTION 'slot_unavailable'; END IF;

  SELECT count(*)::integer INTO v_resource_count
  FROM public.booking_resources r WHERE r.branch_id = p_branch_id AND r.is_active = true;
  IF v_resource_count > 0 THEN
    FOR v_resource IN
      SELECT r.* FROM public.booking_resources r
      WHERE r.branch_id = p_branch_id AND r.is_active = true
        AND public.booking_resource_is_eligible(r.id, p_service_id, v_service_kind)
      ORDER BY r.display_order, r.name_en, r.id
    LOOP
      SELECT count(*)::integer INTO v_count
      FROM public.appointments a
      WHERE a.branch_id = p_branch_id
        AND (a.resource_id = v_resource.id OR (a.resource_id IS NULL AND lower(trim(COALESCE(a.room, ''))) IN (lower(v_resource.name_en), lower(v_resource.name_ar))))
        AND a.deleted_at IS NULL
        AND a.status::text NOT IN ('cancelled', 'no_show')
        AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
        AND a.scheduled_at < p_slot_start + make_interval(mins => v_duration)
        AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > p_slot_start;
      IF v_count < v_resource.capacity THEN EXIT; END IF;
      v_resource.id := NULL;
    END LOOP;
    IF v_resource.id IS NULL THEN RAISE EXCEPTION 'slot_unavailable'; END IF;
  END IF;

  v_status := CASE WHEN COALESCE(v_settings.require_confirmation, true)
    THEN 'scheduled'::public.appointment_status ELSE 'confirmed'::public.appointment_status END;

  IF v_status = 'scheduled'::public.appointment_status THEN
    v_booking_request_status := 'pending';
    v_booking_request_expires_at := now() + make_interval(mins => COALESCE(v_settings.booking_request_hold_minutes, 15));
  ELSE
    v_booking_request_status := 'not_applicable';
    v_booking_request_expires_at := NULL;
  END IF;

  v_reference := 'BZ-' || to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY') || '-' || lpad(nextval('public.public_booking_reference_seq')::text, 6, '0');
  INSERT INTO public.appointments (
    patient_id, doctor_id, branch_id, resource_id, room, scheduled_at, duration_minutes,
    status, procedure, notes, booking_source, public_booking_reference,
    public_booking_created_at, public_booking_metadata,
    booking_request_status, booking_request_expires_at
  ) VALUES (
    p_patient_id, v_effective_doctor_id, p_branch_id, v_resource.id,
    NULLIF(COALESCE(v_resource.name_en, ''), ''), p_slot_start, v_duration, v_status,
    v_service_name, NULLIF(trim(coalesce(p_complaint,'')), ''), NULLIF(trim(coalesce(p_source,'')), ''),
    v_reference, now(), COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'resource_name_en', v_resource.name_en, 'resource_name_ar', v_resource.name_ar
    ),
    v_booking_request_status, v_booking_request_expires_at
  ) RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object(
    'booking_reference', v_reference, 'appointment_id', v_appointment_id, 'patient_id', p_patient_id,
    'scheduled_at', p_slot_start, 'status', v_status, 'service_name_en', v_service_name,
    'service_name_ar', COALESCE(v_service_name_ar, v_service_name),
    'branch_name_en', v_branch.name_en, 'branch_name_ar', v_branch.name_ar,
    'doctor_id', v_effective_doctor_id,
    'resource_name_en', v_resource.name_en, 'resource_name_ar', v_resource.name_ar,
    'booking_request_status', v_booking_request_status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.public_create_booking_for_tenant(p_tenant_id uuid, p_branch_id uuid, p_service_id uuid, p_slot_start timestamp with time zone, p_full_name text, p_phone text, p_doctor_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text, p_complaint text DEFAULT NULL::text, p_source text DEFAULT 'public_booking'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
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

  RETURN v_result
    - 'appointment_id'
    - 'patient_id'
    - 'doctor_id';
END;
$function$;

CREATE OR REPLACE FUNCTION public.patient_portal_create_booking(p_service_id uuid, p_slot_start timestamp with time zone, p_doctor_id uuid DEFAULT NULL::uuid, p_complaint text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account public.patient_portal_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_account
  FROM public.patient_portal_accounts
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND OR v_account.status IS DISTINCT FROM 'active' OR v_account.portal_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'portal_account_inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = p_service_id
      AND s.tenant_id = v_account.tenant_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND s.available_online = true
  ) THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;

  RETURN public._create_booking_for_patient(
    v_account.tenant_id, v_account.branch_id, p_service_id, p_slot_start, v_account.patient_id,
    p_doctor_id, p_complaint, 'patient_portal', COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$function$;
