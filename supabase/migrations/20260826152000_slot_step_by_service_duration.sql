CREATE OR REPLACE FUNCTION public.public_booking_slots_for_tenant(
  p_tenant_id uuid, p_branch_id uuid, p_service_id uuid, p_date date, p_doctor_id uuid DEFAULT NULL
)
RETURNS TABLE(slot_start timestamptz, slot_end timestamptz, available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
  SELECT * INTO v_branch FROM public.branches
  WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND OR NOT public.tenant_has_active_subscription(p_tenant_id) THEN RETURN; END IF;

  IF p_doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff_branches sb JOIN public.user_roles ur ON ur.user_id = sb.user_id
    WHERE sb.branch_id = p_branch_id AND sb.user_id = p_doctor_id AND ur.role = 'doctor'::public.app_role
  ) THEN RETURN; END IF;

  SELECT * INTO v_settings FROM public.appointment_settings WHERE branch_id = p_branch_id LIMIT 1;
  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RETURN; END IF;
  IF p_date < CURRENT_DATE OR p_date > CURRENT_DATE + COALESCE(v_settings.max_future_booking_days, 30) THEN RETURN; END IF;
  IF NOT (EXTRACT(DOW FROM p_date)::integer = ANY(COALESCE(v_branch.working_days, ARRAY[0,1,2,3,4,5,6]))) THEN RETURN; END IF;

  v_duration := COALESCE(v_settings.slot_duration_minutes, 30);
  SELECT s.default_duration_minutes, s.name_en INTO v_duration, v_service_name
  FROM public.services s
  WHERE s.id = p_service_id AND s.tenant_id = p_tenant_id AND s.is_active = true
    AND s.deleted_at IS NULL AND s.available_online = true LIMIT 1;
  IF v_service_name IS NULL THEN
    v_service_kind := 'procedure';
    SELECT COALESCE(p.default_duration, v_duration), p.name_en INTO v_duration, v_service_name
    FROM public.procedures p WHERE p.id = p_service_id AND p.is_active = true AND p.deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_service_name IS NULL THEN RETURN; END IF;

  SELECT count(*)::integer INTO v_resource_count
  FROM public.booking_resources r WHERE r.branch_id = p_branch_id AND r.is_active = true;

  v_start := p_date + COALESCE(v_branch.working_hours_start, '09:00'::time);
  v_end := p_date + COALESCE(v_branch.working_hours_end, '21:00'::time);

  -- Each service gets its own cadence: duration + branch buffer.
  -- Example: a 30-minute service with no buffer yields 09:00, 09:30, 10:00.
  FOR v_slot IN SELECT gs FROM generate_series(
    v_start,
    v_end - make_interval(mins => v_duration),
    make_interval(mins => v_duration + COALESCE(v_settings.buffer_minutes, 0))
  ) gs LOOP
    slot_start := v_slot AT TIME ZONE 'Africa/Cairo';
    v_slot_end := slot_start + make_interval(mins => v_duration);
    slot_end := v_slot_end;
    available := false;

    IF p_doctor_id IS NOT NULL THEN
      SELECT count(*)::integer INTO v_count FROM public.appointments a
      WHERE a.branch_id = p_branch_id AND a.doctor_id = p_doctor_id
        AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show')
        AND a.scheduled_at < v_slot_end
        AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
      IF v_count > 0 THEN
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;

    IF v_resource_count > 0 THEN
      FOR v_resource IN
        SELECT r.* FROM public.booking_resources r
        WHERE r.branch_id = p_branch_id AND r.is_active = true
          AND public.booking_resource_is_eligible(r.id, p_service_id, v_service_kind)
        ORDER BY r.display_order, r.name_en
      LOOP
        SELECT count(*)::integer INTO v_count FROM public.appointments a
        WHERE a.branch_id = p_branch_id AND a.resource_id = v_resource.id
          AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show')
          AND a.scheduled_at < v_slot_end
          AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
        IF v_count < v_resource.capacity THEN
          available := slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1));
          EXIT;
        END IF;
      END LOOP;
    ELSE
      SELECT count(*)::integer INTO v_count FROM public.appointments a
      WHERE a.branch_id = p_branch_id AND a.deleted_at IS NULL
        AND a.status::text NOT IN ('cancelled','no_show')
        AND a.scheduled_at < v_slot_end
        AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start
        AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id);
      available := slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1))
        AND v_count < COALESCE(v_settings.max_appointments_per_slot, 1);
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;
