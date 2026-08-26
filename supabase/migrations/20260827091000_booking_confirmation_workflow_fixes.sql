-- Follow-up for 20260827090000_public_booking_confirmation_workflow.sql.
-- The initial migration was already applied in Production. This migration only
-- reapplies the post-apply fixes and adds a server-side expiry job.

-- New workspaces default to staff approval for public bookings. Existing
-- workspaces keep their explicit setting until an administrator changes it.
ALTER TABLE public.appointment_settings
  ALTER COLUMN require_confirmation SET DEFAULT true;

-- Pending requests must not create patient reminders at insert time.
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
  SELECT reminder_hours_before INTO hours_arr
    FROM public.appointment_settings WHERE branch_id = NEW.branch_id LIMIT 1;
  IF hours_arr IS NULL OR array_length(hours_arr, 1) IS NULL THEN
    hours_arr := ARRAY[24, 2]::integer[];
  END IF;
  SELECT reminder_channel::text INTO ns_channel
    FROM public.notification_settings WHERE branch_id = NEW.branch_id LIMIT 1;
  channel := COALESCE(NULLIF(ns_channel, ''), 'sms')::public.reminder_channel;
  appt_local := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI');
  msg_en := 'Reminder: You have an appointment on ' || appt_local;
  msg_ar := 'تذكير: لديك موعد بتاريخ ' || appt_local;
  FOREACH h IN ARRAY hours_arr LOOP
    reminder_time := NEW.scheduled_at - (h || ' hours')::interval;
    IF reminder_time > now() THEN
      INSERT INTO public.reminders(
        appointment_id, patient_id, branch_id, reminder_type, scheduled_time,
        message_ar, message_en, status
      ) VALUES (
        NEW.id, NEW.patient_id, NEW.branch_id, channel, reminder_time,
        msg_ar, msg_en, 'pending'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_create_reminders ON public.appointments;
CREATE TRIGGER appointment_create_reminders
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_appointment_create_reminders();

-- Used only after approval; idempotent when pending reminders already exist.
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
  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id AND deleted_at IS NULL;
  IF NOT FOUND
     OR v_appt.status::text IN ('cancelled', 'no_show')
     OR v_appt.booking_request_status = 'pending'
     OR v_appt.scheduled_at IS NULL
     OR v_appt.scheduled_at <= now() THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reminders
     WHERE appointment_id = v_appt.id AND status = 'pending'
  ) THEN
    RETURN;
  END IF;
  SELECT reminder_hours_before INTO hours_arr
    FROM public.appointment_settings WHERE branch_id = v_appt.branch_id LIMIT 1;
  IF hours_arr IS NULL OR array_length(hours_arr, 1) IS NULL THEN
    hours_arr := ARRAY[24, 2]::integer[];
  END IF;
  SELECT reminder_channel::text INTO ns_channel
    FROM public.notification_settings WHERE branch_id = v_appt.branch_id LIMIT 1;
  channel := COALESCE(NULLIF(ns_channel, ''), 'sms')::public.reminder_channel;
  appt_local := to_char(v_appt.scheduled_at, 'YYYY-MM-DD HH24:MI');
  FOREACH h IN ARRAY hours_arr LOOP
    reminder_time := v_appt.scheduled_at - (h || ' hours')::interval;
    IF reminder_time > now() THEN
      INSERT INTO public.reminders(
        appointment_id, patient_id, branch_id, reminder_type, scheduled_time,
        message_ar, message_en, status
      ) VALUES (
        v_appt.id, v_appt.patient_id, v_appt.branch_id, channel, reminder_time,
        'تذكير: لديك موعد بتاريخ ' || appt_local,
        'Reminder: You have an appointment on ' || appt_local,
        'pending'
      );
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_appointment_reminders(uuid) TO authenticated;

-- Staff-facing expiry RPC remains protected by branch authorization.
CREATE OR REPLACE FUNCTION public.expire_public_booking_requests(p_branch_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_permission(auth.uid(), 'appointments.edit'::text)
      AND public.user_has_branch_access(p_branch_id)
    )
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

  UPDATE public.reminders r
     SET status = 'cancelled'
   WHERE r.status = 'pending'
     AND r.appointment_id IN (
       SELECT a.id
         FROM public.appointments a
        WHERE a.branch_id = p_branch_id
          AND a.booking_request_status = 'expired'
          AND a.status = 'cancelled'::public.appointment_status
     );
  RETURN v_count;
END;
$$;

-- Approval checks resource capacity rather than treating every overlapping
-- appointment as a full-capacity conflict.
CREATE OR REPLACE FUNCTION public.confirm_public_booking(p_appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_settings public.appointment_settings%ROWTYPE;
  v_conflict boolean := false;
  v_overlap_count integer := 0;
  v_capacity integer := 1;
BEGIN
  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR v_appt.booking_request_status <> 'pending' THEN
    RAISE EXCEPTION 'booking_request_not_pending';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_permission(auth.uid(), 'appointments.edit'::text)
      AND public.user_has_branch_access(v_appt.branch_id)
    )
  ) THEN
    RAISE EXCEPTION 'booking_confirmation_forbidden';
  END IF;
  IF v_appt.booking_request_expires_at IS NOT NULL
     AND v_appt.booking_request_expires_at <= now() THEN
    UPDATE public.appointments
       SET status = 'cancelled',
           booking_request_status = 'expired',
           updated_at = now()
     WHERE id = v_appt.id;
    UPDATE public.reminders SET status = 'cancelled'
     WHERE appointment_id = v_appt.id AND status = 'pending';
    RAISE EXCEPTION 'booking_request_expired';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_appt.branch_id::text || ':' || v_appt.scheduled_at::text || ':' ||
      COALESCE(v_appt.service_id::text, ''), 0
    )
  );
  SELECT * INTO v_settings
    FROM public.appointment_settings
   WHERE branch_id = v_appt.branch_id
   LIMIT 1;

  IF v_appt.resource_id IS NOT NULL THEN
    SELECT COALESCE(r.capacity, 1) INTO v_capacity
      FROM public.booking_resources r WHERE r.id = v_appt.resource_id;
    SELECT count(*)::integer INTO v_overlap_count
      FROM public.appointments a
     WHERE a.id <> v_appt.id
       AND a.branch_id = v_appt.branch_id
       AND a.resource_id = v_appt.resource_id
       AND a.deleted_at IS NULL
       AND a.status::text NOT IN ('cancelled', 'no_show')
       AND (
         a.booking_request_status <> 'pending'
         OR a.booking_request_expires_at IS NULL
         OR a.booking_request_expires_at > now()
       )
       AND a.scheduled_at < v_appt.scheduled_at + make_interval(mins => COALESCE(v_appt.duration_minutes, 30))
       AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > v_appt.scheduled_at;
  ELSIF v_appt.doctor_id IS NOT NULL THEN
    v_capacity := 1;
    SELECT count(*)::integer INTO v_overlap_count
      FROM public.appointments a
     WHERE a.id <> v_appt.id
       AND a.branch_id = v_appt.branch_id
       AND a.doctor_id = v_appt.doctor_id
       AND a.deleted_at IS NULL
       AND a.status::text NOT IN ('cancelled', 'no_show')
       AND (
         a.booking_request_status <> 'pending'
         OR a.booking_request_expires_at IS NULL
         OR a.booking_request_expires_at > now()
       )
       AND a.scheduled_at < v_appt.scheduled_at + make_interval(mins => COALESCE(v_appt.duration_minutes, 30))
       AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > v_appt.scheduled_at;
  ELSE
    v_capacity := COALESCE(v_settings.max_appointments_per_slot, 1);
    SELECT count(*)::integer INTO v_overlap_count
      FROM public.appointments a
     WHERE a.id <> v_appt.id
       AND a.branch_id = v_appt.branch_id
       AND a.deleted_at IS NULL
       AND a.status::text NOT IN ('cancelled', 'no_show')
       AND (
         a.booking_request_status <> 'pending'
         OR a.booking_request_expires_at IS NULL
         OR a.booking_request_expires_at > now()
       )
       AND a.scheduled_at < v_appt.scheduled_at + make_interval(mins => COALESCE(v_appt.duration_minutes, 30))
       AND a.scheduled_at + make_interval(mins => COALESCE(a.duration_minutes, 30)) > v_appt.scheduled_at;
  END IF;

  v_conflict := v_overlap_count >= GREATEST(v_capacity, 1);
  IF v_conflict THEN RAISE EXCEPTION 'slot_unavailable'; END IF;

  UPDATE public.appointments
     SET status = 'confirmed',
         booking_request_status = 'confirmed',
         booking_request_expires_at = NULL,
         booking_confirmed_at = now(),
         booking_confirmed_by = auth.uid(),
         updated_at = now()
   WHERE id = v_appt.id;
  PERFORM public.ensure_appointment_reminders(v_appt.id);
  RETURN jsonb_build_object(
    'appointment_id', v_appt.id,
    'booking_request_status', 'confirmed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_public_booking(p_appointment_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch_id uuid;
  v_reason text := NULLIF(trim(p_reason), '');
BEGIN
  IF v_reason IS NULL THEN RAISE EXCEPTION 'booking_rejection_reason_required'; END IF;
  IF length(v_reason) > 1000 THEN RAISE EXCEPTION 'booking_rejection_reason_too_long'; END IF;

  SELECT branch_id INTO v_branch_id
    FROM public.appointments
   WHERE id = p_appointment_id
     AND deleted_at IS NULL
     AND booking_request_status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_request_not_pending'; END IF;
  IF NOT (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_permission(auth.uid(), 'appointments.edit'::text)
      AND public.user_has_branch_access(v_branch_id)
    )
  ) THEN
    RAISE EXCEPTION 'booking_rejection_forbidden';
  END IF;

  UPDATE public.appointments
     SET status = 'cancelled',
         booking_request_status = 'rejected',
         booking_request_expires_at = NULL,
         booking_rejection_reason = v_reason,
         booking_rejected_at = now(),
         booking_rejected_by = auth.uid(),
         updated_at = now()
   WHERE id = p_appointment_id;
  UPDATE public.reminders SET status = 'cancelled'
   WHERE appointment_id = p_appointment_id AND status = 'pending';
  RETURN jsonb_build_object(
    'appointment_id', p_appointment_id,
    'booking_request_status', 'rejected'
  );
END;
$$;

-- Include the global System Owner and branch-mapped operational recipients.
CREATE OR REPLACE FUNCTION public.tg_appointment_create_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
   WHERE ur.role IN (
     'admin'::public.app_role,
     'manager'::public.app_role,
     'receptionist'::public.app_role,
     'system_owner'::public.app_role
   )
     AND (
       ur.role = 'system_owner'::public.app_role
       OR EXISTS (
         SELECT 1 FROM public.staff_branches sb
          WHERE sb.user_id = ur.user_id
            AND sb.branch_id = NEW.branch_id
       )
     );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_create_notifications ON public.appointments;
CREATE TRIGGER appointment_create_notifications
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_appointment_create_notifications();

-- Server-side, idempotent cleanup. This function is intentionally not granted
-- to anon/authenticated and is callable only by the database scheduler.
CREATE OR REPLACE FUNCTION public.cron_expire_public_booking_requests()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_branch record;
  v_total integer := 0;
  v_count integer;
BEGIN
  FOR v_branch IN SELECT id FROM public.branches LOOP
    UPDATE public.appointments
       SET status = 'cancelled'::public.appointment_status,
           booking_request_status = 'expired',
           updated_at = now()
     WHERE branch_id = v_branch.id
       AND deleted_at IS NULL
       AND booking_request_status = 'pending'
       AND booking_request_expires_at IS NOT NULL
       AND booking_request_expires_at <= now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;

    UPDATE public.reminders r
       SET status = 'cancelled'
     WHERE r.status = 'pending'
       AND r.appointment_id IN (
         SELECT a.id
           FROM public.appointments a
          WHERE a.branch_id = v_branch.id
            AND a.booking_request_status = 'expired'
            AND a.status = 'cancelled'::public.appointment_status
       );
  END LOOP;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.cron_expire_public_booking_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_expire_public_booking_requests() FROM anon;
REVOKE ALL ON FUNCTION public.cron_expire_public_booking_requests() FROM authenticated;

DO $$
DECLARE
  v_job record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    FOR v_job IN
      SELECT jobid FROM cron.job WHERE jobname = 'expire-public-booking-requests'
    LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;
    PERFORM cron.schedule(
      'expire-public-booking-requests',
      '* * * * *',
      'SELECT public.cron_expire_public_booking_requests();'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_public_booking_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_public_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_public_booking(uuid, text) TO authenticated;
