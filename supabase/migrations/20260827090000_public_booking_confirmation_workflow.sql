-- Public booking confirmation workflow.
-- New public requests may be pending; existing appointments keep their
-- current lifecycle and are not backfilled or mutated by this migration.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_request_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS booking_request_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_rejection_reason text,
  ADD COLUMN IF NOT EXISTS booking_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_booking_request_status_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_booking_request_status_check
      CHECK (booking_request_status IN ('not_applicable','pending','confirmed','rejected','expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appointments_pending_booking_requests_idx
  ON public.appointments(branch_id, booking_request_expires_at)
  WHERE booking_request_status = 'pending' AND deleted_at IS NULL;

ALTER TABLE public.appointment_settings
  ADD COLUMN IF NOT EXISTS booking_request_hold_minutes integer NOT NULL DEFAULT 15
    CHECK (booking_request_hold_minutes BETWEEN 1 AND 1440);

-- Populate workflow fields only for newly inserted public bookings. Existing
-- operational appointments are intentionally left untouched.
CREATE OR REPLACE FUNCTION public.tg_public_booking_request_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires_confirmation boolean;
  v_hold_minutes integer;
BEGIN
  IF NEW.public_booking_reference IS NOT NULL OR NEW.booking_source = 'public_booking' THEN
    IF COALESCE(NEW.booking_request_status, 'not_applicable') = 'not_applicable' THEN
      SELECT COALESCE(require_confirmation, false),
             COALESCE(booking_request_hold_minutes, 15)
        INTO v_requires_confirmation, v_hold_minutes
      FROM public.appointment_settings
      WHERE branch_id = NEW.branch_id
      LIMIT 1;

      IF NEW.status = 'scheduled' AND COALESCE(v_requires_confirmation, false) THEN
        NEW.booking_request_status := 'pending';
        NEW.booking_request_expires_at := now() + make_interval(mins => COALESCE(v_hold_minutes, 15));
      ELSE
        NEW.booking_request_status := 'confirmed';
        NEW.booking_confirmed_at := COALESCE(NEW.booking_confirmed_at, now());
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_booking_request_defaults ON public.appointments;
CREATE TRIGGER trg_public_booking_request_defaults
BEFORE INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_public_booking_request_defaults();

-- Expired pending requests no longer consume a slot. The cleanup RPC below
-- also changes them to cancelled/expired when a staff member opens Calendar.
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
  SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND OR NOT public.tenant_has_active_subscription(p_tenant_id) THEN RETURN; END IF;
  IF p_doctor_id IS NOT NULL AND NOT public.doctor_service_assignment_allowed(p_doctor_id, p_branch_id, p_service_id, 'service') THEN
    IF NOT public.doctor_service_assignment_allowed(p_doctor_id, p_branch_id, p_service_id, 'procedure') THEN RETURN; END IF;
    v_service_kind := 'procedure';
  END IF;
  SELECT * INTO v_settings FROM public.appointment_settings WHERE branch_id = p_branch_id LIMIT 1;
  IF COALESCE(v_settings.allow_online_booking, true) = false THEN RETURN; END IF;
  IF p_date < CURRENT_DATE OR p_date > CURRENT_DATE + COALESCE(v_settings.max_future_booking_days, 30) THEN RETURN; END IF;
  IF NOT (EXTRACT(DOW FROM p_date)::integer = ANY(COALESCE(v_branch.working_days, ARRAY[0,1,2,3,4,5,6]))) THEN RETURN; END IF;
  v_duration := COALESCE(v_settings.slot_duration_minutes, 30);
  SELECT s.default_duration_minutes, s.name_en INTO v_duration, v_service_name
  FROM public.services s WHERE s.id = p_service_id AND s.tenant_id = p_tenant_id AND s.is_active = true
    AND s.deleted_at IS NULL AND s.available_online = true LIMIT 1;
  IF v_service_name IS NULL THEN
    v_service_kind := 'procedure';
    SELECT COALESCE(p.default_duration, v_duration), p.name_en INTO v_duration, v_service_name
    FROM public.procedures p WHERE p.id = p_service_id AND p.is_active = true AND p.deleted_at IS NULL LIMIT 1;
  END IF;
  IF v_service_name IS NULL THEN RETURN; END IF;
  SELECT count(*)::integer INTO v_resource_count FROM public.booking_resources r WHERE r.branch_id = p_branch_id AND r.is_active = true;
  v_start := p_date + COALESCE(v_branch.working_hours_start, '09:00'::time);
  v_end := p_date + COALESCE(v_branch.working_hours_end, '21:00'::time);
  FOR v_slot IN SELECT gs FROM generate_series(v_start, v_end - make_interval(mins => v_duration), make_interval(mins => v_duration + COALESCE(v_settings.buffer_minutes, 0))) gs LOOP
    slot_start := v_slot AT TIME ZONE 'Africa/Cairo';
    v_slot_end := slot_start + make_interval(mins => v_duration);
    slot_end := v_slot_end;
    available := false;
    IF p_doctor_id IS NOT NULL THEN
      SELECT count(*)::integer INTO v_count FROM public.appointments a
      WHERE a.branch_id = p_branch_id AND a.doctor_id = p_doctor_id AND a.deleted_at IS NULL
        AND a.status::text NOT IN ('cancelled','no_show')
        AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
        AND a.scheduled_at < v_slot_end AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
      IF v_count > 0 THEN RETURN NEXT; CONTINUE; END IF;
    END IF;
    IF v_resource_count > 0 THEN
      FOR v_resource IN SELECT r.* FROM public.booking_resources r WHERE r.branch_id = p_branch_id AND r.is_active = true AND public.booking_resource_is_eligible(r.id, p_service_id, v_service_kind) ORDER BY r.display_order, r.name_en LOOP
        SELECT count(*)::integer INTO v_count FROM public.appointments a
        WHERE a.branch_id = p_branch_id AND (a.resource_id = v_resource.id OR (a.resource_id IS NULL AND lower(trim(COALESCE(a.room, ''))) IN (lower(v_resource.name_en), lower(v_resource.name_ar))))
          AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show')
          AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
          AND a.scheduled_at < v_slot_end AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start;
        IF v_count < v_resource.capacity THEN available := slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1)); EXIT; END IF;
      END LOOP;
    ELSE
      SELECT count(*)::integer INTO v_count FROM public.appointments a
      WHERE a.branch_id = p_branch_id AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show')
        AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
        AND a.scheduled_at < v_slot_end AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > slot_start
        AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id);
      available := slot_start >= now() + make_interval(hours => COALESCE(v_settings.min_advance_booking_hours, 1)) AND v_count < COALESCE(v_settings.max_appointments_per_slot, 1);
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Mark expired requests and release their slot. The caller must be allowed to
-- manage the selected branch; System Owner remains global.
CREATE OR REPLACE FUNCTION public.expire_public_booking_requests(p_branch_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (public.has_permission(auth.uid(), 'appointments.edit'::text) AND public.user_has_branch_access(p_branch_id))
  ) THEN
    RAISE EXCEPTION 'booking_request_expiry_forbidden';
  END IF;

  UPDATE public.appointments
     SET status = 'cancelled'::public.appointment_status,
         booking_request_status = 'expired',
         updated_at = now()
   WHERE branch_id = p_branch_id
     AND deleted_at IS NULL
     AND booking_request_status = 'pending'
     AND booking_request_expires_at IS NOT NULL
     AND booking_request_expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_public_booking(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_conflict boolean;
BEGIN
  SELECT * INTO v_appt FROM public.appointments
   WHERE id = p_appointment_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR v_appt.booking_request_status <> 'pending' THEN
    RAISE EXCEPTION 'booking_request_not_pending';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (public.has_permission(auth.uid(), 'appointments.edit'::text) AND public.user_has_branch_access(v_appt.branch_id))
  ) THEN
    RAISE EXCEPTION 'booking_confirmation_forbidden';
  END IF;
  IF v_appt.booking_request_expires_at IS NOT NULL AND v_appt.booking_request_expires_at <= now() THEN
    UPDATE public.appointments SET status = 'cancelled', booking_request_status = 'expired', updated_at = now() WHERE id = v_appt.id;
    RAISE EXCEPTION 'booking_request_expired';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_appt.branch_id::text || ':' || v_appt.scheduled_at::text || ':' || COALESCE(v_appt.service_id::text, ''), 0));
  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id <> v_appt.id AND a.branch_id = v_appt.branch_id AND a.deleted_at IS NULL
      AND a.status::text NOT IN ('cancelled','no_show')
      AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
      AND a.scheduled_at < v_appt.scheduled_at + make_interval(mins => COALESCE(v_appt.duration_minutes, 30))
      AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > v_appt.scheduled_at
      AND (
        (v_appt.doctor_id IS NOT NULL AND a.doctor_id = v_appt.doctor_id)
        OR (v_appt.resource_id IS NOT NULL AND a.resource_id = v_appt.resource_id)
      )
  ) INTO v_conflict;
  IF v_conflict THEN RAISE EXCEPTION 'slot_unavailable'; END IF;

  UPDATE public.appointments
     SET status = 'confirmed', booking_request_status = 'confirmed', booking_request_expires_at = NULL,
         booking_confirmed_at = now(), booking_confirmed_by = auth.uid(), updated_at = now()
   WHERE id = v_appt.id;
  RETURN jsonb_build_object('appointment_id', v_appt.id, 'booking_request_status', 'confirmed');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_public_booking(p_appointment_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch_id uuid;
  v_reason text := NULLIF(trim(p_reason), '');
BEGIN
  IF v_reason IS NULL THEN RAISE EXCEPTION 'booking_rejection_reason_required'; END IF;
  IF length(v_reason) > 1000 THEN RAISE EXCEPTION 'booking_rejection_reason_too_long'; END IF;
  SELECT branch_id INTO v_branch_id FROM public.appointments
   WHERE id = p_appointment_id AND deleted_at IS NULL AND booking_request_status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_request_not_pending'; END IF;
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (public.has_permission(auth.uid(), 'appointments.edit'::text) AND public.user_has_branch_access(v_branch_id))
  ) THEN
    RAISE EXCEPTION 'booking_rejection_forbidden';
  END IF;
  UPDATE public.appointments
     SET status = 'cancelled', booking_request_status = 'rejected', booking_request_expires_at = NULL,
         booking_rejection_reason = v_reason, booking_rejected_at = now(), booking_rejected_by = auth.uid(), updated_at = now()
   WHERE id = p_appointment_id;
  RETURN jsonb_build_object('appointment_id', p_appointment_id, 'booking_request_status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.expire_public_booking_requests(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_public_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_public_booking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_public_booking_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_public_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_public_booking(uuid, text) TO authenticated;

-- Branch-scoped in-app notifications for the existing notification center.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS notifications_branch_idx ON public.notifications(branch_id, created_at DESC);

DROP POLICY IF EXISTS notif_select_own ON public.notifications;
CREATE POLICY notif_select_own ON public.notifications FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (user_id = auth.uid() AND (branch_id IS NULL OR public.user_has_branch_access(branch_id)))
  OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND (branch_id IS NULL OR public.user_has_branch_access(branch_id)))
);
DROP POLICY IF EXISTS notif_insert_own ON public.notifications;
DROP POLICY IF EXISTS notif_insert_any ON public.notifications;
CREATE POLICY notif_insert_own ON public.notifications FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'system_owner'::public.app_role));
DROP POLICY IF EXISTS notif_update_own ON public.notifications;
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (user_id = auth.uid() AND (branch_id IS NULL OR public.user_has_branch_access(branch_id)))
  OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND (branch_id IS NULL OR public.user_has_branch_access(branch_id)))
);
DROP POLICY IF EXISTS notif_delete_own ON public.notifications;
CREATE POLICY notif_delete_own ON public.notifications FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'system_owner'::public.app_role)
  OR (user_id = auth.uid() AND (branch_id IS NULL OR public.user_has_branch_access(branch_id)))
  OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND (branch_id IS NULL OR public.user_has_branch_access(branch_id)))
);

CREATE OR REPLACE FUNCTION public.tg_appointment_create_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pname_en text;
  pname_ar text;
  appt_local text;
  title_en text;
  title_ar text;
  message_en text;
  message_ar text;
BEGIN
  SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name_en, last_name_en)), ''), 'patient'),
         COALESCE(NULLIF(trim(concat_ws(' ', first_name_ar, last_name_ar)), ''), 'مريض')
    INTO pname_en, pname_ar
  FROM public.patients WHERE id = NEW.patient_id;
  appt_local := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI');
  IF NEW.booking_request_status = 'pending' THEN
    title_en := 'Booking request needs confirmation';
    title_ar := 'طلب حجز يحتاج إلى تأكيد';
    message_en := 'A new booking request for ' || pname_en || ' on ' || appt_local || ' is waiting for review.';
    message_ar := 'طلب حجز جديد للمريض ' || pname_ar || ' بتاريخ ' || appt_local || ' في انتظار المراجعة.';
  ELSE
    title_en := 'New appointment';
    title_ar := 'موعد جديد';
    message_en := 'New appointment booked for ' || pname_en || ' on ' || appt_local;
    message_ar := 'تم حجز موعد جديد للمريض ' || pname_ar || ' في ' || appt_local;
  END IF;

  INSERT INTO public.notifications(
    user_id, branch_id, title_ar, title_en, message_ar, message_en, type,
    related_entity_type, related_entity_id
  )
  SELECT ur.user_id, NEW.branch_id, title_ar, title_en, message_ar, message_en,
         'appointment'::public.notification_type, 'appointment', NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'receptionist'::public.app_role)
    AND (public.has_role(ur.user_id, 'system_owner'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.staff_branches sb WHERE sb.user_id = ur.user_id AND sb.branch_id = NEW.branch_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_create_notifications ON public.appointments;
CREATE TRIGGER appointment_create_notifications
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_appointment_create_notifications();


-- Pending requests must not generate patient reminders before staff approval.
CREATE OR REPLACE FUNCTION public.tg_appointment_create_reminders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hours_arr integer[];
  h integer;
  reminder_time timestamptz;
  channel public.reminder_channel;
  ns_channel text;
  msg_en text;
  msg_ar text;
  appt_local text;
BEGIN
  IF NEW.booking_request_status = 'pending' THEN RETURN NEW; END IF;
  IF NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now() THEN RETURN NEW; END IF;
  SELECT reminder_hours_before INTO hours_arr FROM public.appointment_settings WHERE branch_id = NEW.branch_id LIMIT 1;
  IF hours_arr IS NULL OR array_length(hours_arr, 1) IS NULL THEN hours_arr := ARRAY[24, 2]::integer[]; END IF;
  SELECT reminder_channel::text INTO ns_channel FROM public.notification_settings WHERE branch_id = NEW.branch_id LIMIT 1;
  channel := COALESCE(NULLIF(ns_channel, ''), 'sms')::public.reminder_channel;
  appt_local := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI');
  msg_en := 'Reminder: You have an appointment on ' || appt_local;
  msg_ar := 'تذكير: لديك موعد بتاريخ ' || appt_local;
  FOREACH h IN ARRAY hours_arr LOOP
    reminder_time := NEW.scheduled_at - (h || ' hours')::interval;
    IF reminder_time > now() THEN
      INSERT INTO public.reminders(appointment_id, patient_id, branch_id, reminder_type, scheduled_time, message_ar, message_en, status)
      VALUES (NEW.id, NEW.patient_id, NEW.branch_id, channel, reminder_time, msg_ar, msg_en, 'pending');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_create_reminders ON public.appointments;
CREATE TRIGGER appointment_create_reminders
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_appointment_create_reminders();

CREATE OR REPLACE FUNCTION public.ensure_appointment_reminders(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  hours_arr integer[];
  h integer;
  reminder_time timestamptz;
  channel public.reminder_channel;
  ns_channel text;
  appt_local text;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_appt.status::text IN ('cancelled','no_show') OR v_appt.booking_request_status = 'pending' OR v_appt.scheduled_at <= now() THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.reminders WHERE appointment_id = v_appt.id AND status = 'pending') THEN RETURN; END IF;
  SELECT reminder_hours_before INTO hours_arr FROM public.appointment_settings WHERE branch_id = v_appt.branch_id LIMIT 1;
  IF hours_arr IS NULL OR array_length(hours_arr, 1) IS NULL THEN hours_arr := ARRAY[24, 2]::integer[]; END IF;
  SELECT reminder_channel::text INTO ns_channel FROM public.notification_settings WHERE branch_id = v_appt.branch_id LIMIT 1;
  channel := COALESCE(NULLIF(ns_channel, ''), 'sms')::public.reminder_channel;
  appt_local := to_char(v_appt.scheduled_at, 'YYYY-MM-DD HH24:MI');
  FOREACH h IN ARRAY hours_arr LOOP
    reminder_time := v_appt.scheduled_at - (h || ' hours')::interval;
    IF reminder_time > now() THEN
      INSERT INTO public.reminders(appointment_id, patient_id, branch_id, reminder_type, scheduled_time, message_ar, message_en, status)
      VALUES (v_appt.id, v_appt.patient_id, v_appt.branch_id, channel,
              reminder_time,
              'تذكير: لديك موعد بتاريخ ' || appt_local,
              'Reminder: You have an appointment on ' || appt_local,
              'pending');
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_appointment_reminders(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_public_booking_requests(p_branch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (public.has_permission(auth.uid(), 'appointments.edit'::text) AND public.user_has_branch_access(p_branch_id))
  ) THEN RAISE EXCEPTION 'booking_request_expiry_forbidden'; END IF;
  UPDATE public.appointments
     SET status = 'cancelled'::public.appointment_status,
         booking_request_status = 'expired', updated_at = now()
   WHERE branch_id = p_branch_id AND deleted_at IS NULL
     AND booking_request_status = 'pending'
     AND booking_request_expires_at IS NOT NULL AND booking_request_expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.reminders r SET status = 'cancelled'
   WHERE r.status = 'pending' AND r.appointment_id IN (
     SELECT a.id FROM public.appointments a
      WHERE a.branch_id = p_branch_id AND a.booking_request_status = 'expired'
        AND a.status = 'cancelled'::public.appointment_status
   );
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_public_booking(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_settings public.appointment_settings%ROWTYPE;
  v_conflict boolean := false;
  v_overlap_count integer := 0;
  v_capacity integer := 1;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_appt.booking_request_status <> 'pending' THEN RAISE EXCEPTION 'booking_request_not_pending'; END IF;
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (public.has_permission(auth.uid(), 'appointments.edit'::text) AND public.user_has_branch_access(v_appt.branch_id))
  ) THEN RAISE EXCEPTION 'booking_confirmation_forbidden'; END IF;
  IF v_appt.booking_request_expires_at IS NOT NULL AND v_appt.booking_request_expires_at <= now() THEN
    UPDATE public.appointments SET status = 'cancelled', booking_request_status = 'expired', updated_at = now() WHERE id = v_appt.id;
    UPDATE public.reminders SET status = 'cancelled' WHERE appointment_id = v_appt.id AND status = 'pending';
    RAISE EXCEPTION 'booking_request_expired';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_appt.branch_id::text || ':' || v_appt.scheduled_at::text || ':' || COALESCE(v_appt.service_id::text, ''), 0));
  SELECT * INTO v_settings FROM public.appointment_settings WHERE branch_id = v_appt.branch_id LIMIT 1;
  IF v_appt.resource_id IS NOT NULL THEN
    SELECT COALESCE(r.capacity, 1) INTO v_capacity FROM public.booking_resources r WHERE r.id = v_appt.resource_id;
    SELECT count(*)::integer INTO v_overlap_count FROM public.appointments a
     WHERE a.id <> v_appt.id AND a.branch_id = v_appt.branch_id AND a.resource_id = v_appt.resource_id
       AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show')
       AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
       AND a.scheduled_at < v_appt.scheduled_at + make_interval(mins => COALESCE(v_appt.duration_minutes, 30))
       AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > v_appt.scheduled_at;
  ELSIF v_appt.doctor_id IS NOT NULL THEN
    v_capacity := 1;
    SELECT count(*)::integer INTO v_overlap_count FROM public.appointments a
     WHERE a.id <> v_appt.id AND a.branch_id = v_appt.branch_id AND a.doctor_id = v_appt.doctor_id
       AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show')
       AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
       AND a.scheduled_at < v_appt.scheduled_at + make_interval(mins => COALESCE(v_appt.duration_minutes, 30))
       AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > v_appt.scheduled_at;
  ELSE
    v_capacity := COALESCE(v_settings.max_appointments_per_slot, 1);
    SELECT count(*)::integer INTO v_overlap_count FROM public.appointments a
     WHERE a.id <> v_appt.id AND a.branch_id = v_appt.branch_id
       AND a.deleted_at IS NULL AND a.status::text NOT IN ('cancelled','no_show')
       AND (a.booking_request_status <> 'pending' OR a.booking_request_expires_at IS NULL OR a.booking_request_expires_at > now())
       AND a.scheduled_at < v_appt.scheduled_at + make_interval(mins => COALESCE(v_appt.duration_minutes, 30))
       AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > v_appt.scheduled_at;
  END IF;
  v_conflict := v_overlap_count >= GREATEST(v_capacity, 1);
  IF v_conflict THEN RAISE EXCEPTION 'slot_unavailable'; END IF;

  UPDATE public.appointments
     SET status = 'confirmed', booking_request_status = 'confirmed', booking_request_expires_at = NULL,
         booking_confirmed_at = now(), booking_confirmed_by = auth.uid(), updated_at = now()
   WHERE id = v_appt.id;
  PERFORM public.ensure_appointment_reminders(v_appt.id);
  RETURN jsonb_build_object('appointment_id', v_appt.id, 'booking_request_status', 'confirmed');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_public_booking(p_appointment_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_branch_id uuid; v_reason text := NULLIF(trim(p_reason), '');
BEGIN
  IF v_reason IS NULL THEN RAISE EXCEPTION 'booking_rejection_reason_required'; END IF;
  IF length(v_reason) > 1000 THEN RAISE EXCEPTION 'booking_rejection_reason_too_long'; END IF;
  SELECT branch_id INTO v_branch_id FROM public.appointments
   WHERE id = p_appointment_id AND deleted_at IS NULL AND booking_request_status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_request_not_pending'; END IF;
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (public.has_permission(auth.uid(), 'appointments.edit'::text) AND public.user_has_branch_access(v_branch_id))
  ) THEN RAISE EXCEPTION 'booking_rejection_forbidden'; END IF;
  UPDATE public.appointments
     SET status = 'cancelled', booking_request_status = 'rejected', booking_request_expires_at = NULL,
         booking_rejection_reason = v_reason, booking_rejected_at = now(), booking_rejected_by = auth.uid(), updated_at = now()
   WHERE id = p_appointment_id;
  UPDATE public.reminders SET status = 'cancelled' WHERE appointment_id = p_appointment_id AND status = 'pending';
  RETURN jsonb_build_object('appointment_id', p_appointment_id, 'booking_request_status', 'rejected');
END;
$$;

-- Include the global System Owner and branch-mapped operational recipients.
CREATE OR REPLACE FUNCTION public.tg_appointment_create_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pname_en text; pname_ar text; appt_local text; title_en text; title_ar text; message_en text; message_ar text;
BEGIN
  SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name_en, last_name_en)), ''), 'patient'),
         COALESCE(NULLIF(trim(concat_ws(' ', first_name_ar, last_name_ar)), ''), 'مريض')
    INTO pname_en, pname_ar FROM public.patients WHERE id = NEW.patient_id;
  appt_local := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI');
  IF NEW.booking_request_status = 'pending' THEN
    title_en := 'Booking request needs confirmation'; title_ar := 'طلب حجز يحتاج إلى تأكيد';
    message_en := 'A new booking request for ' || pname_en || ' on ' || appt_local || ' is waiting for review.';
    message_ar := 'طلب حجز جديد للمريض ' || pname_ar || ' بتاريخ ' || appt_local || ' في انتظار المراجعة.';
  ELSE
    title_en := 'New appointment'; title_ar := 'موعد جديد';
    message_en := 'New appointment booked for ' || pname_en || ' on ' || appt_local;
    message_ar := 'تم حجز موعد جديد للمريض ' || pname_ar || ' في ' || appt_local;
  END IF;
  INSERT INTO public.notifications(user_id, branch_id, title_ar, title_en, message_ar, message_en, type, related_entity_type, related_entity_id)
  SELECT ur.user_id, NEW.branch_id, title_ar, title_en, message_ar, message_en,
         'appointment'::public.notification_type, 'appointment', NEW.id
    FROM public.user_roles ur
   WHERE ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'receptionist'::public.app_role, 'system_owner'::public.app_role)
     AND (ur.role = 'system_owner'::public.app_role OR EXISTS (
       SELECT 1 FROM public.staff_branches sb WHERE sb.user_id = ur.user_id AND sb.branch_id = NEW.branch_id
     ));
  RETURN NEW;
END;
$$;
