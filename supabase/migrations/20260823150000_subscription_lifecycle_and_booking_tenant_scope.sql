-- Subscription lifecycle, platform plan management, and tenant-scoped public booking.
-- This migration is additive and fails closed for legacy unscoped public booking RPCs.

CREATE TABLE IF NOT EXISTS public.subscription_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  new_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  previous_status public.subscription_status,
  new_status public.subscription_status NOT NULL,
  previous_period_end timestamptz,
  new_period_end timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_change_log_tenant_idx
  ON public.subscription_change_log(tenant_id, created_at DESC);

ALTER TABLE public.subscription_change_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_change_log FROM anon;
GRANT SELECT ON public.subscription_change_log TO authenticated;
GRANT ALL ON public.subscription_change_log TO service_role;
DROP POLICY IF EXISTS subscription_change_log_system_owner_read ON public.subscription_change_log;
CREATE POLICY subscription_change_log_system_owner_read
  ON public.subscription_change_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role));

CREATE OR REPLACE FUNCTION public.tenant_has_active_subscription(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = _tenant_id
      AND t.is_active = true
      AND (
        (
          t.subscription_status = 'active'::public.subscription_status
          AND (t.subscription_ends_at IS NULL OR t.subscription_ends_at > now())
        )
        OR (
          t.subscription_status = 'trial'::public.subscription_status
          AND t.trial_ends_at IS NOT NULL
          AND t.trial_ends_at > now()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.tenant_has_active_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_has_active_subscription(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.tenant_subscription_snapshot(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tenant_id', t.id,
    'tenant_name', t.name,
    'tenant_slug', t.slug,
    'plan_id', COALESCE(t.plan_id, s.plan_id),
    'plan_name_ar', p.name_ar,
    'plan_name_en', p.name_en,
    'plan_features', COALESCE(p.features, '{}'::jsonb),
    'max_branches', p.max_branches,
    'max_staff', p.max_staff,
    'max_patients', p.max_patients,
    'max_invoices_monthly', p.max_invoices_monthly,
    'subscription_status', t.subscription_status::text,
    'billing_cycle', s.billing_cycle::text,
    'trial_ends_at', t.trial_ends_at,
    'subscription_ends_at', t.subscription_ends_at,
    'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end,
    'is_active', t.is_active,
    'access_allowed', public.tenant_has_active_subscription(t.id),
    'access_reason', CASE
      WHEN NOT t.is_active THEN 'tenant_inactive'
      WHEN t.subscription_status IN ('cancelled','expired') THEN 'subscription_expired'
      WHEN t.subscription_status = 'past_due' THEN 'subscription_past_due'
      WHEN t.subscription_status = 'trial' AND (t.trial_ends_at IS NULL OR t.trial_ends_at <= now()) THEN 'trial_expired'
      WHEN t.subscription_status = 'active' AND t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at <= now() THEN 'subscription_expired'
      WHEN COALESCE(t.plan_id, s.plan_id) IS NULL THEN 'plan_required'
      ELSE 'active'
    END
  )
  FROM public.tenants t
  LEFT JOIN LATERAL (
    SELECT sub.*
    FROM public.subscriptions sub
    WHERE sub.tenant_id = t.id
    ORDER BY sub.created_at DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN public.subscription_plans p
    ON p.id = COALESCE(t.plan_id, s.plan_id)
  WHERE t.id = _tenant_id;
$$;

REVOKE ALL ON FUNCTION public.tenant_subscription_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_subscription_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tenant_subscription_for_branch(_branch_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.tenant_subscription_snapshot(b.tenant_id)
  FROM public.branches b
  WHERE b.id = _branch_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.tenant_subscription_for_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_subscription_for_branch(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_branch_access(_branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _branch IS NULL
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.staff_branches sb
      JOIN public.branches b ON b.id = sb.branch_id
      WHERE sb.user_id = auth.uid()
        AND sb.branch_id = _branch
        AND public.tenant_has_active_subscription(b.tenant_id)
    );
$$;

-- Platform-only subscription update. The browser supplies no owner identity or
-- service credentials; the RPC derives the actor from auth.uid().
CREATE OR REPLACE FUNCTION public.platform_update_tenant_subscription(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_plan_id uuid;
  v_status public.subscription_status;
  v_cycle public.billing_cycle;
  v_duration_days integer;
  v_period_end timestamptz;
  v_trial_end timestamptz;
  v_tenant public.tenants%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_subscription_id uuid;
  v_previous_plan uuid;
  v_previous_status public.subscription_status;
  v_previous_period_end timestamptz;
BEGIN
  IF NOT (
    public.has_role((select auth.uid()), 'system_owner'::public.app_role)
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'platform subscription management requires administrator access'
      USING ERRCODE = '42501';
  END IF;

  v_tenant_id := nullif(payload #>> '{tenant_id}', '')::uuid;
  v_plan_id := nullif(payload #>> '{plan_id}', '')::uuid;
  v_status := COALESCE(NULLIF(payload #>> '{status}', '')::public.subscription_status, 'active'::public.subscription_status);
  v_cycle := COALESCE(NULLIF(payload #>> '{billing_cycle}', '')::public.billing_cycle, 'monthly'::public.billing_cycle);
  v_duration_days := COALESCE(NULLIF(payload #>> '{duration_days}', '')::integer, CASE WHEN v_cycle = 'yearly' THEN 365 ELSE 30 END);

  IF v_tenant_id IS NULL OR v_plan_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id and plan_id are required' USING ERRCODE = '22023';
  END IF;
  IF v_duration_days < 1 OR v_duration_days > 3650 THEN
    RAISE EXCEPTION 'duration_days must be between 1 and 3650' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant not found' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_plan_id AND is_active = true
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected subscription plan is not active' USING ERRCODE = '22023'; END IF;

  SELECT id, plan_id, status, current_period_end
    INTO v_subscription_id, v_previous_plan, v_previous_status, v_previous_period_end
  FROM public.subscriptions
  WHERE tenant_id = v_tenant_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_period_end := COALESCE(NULLIF(payload #>> '{period_end}', '')::timestamptz, now() + make_interval(days => v_duration_days));
  IF v_status IN ('active','trial') AND v_period_end <= now() THEN
    RAISE EXCEPTION 'period_end must be in the future' USING ERRCODE = '22023';
  END IF;

  IF v_status = 'trial' THEN
    v_trial_end := v_period_end;
  ELSE
    v_trial_end := NULL;
  END IF;

  IF v_subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (
      tenant_id, plan_id, status, billing_cycle,
      current_period_start, current_period_end
    ) VALUES (
      v_tenant_id, v_plan_id, v_status, v_cycle,
      now(), v_period_end
    ) RETURNING id INTO v_subscription_id;
  ELSE
    UPDATE public.subscriptions
    SET plan_id = v_plan_id,
        status = v_status,
        billing_cycle = v_cycle,
        current_period_start = now(),
        current_period_end = v_period_end,
        cancelled_at = CASE WHEN v_status = 'cancelled' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = v_subscription_id;
  END IF;

  UPDATE public.tenants
  SET plan_id = v_plan_id,
      subscription_status = v_status,
      trial_ends_at = v_trial_end,
      subscription_ends_at = CASE WHEN v_status = 'active' THEN v_period_end ELSE NULL END,
      is_active = CASE WHEN v_status IN ('cancelled','expired') THEN false ELSE true END,
      updated_at = now()
  WHERE id = v_tenant_id;

  INSERT INTO public.subscription_change_log (
    tenant_id, actor_id, previous_plan_id, new_plan_id,
    previous_status, new_status, previous_period_end, new_period_end, reason
  ) VALUES (
    v_tenant_id, auth.uid(), v_previous_plan, v_plan_id,
    v_previous_status, v_status, v_previous_period_end, v_period_end,
    NULLIF(trim(payload #>> '{reason}'), '')
  );

  RETURN public.tenant_subscription_snapshot(v_tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_update_tenant_subscription(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_update_tenant_subscription(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_update_tenant_subscription(jsonb) TO authenticated;

-- Tenant-scoped public booking options. Catalog rows are shared reference data,
-- while branches and doctors are restricted to the resolved tenant.
CREATE OR REPLACE FUNCTION public.public_booking_options_for_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tenant_id', t.id,
    'tenant_name', t.name,
    'tenant_slug', t.slug,
    'branches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
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
      ) ORDER BY b.name_en)
      FROM public.branches b
      LEFT JOIN public.appointment_settings s ON s.branch_id = b.id
      WHERE b.tenant_id = t.id
        AND b.is_active = true
        AND COALESCE(s.allow_online_booking, true) = true
    ), '[]'::jsonb),
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name_en', s.name_en,
        'name_ar', s.name_ar,
        'duration_minutes', s.default_duration_minutes,
        'source', 'service'
      ) ORDER BY COALESCE(s.display_order, 0), s.name_en)
      FROM public.services s
      WHERE s.is_active = true AND s.deleted_at IS NULL AND s.available_online = true
    ), '[]'::jsonb),
    'procedures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name_en', p.name_en,
        'name_ar', p.name_ar,
        'duration_minutes', COALESCE(p.default_duration, 30),
        'source', 'procedure'
      ) ORDER BY p.name_en)
      FROM public.procedures p
      WHERE p.is_active = true AND p.deleted_at IS NULL
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'full_name_en', p.full_name_en,
        'full_name_ar', p.full_name_ar
      ) ORDER BY COALESCE(p.full_name_en, p.full_name))
      FROM public.profiles p
      WHERE EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.staff_branches sb ON sb.user_id = ur.user_id
        JOIN public.branches b ON b.id = sb.branch_id
        WHERE ur.user_id = p.id
          AND ur.role = 'doctor'::public.app_role
          AND b.tenant_id = t.id
      )
    ), '[]'::jsonb)
  )
  FROM public.tenants t
  WHERE t.id = p_tenant_id
    AND public.tenant_has_active_subscription(t.id);
$$;

CREATE OR REPLACE FUNCTION public.public_booking_slots_for_tenant(
  p_tenant_id uuid,
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
  WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND OR NOT public.tenant_has_active_subscription(p_tenant_id) THEN RETURN; END IF;
  IF p_doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.staff_branches sb
    JOIN public.user_roles ur ON ur.user_id = sb.user_id
    WHERE sb.branch_id = p_branch_id
      AND sb.user_id = p_doctor_id
      AND ur.role = 'doctor'::public.app_role
  ) THEN RETURN; END IF;

  SELECT * INTO v_settings FROM public.appointment_settings WHERE branch_id = p_branch_id LIMIT 1;
  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RETURN; END IF;
  IF p_date < CURRENT_DATE OR p_date > CURRENT_DATE + COALESCE(v_settings.max_future_booking_days, 30) THEN RETURN; END IF;
  IF NOT (EXTRACT(DOW FROM p_date)::integer = ANY(COALESCE(v_branch.working_days, ARRAY[0,1,2,3,4,5,6]))) THEN RETURN; END IF;

  v_duration := COALESCE(v_settings.slot_duration_minutes, 30);
  SELECT s.default_duration_minutes, s.name_en INTO v_duration, v_service_name
  FROM public.services s
  WHERE s.id = p_service_id AND s.is_active = true AND s.deleted_at IS NULL AND s.available_online = true
  LIMIT 1;

  IF v_service_name IS NULL THEN
    SELECT COALESCE(p.default_duration, v_duration), p.name_en INTO v_duration, v_service_name
    FROM public.procedures p
    WHERE p.id = p_service_id AND p.is_active = true AND p.deleted_at IS NULL
    LIMIT 1;
  END IF;
  IF v_service_name IS NULL THEN RETURN; END IF;

  v_start := p_date + COALESCE(v_branch.working_hours_start, '09:00'::time);
  v_end := p_date + COALESCE(v_branch.working_hours_end, '21:00'::time);
  v_start_at := v_start AT TIME ZONE 'Africa/Cairo';
  v_end_at := v_end AT TIME ZONE 'Africa/Cairo';

  FOR v_slot IN
    SELECT gs FROM generate_series(
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
  v_service_name_ar text;
  v_phone_digits text;
  v_phone_canonical text;
  v_reference text;
  v_is_arabic boolean;
BEGIN
  IF NOT public.tenant_has_active_subscription(p_tenant_id) THEN RAISE EXCEPTION 'tenant_subscription_inactive'; END IF;
  IF NULLIF(trim(p_full_name), '') IS NULL THEN RAISE EXCEPTION 'full_name_required'; END IF;
  IF NULLIF(trim(p_phone), '') IS NULL THEN RAISE EXCEPTION 'phone_required'; END IF;
  IF length(trim(p_full_name)) > 160 OR length(trim(p_phone)) > 40 THEN RAISE EXCEPTION 'invalid_booking_input'; END IF;

  v_phone_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF left(v_phone_digits, 1) = '0' THEN v_phone_digits := '2' || v_phone_digits; END IF;
  IF length(v_phone_digits) < 10 OR length(v_phone_digits) > 15 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  v_phone_canonical := '+' || v_phone_digits;
  v_is_arabic := p_full_name ~ '[\\u0600-\\u06FF]';

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch_unavailable'; END IF;
  IF p_doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.staff_branches sb
    JOIN public.user_roles ur ON ur.user_id = sb.user_id
    WHERE sb.branch_id = p_branch_id
      AND sb.user_id = p_doctor_id
      AND ur.role = 'doctor'::public.app_role
  ) THEN RAISE EXCEPTION 'doctor_unavailable'; END IF;
  SELECT * INTO v_settings FROM public.appointment_settings WHERE branch_id = p_branch_id LIMIT 1;
  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RAISE EXCEPTION 'online_booking_disabled'; END IF;

  SELECT s.default_duration_minutes, s.name_en, s.name_ar INTO v_duration, v_service_name, v_service_name_ar
  FROM public.services s
  WHERE s.id = p_service_id AND s.is_active = true AND s.deleted_at IS NULL AND s.available_online = true
  LIMIT 1;
  IF v_service_name IS NULL THEN
    SELECT COALESCE(p.default_duration, COALESCE(v_settings.slot_duration_minutes, 30)), p.name_en, p.name_ar
      INTO v_duration, v_service_name, v_service_name_ar
    FROM public.procedures p
    WHERE p.id = p_service_id AND p.is_active = true AND p.deleted_at IS NULL
    LIMIT 1;
  END IF;
  IF v_service_name IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.public_booking_slots_for_tenant(p_tenant_id, p_branch_id, p_service_id, (p_slot_start AT TIME ZONE 'Africa/Cairo')::date, p_doctor_id)
    WHERE slot_start = p_slot_start AND available = true
  ) THEN RAISE EXCEPTION 'slot_unavailable'; END IF;

  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE branch_id = p_branch_id
    AND deleted_at IS NULL
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
    SET email = COALESCE(NULLIF(trim(p_email), ''), email), updated_at = now()
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
    'service_name_en', v_service_name,
    'service_name_ar', COALESCE(v_service_name_ar, v_service_name),
    'branch_name_en', v_branch.name_en,
    'branch_name_ar', v_branch.name_ar
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_booking_options_for_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_booking_slots_for_tenant(uuid, uuid, uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_create_booking_for_tenant(uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_options_for_tenant(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_booking_slots_for_tenant(uuid, uuid, uuid, date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_create_booking_for_tenant(uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb) TO anon, authenticated;

-- Legacy unscoped paths fail closed. The application now uses the tenant-aware RPCs.
CREATE OR REPLACE FUNCTION public.public_booking_options()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'tenant_context_required'; END;
$$;
CREATE OR REPLACE FUNCTION public.public_booking_slots(p_branch_id uuid, p_service_id uuid, p_date date, p_doctor_id uuid DEFAULT NULL)
RETURNS TABLE(slot_start timestamptz, slot_end timestamptz, available boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'tenant_context_required'; END;
$$;
CREATE OR REPLACE FUNCTION public.public_create_booking(p_branch_id uuid, p_service_id uuid, p_slot_start timestamptz, p_full_name text, p_phone text, p_doctor_id uuid DEFAULT NULL, p_email text DEFAULT NULL, p_complaint text DEFAULT NULL, p_source text DEFAULT 'public_booking', p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'tenant_context_required'; END;
$$;

-- Tighten exposure of subscription helpers: anonymous booking functions call the
-- active check internally, but callers do not need direct access to it.
REVOKE ALL ON FUNCTION public.tenant_has_active_subscription(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_active_subscription(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tenant_subscription_snapshot(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tenant_id', t.id,
    'tenant_name', t.name,
    'tenant_slug', t.slug,
    'plan_id', COALESCE(t.plan_id, s.plan_id),
    'plan_name_ar', p.name_ar,
    'plan_name_en', p.name_en,
    'plan_features', COALESCE(p.features, '{}'::jsonb),
    'max_branches', p.max_branches,
    'max_staff', p.max_staff,
    'max_patients', p.max_patients,
    'max_invoices_monthly', p.max_invoices_monthly,
    'subscription_status', t.subscription_status::text,
    'billing_cycle', s.billing_cycle::text,
    'trial_ends_at', t.trial_ends_at,
    'subscription_ends_at', t.subscription_ends_at,
    'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end,
    'is_active', t.is_active,
    'access_allowed', public.tenant_has_active_subscription(t.id),
    'access_reason', CASE
      WHEN NOT t.is_active THEN 'tenant_inactive'
      WHEN t.subscription_status IN ('cancelled','expired') THEN 'subscription_expired'
      WHEN t.subscription_status = 'past_due' THEN 'subscription_past_due'
      WHEN t.subscription_status = 'trial' AND (t.trial_ends_at IS NULL OR t.trial_ends_at <= now()) THEN 'trial_expired'
      WHEN t.subscription_status = 'active' AND t.subscription_ends_at IS NOT NULL AND t.subscription_ends_at <= now() THEN 'subscription_expired'
      WHEN COALESCE(t.plan_id, s.plan_id) IS NULL THEN 'plan_required'
      ELSE 'active'
    END
  )
  FROM public.tenants t
  LEFT JOIN LATERAL (
    SELECT sub.* FROM public.subscriptions sub
    WHERE sub.tenant_id = t.id
    ORDER BY sub.created_at DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN public.subscription_plans p ON p.id = COALESCE(t.plan_id, s.plan_id)
  WHERE t.id = _tenant_id
    AND (
      public.has_role(auth.uid(), 'system_owner'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.staff_branches sb
        WHERE sb.user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.branches b
            WHERE b.id = sb.branch_id AND b.tenant_id = t.id
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access(_branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _branch IS NULL
    OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = _branch AND public.tenant_has_active_subscription(b.tenant_id)
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.staff_branches sb
      JOIN public.branches b ON b.id = sb.branch_id
      WHERE sb.user_id = auth.uid()
        AND sb.branch_id = _branch
        AND public.tenant_has_active_subscription(b.tenant_id)
    );
$$;

-- New onboarding payload supports a selected trial duration and billing cycle.
CREATE OR REPLACE FUNCTION public.platform_create_tenant_onboarding(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_name text;
  v_slug text;
  v_billing_email text;
  v_plan_id uuid;
  v_owner_id uuid;
  v_branch_name_en text;
  v_branch_name_ar text;
  v_branch_phone text;
  v_branch_address text;
  v_branch_city text;
  v_modules jsonb;
  v_trial_days integer;
  v_cycle public.billing_cycle;
  v_tenant_id uuid;
  v_branch_id uuid;
  v_plan public.subscription_plans%ROWTYPE;
  v_module_key text;
  v_core_modules constant text[] := ARRAY['dashboard','patients','appointments','medical','invoices','reports','communication'];
  v_allowed_modules constant text[] := ARRAY['dashboard','patients','appointments','medical','invoices','reports','communication','physio','dermatology','orthopedics','dental','inventory','hr','marketing'];
BEGIN
  IF NOT (public.has_role((select auth.uid()), 'system_owner'::public.app_role) OR public.has_role((select auth.uid()), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'platform onboarding requires administrator access' USING ERRCODE = '42501';
  END IF;
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN RAISE EXCEPTION 'onboarding payload must be a JSON object' USING ERRCODE = '22023'; END IF;

  v_tenant_name := nullif(trim(payload #>> '{tenant,name}'), '');
  v_slug := lower(nullif(trim(payload #>> '{tenant,slug}'), ''));
  v_billing_email := nullif(trim(payload #>> '{tenant,billing_email}'), '');
  v_plan_id := nullif(payload #>> '{tenant,plan_id}', '')::uuid;
  v_owner_id := (select auth.uid());
  v_trial_days := COALESCE(NULLIF(payload #>> '{subscription,duration_days}', '')::integer, 14);
  v_cycle := COALESCE(NULLIF(payload #>> '{subscription,billing_cycle}', '')::public.billing_cycle, 'monthly'::public.billing_cycle);
  v_branch_name_en := nullif(trim(payload #>> '{branch,name_en}'), '');
  v_branch_name_ar := nullif(trim(payload #>> '{branch,name_ar}'), '');
  v_branch_phone := nullif(trim(payload #>> '{branch,phone}'), '');
  v_branch_address := nullif(trim(payload #>> '{branch,address}'), '');
  v_branch_city := nullif(trim(payload #>> '{branch,city}'), '');
  v_modules := coalesce(payload->'modules', '[]'::jsonb);

  IF v_tenant_name IS NULL OR length(v_tenant_name) > 160 THEN RAISE EXCEPTION 'tenant name is required and must be at most 160 characters' USING ERRCODE = '22023'; END IF;
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' THEN RAISE EXCEPTION 'tenant slug is invalid' USING ERRCODE = '22023'; END IF;
  IF v_branch_name_en IS NULL OR length(v_branch_name_en) > 160 THEN RAISE EXCEPTION 'branch English name is required and must be at most 160 characters' USING ERRCODE = '22023'; END IF;
  IF v_branch_name_ar IS NULL OR length(v_branch_name_ar) > 160 THEN v_branch_name_ar := v_branch_name_en; END IF;
  IF v_trial_days < 1 OR v_trial_days > 3650 THEN RAISE EXCEPTION 'subscription duration must be between 1 and 3650 days' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(v_modules) <> 'array' THEN RAISE EXCEPTION 'modules must be a JSON array' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_modules) requested(module_key) WHERE requested.module_key <> ALL (v_allowed_modules)) THEN RAISE EXCEPTION 'one or more selected modules are not supported' USING ERRCODE = '22023'; END IF;
  IF v_plan_id IS NULL THEN RAISE EXCEPTION 'a subscription plan is required' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_plan_id AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected subscription plan is not active' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) THEN RAISE EXCEPTION 'tenant slug is already in use' USING ERRCODE = '23505'; END IF;

  INSERT INTO public.tenants (name, slug, owner_id, plan_id, subscription_status, trial_ends_at, billing_email, is_active)
  VALUES (v_tenant_name, v_slug, v_owner_id, v_plan_id, 'trial'::public.subscription_status, now() + make_interval(days => v_trial_days), v_billing_email, true)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.branches (tenant_id, name_en, name_ar, phone, address, city, is_main_branch, is_active)
  VALUES (v_tenant_id, v_branch_name_en, v_branch_name_ar, v_branch_phone, v_branch_address, v_branch_city, true, true)
  RETURNING id INTO v_branch_id;

  INSERT INTO public.tenant_module_settings (tenant_id, module_key, enabled, created_by, updated_by)
  SELECT v_tenant_id, selected.module_key, true, (select auth.uid()), (select auth.uid())
  FROM (
    SELECT DISTINCT module_key
    FROM (SELECT jsonb_array_elements_text(v_modules) AS module_key UNION ALL SELECT unnest(v_core_modules) AS module_key) requested_modules
  ) selected;

  INSERT INTO public.subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
  VALUES (v_tenant_id, v_plan_id, 'trial'::public.subscription_status, v_cycle, now(), now() + make_interval(days => v_trial_days));

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'branch_id', v_branch_id,
    'plan_id', v_plan_id,
    'trial_ends_at', now() + make_interval(days => v_trial_days),
    'modules', (SELECT coalesce(jsonb_agg(module_key ORDER BY module_key), '[]'::jsonb) FROM public.tenant_module_settings WHERE tenant_id = v_tenant_id AND enabled = true)
  );
END;
$$;

-- Resolve a public booking link by slug when the app is opened on the shared
-- workers.dev host. Custom domains use resolve_active_tenant_domain(host).
CREATE OR REPLACE FUNCTION public.public_booking_tenant_by_slug(p_slug text)
RETURNS TABLE(tenant_id uuid, tenant_name text, tenant_slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.slug
  FROM public.tenants t
  WHERE t.slug = lower(trim(p_slug))
    AND t.is_active = true
    AND public.tenant_has_active_subscription(t.id)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.public_booking_tenant_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_booking_tenant_by_slug(text) TO anon, authenticated;
