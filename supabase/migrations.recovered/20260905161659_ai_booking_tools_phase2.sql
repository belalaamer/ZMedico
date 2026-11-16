-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260905161659
-- name: ai_booking_tools_phase2
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Phase 2: AI-safe booking tools. All SECURITY DEFINER, tenant/branch ownership
-- re-validated inside each function (Trusted Caller Pattern) -- never trust
-- tenant_id/branch_id blindly, never rely on auth.uid().

-- 1) Find patient by phone within a tenant/branch (read-only)
CREATE OR REPLACE FUNCTION public.public_find_patient_by_phone_for_tenant(
  p_tenant_id uuid, p_branch_id uuid, p_phone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_branch public.branches%ROWTYPE;
  v_patient record;
BEGIN
  IF NOT public.tenant_has_active_subscription(p_tenant_id) THEN RAISE EXCEPTION 'tenant_subscription_inactive'; END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'branch_unavailable'; END IF;

  IF NULLIF(trim(coalesce(p_phone,'')), '') IS NULL THEN RAISE EXCEPTION 'phone_required'; END IF;

  SELECT id, first_name_en, first_name_ar, last_name_en, last_name_ar, patient_code
    INTO v_patient
  FROM public.patients
  WHERE branch_id = p_branch_id AND deleted_at IS NULL
    AND public.normalize_phone_digits(phone) = public.normalize_phone_digits(p_phone)
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  RETURN jsonb_build_object(
    'found', true,
    'patient_id', v_patient.id,
    'first_name_en', v_patient.first_name_en,
    'first_name_ar', v_patient.first_name_ar,
    'last_name_en', v_patient.last_name_en,
    'last_name_ar', v_patient.last_name_ar,
    'patient_code', v_patient.patient_code
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_find_patient_by_phone_for_tenant(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_find_patient_by_phone_for_tenant(uuid, uuid, text) TO anon, authenticated, service_role;

-- 2) Cancel an appointment
CREATE OR REPLACE FUNCTION public.public_cancel_appointment_for_tenant(
  p_tenant_id uuid, p_appointment_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt record;
BEGIN
  IF NOT public.tenant_has_active_subscription(p_tenant_id) THEN RAISE EXCEPTION 'tenant_subscription_inactive'; END IF;

  SELECT a.* INTO v_appt
  FROM public.appointments a
  JOIN public.branches b ON b.id = a.branch_id
  WHERE a.id = p_appointment_id AND b.tenant_id = p_tenant_id AND a.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;

  IF v_appt.status::text IN ('cancelled','no_show','completed') THEN
    RAISE EXCEPTION 'appointment_not_cancellable';
  END IF;

  UPDATE public.appointments
  SET status = 'cancelled'::public.appointment_status,
      booking_request_status = CASE WHEN booking_request_status = 'pending' THEN 'rejected' ELSE booking_request_status END,
      booking_rejection_reason = COALESCE(NULLIF(trim(coalesce(p_reason,'')), ''), booking_rejection_reason),
      booking_rejected_at = now(),
      updated_at = now()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object('appointment_id', p_appointment_id, 'status', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.public_cancel_appointment_for_tenant(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_cancel_appointment_for_tenant(uuid, uuid, text) TO anon, authenticated, service_role;

-- 3) Reschedule an appointment (branch/service/doctor are derived from the
-- existing appointment row itself -- never taken as separate untrusted params
-- that could be mismatched against the real appointment).
CREATE OR REPLACE FUNCTION public.public_reschedule_appointment_for_tenant(
  p_tenant_id uuid, p_appointment_id uuid, p_new_slot_start timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt record;
BEGIN
  IF NOT public.tenant_has_active_subscription(p_tenant_id) THEN RAISE EXCEPTION 'tenant_subscription_inactive'; END IF;

  SELECT a.* INTO v_appt
  FROM public.appointments a
  JOIN public.branches b ON b.id = a.branch_id
  WHERE a.id = p_appointment_id AND b.tenant_id = p_tenant_id AND a.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;

  IF v_appt.status::text IN ('cancelled','no_show','completed') THEN
    RAISE EXCEPTION 'appointment_not_reschedulable';
  END IF;
  IF v_appt.service_id IS NULL THEN RAISE EXCEPTION 'appointment_missing_service'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_appt.branch_id::text || ':' || p_new_slot_start::text || ':' || v_appt.service_id::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.public_booking_slots_for_tenant(
      p_tenant_id, v_appt.branch_id, v_appt.service_id,
      (p_new_slot_start AT TIME ZONE 'Africa/Cairo')::date, v_appt.doctor_id
    ) WHERE slot_start = p_new_slot_start AND available = true
  ) THEN RAISE EXCEPTION 'slot_unavailable'; END IF;

  UPDATE public.appointments
  SET scheduled_at = p_new_slot_start, updated_at = now()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object('appointment_id', p_appointment_id, 'scheduled_at', p_new_slot_start, 'status', v_appt.status::text);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_reschedule_appointment_for_tenant(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_reschedule_appointment_for_tenant(uuid, uuid, timestamptz) TO anon, authenticated, service_role;

-- 4) Extend public_booking_options_for_tenant with price + description,
-- WITHOUT exposing cost_price (internal margin data). Pure additive change
-- to the services/procedures JSON shape -- branches/doctors/tenant fields
-- unchanged.
CREATE OR REPLACE FUNCTION public.public_booking_options_for_tenant(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
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
    'procedures', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name_en', p.name_en, 'name_ar', p.name_ar, 'duration_minutes', COALESCE(p.default_duration, 30), 'price', p.default_price, 'description_en', p.description_en, 'description_ar', p.description_ar, 'source', 'procedure') ORDER BY p.name_en) FROM public.procedures p WHERE p.tenant_id = t.id AND p.is_active = true AND p.deleted_at IS NULL), '[]'::jsonb),
    'doctors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'full_name', pr.full_name, 'full_name_en', pr.full_name_en, 'full_name_ar', pr.full_name_ar) ORDER BY COALESCE(pr.full_name_en, pr.full_name)) FROM public.profiles pr WHERE EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff_branches sb ON sb.user_id = ur.user_id JOIN public.branches b ON b.id = sb.branch_id WHERE ur.user_id = pr.id AND ur.role = 'doctor'::public.app_role AND b.tenant_id = t.id)), '[]'::jsonb)
  )
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND public.tenant_has_active_subscription(t.id);
$function$;

