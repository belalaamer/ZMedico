-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260903200110
-- name: patient_portal_booking_and_shared_core
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Shared core: everything public_create_booking_for_tenant did AFTER resolving/upserting
-- the patient record. Extracted so an authenticated patient-portal booking can reuse the
-- exact same slot/doctor/resource validation and appointment insert logic without
-- duplicating it (and risking the two paths drifting apart over time).
CREATE OR REPLACE FUNCTION public._create_booking_for_patient(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_service_id uuid,
  p_slot_start timestamptz,
  p_patient_id uuid,
  p_doctor_id uuid DEFAULT NULL,
  p_complaint text DEFAULT NULL,
  p_source text DEFAULT 'public_booking',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
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
  IF v_service_name IS NULL THEN
    v_service_kind := 'procedure';
    SELECT COALESCE(pr.default_duration, COALESCE(v_settings.slot_duration_minutes, 30)), pr.name_en, pr.name_ar
      INTO v_duration, v_service_name, v_service_name_ar
    FROM public.procedures pr
    WHERE pr.id = p_service_id AND pr.tenant_id = p_tenant_id AND pr.is_active = true AND pr.deleted_at IS NULL
    LIMIT 1;
  END IF;
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

REVOKE ALL ON FUNCTION public._create_booking_for_patient(uuid, uuid, uuid, timestamptz, uuid, uuid, text, text, jsonb) FROM PUBLIC;

-- Rewire the public (anonymous) booking RPC to do only patient-matching/upsert by phone,
-- then delegate everything else to the shared core above. This is a pure refactor of
-- public_create_booking_for_tenant -- behavior for existing (anonymous) callers is
-- unchanged; only the implementation is de-duplicated.
CREATE OR REPLACE FUNCTION public.public_create_booking_for_tenant(
  p_tenant_id uuid, p_branch_id uuid, p_service_id uuid, p_slot_start timestamptz,
  p_full_name text, p_phone text, p_doctor_id uuid DEFAULT NULL, p_email text DEFAULT NULL,
  p_complaint text DEFAULT NULL, p_source text DEFAULT 'public_booking', p_metadata jsonb DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_patient_id uuid;
  v_phone_digits text;
  v_phone_canonical text;
  v_is_arabic boolean;
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
  WHERE branch_id = p_branch_id AND deleted_at IS NULL
    AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_digits
  ORDER BY created_at DESC LIMIT 1;
  IF v_patient_id IS NULL THEN
    INSERT INTO public.patients (first_name_en, first_name_ar, email, phone, referral_source, notes, branch_id, name_language)
    VALUES (trim(p_full_name), CASE WHEN v_is_arabic THEN trim(p_full_name) ELSE NULL END,
      NULLIF(trim(p_email), ''), v_phone_canonical, NULLIF(trim(p_source), ''), NULLIF(trim(p_complaint), ''),
      p_branch_id, CASE WHEN v_is_arabic THEN 'ar' ELSE 'en' END)
    RETURNING id INTO v_patient_id;
  ELSE
    UPDATE public.patients SET email = COALESCE(NULLIF(trim(p_email), ''), email), updated_at = now() WHERE id = v_patient_id;
  END IF;

  RETURN public._create_booking_for_patient(
    p_tenant_id, p_branch_id, p_service_id, p_slot_start, v_patient_id,
    p_doctor_id, p_complaint, p_source,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('public_name', trim(p_full_name), 'phone_digits', v_phone_digits)
  );
END;
$function$;

-- New authenticated booking RPC for the patient portal: resolves the caller's own
-- patient_id/branch_id/tenant_id from patient_portal_accounts (never trusts anything the
-- client sends for identity), so a logged-in patient's booking is always attached to
-- their real record -- no re-typed name/phone/email, no risk of a phone-typo/different-branch
-- entry creating a duplicate patient (the gap that existed because the portal's "Book new
-- appointment" buttons just linked to the anonymous /book form and the anonymous RPC only
-- matched an existing patient by re-typed phone digits within the same branch).
CREATE OR REPLACE FUNCTION public.patient_portal_create_booking(
  p_service_id uuid,
  p_slot_start timestamptz,
  p_doctor_id uuid DEFAULT NULL,
  p_complaint text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
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

  RETURN public._create_booking_for_patient(
    v_account.tenant_id, v_account.branch_id, p_service_id, p_slot_start, v_account.patient_id,
    p_doctor_id, p_complaint, 'patient_portal', COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.patient_portal_create_booking(uuid, timestamptz, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_portal_create_booking(uuid, timestamptz, uuid, text, jsonb) TO authenticated;

-- Lightweight context lookup the booking page uses to decide whether to render the
-- "book as yourself" shortcut UI. Read-only, scoped strictly to auth.uid()'s own active
-- portal account; returns NULL (not an error) when there is no such account, which lets
-- the frontend fall back to the ordinary anonymous booking form.
CREATE OR REPLACE FUNCTION public.patient_portal_booking_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'tenant_id', a.tenant_id,
    'branch_id', a.branch_id,
    'branch_name_en', b.name_en,
    'branch_name_ar', b.name_ar,
    'patient_name_en', trim(coalesce(p.first_name_en,'') || CASE WHEN p.last_name_en IS NOT NULL THEN ' ' || p.last_name_en ELSE '' END),
    'patient_name_ar', trim(coalesce(p.first_name_ar,'') || CASE WHEN p.last_name_ar IS NOT NULL THEN ' ' || p.last_name_ar ELSE '' END),
    'patient_phone', p.phone
  )
  FROM public.patient_portal_accounts a
  LEFT JOIN public.branches b ON b.id = a.branch_id
  LEFT JOIN public.patients p ON p.id = a.patient_id
  WHERE a.auth_user_id = auth.uid() AND a.status = 'active' AND a.portal_enabled = true
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.patient_portal_booking_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_portal_booking_context() TO authenticated;

