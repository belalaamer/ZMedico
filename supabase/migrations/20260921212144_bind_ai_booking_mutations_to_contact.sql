CREATE OR REPLACE FUNCTION public.ai_cancel_appointment_for_contact(
  p_tenant_id uuid,
  p_appointment_id uuid,
  p_expected_phone text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt record;
  v_patient_phone text;
BEGIN
  IF NOT public.tenant_has_active_subscription(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_subscription_inactive';
  END IF;
  IF NULLIF(trim(coalesce(p_expected_phone,'')), '') IS NULL THEN
    RAISE EXCEPTION 'phone_required';
  END IF;

  SELECT a.*, p.phone
    INTO v_appt
  FROM public.appointments a
  JOIN public.branches b ON b.id = a.branch_id
  JOIN public.patients p ON p.id = a.patient_id
  WHERE a.id = p_appointment_id
    AND b.tenant_id = p_tenant_id
    AND a.deleted_at IS NULL
    AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;

  v_patient_phone := public.normalize_phone_digits(v_appt.phone);
  IF v_patient_phone IS NULL
     OR v_patient_phone <> public.normalize_phone_digits(p_expected_phone) THEN
    RAISE EXCEPTION 'appointment_contact_mismatch';
  END IF;

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

CREATE OR REPLACE FUNCTION public.ai_reschedule_appointment_for_contact(
  p_tenant_id uuid,
  p_appointment_id uuid,
  p_expected_phone text,
  p_new_slot_start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt record;
  v_patient_phone text;
BEGIN
  IF NOT public.tenant_has_active_subscription(p_tenant_id) THEN
    RAISE EXCEPTION 'tenant_subscription_inactive';
  END IF;
  IF NULLIF(trim(coalesce(p_expected_phone,'')), '') IS NULL THEN
    RAISE EXCEPTION 'phone_required';
  END IF;

  SELECT a.*, p.phone
    INTO v_appt
  FROM public.appointments a
  JOIN public.branches b ON b.id = a.branch_id
  JOIN public.patients p ON p.id = a.patient_id
  WHERE a.id = p_appointment_id
    AND b.tenant_id = p_tenant_id
    AND a.deleted_at IS NULL
    AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;

  v_patient_phone := public.normalize_phone_digits(v_appt.phone);
  IF v_patient_phone IS NULL
     OR v_patient_phone <> public.normalize_phone_digits(p_expected_phone) THEN
    RAISE EXCEPTION 'appointment_contact_mismatch';
  END IF;

  IF v_appt.status::text IN ('cancelled','no_show','completed') THEN
    RAISE EXCEPTION 'appointment_not_reschedulable';
  END IF;
  IF v_appt.service_id IS NULL THEN
    RAISE EXCEPTION 'appointment_missing_service';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_appt.branch_id::text || ':' || p_new_slot_start::text || ':' || v_appt.service_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.public_booking_slots_for_tenant(
      p_tenant_id,
      v_appt.branch_id,
      v_appt.service_id,
      (p_new_slot_start AT TIME ZONE 'Africa/Cairo')::date,
      v_appt.doctor_id
    )
    WHERE slot_start = p_new_slot_start
      AND available = true
  ) THEN
    RAISE EXCEPTION 'slot_unavailable';
  END IF;

  UPDATE public.appointments
  SET scheduled_at = p_new_slot_start,
      updated_at = now()
  WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'scheduled_at', p_new_slot_start,
    'status', v_appt.status::text
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_cancel_appointment_for_contact(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_reschedule_appointment_for_contact(uuid,uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ai_cancel_appointment_for_contact(uuid,uuid,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_reschedule_appointment_for_contact(uuid,uuid,text,timestamptz)
  TO service_role;
