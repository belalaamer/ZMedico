-- Appointment times in notifications and reminder texts must read as clinic-local
-- 12-hour time.
--
-- Finding (owner-reported, 2026-11-04): booking a patient at 8:00 PM Cairo
-- (18:00 UTC) produced "New appointment booked for ... on 2026-11-04 18:00" in
-- the Topbar bell and the notifications center. Every producer called
--   to_char(<timestamptz>, '<date> <24-hour time>')
-- without AT TIME ZONE, so the database session TimeZone (UTC on Supabase)
-- rendered the raw instant, and always with a 24-hour clock.
--
-- Fix: one helper renders an instant in the clinic timezone (Africa/Cairo --
-- the deployed schema has no per-branch timezone column) on a 12-hour clock,
-- with the language's meridiem marker: "8:00 PM" (en) / "8:00 م" (ar).
-- Every appointment-time producer uses it:
--   1. tg_appointment_create_notifications()  -> public.notifications text
--   2. tg_appointment_create_reminders()       -> public.reminders text
--   3. ensure_appointment_reminders(uuid)      -> public.reminders text
--   4. enqueue_appointment_event(...)          -> template payload + rendered text
-- The date keeps its existing ISO YYYY-MM-DD shape; only the zone and clock
-- change. No grant, RLS, trigger attachment, timing, or consent behaviour is
-- touched. Rows already stored keep the text they were written with.

BEGIN;

-- ---- preflight: refuse to overwrite an unreviewed body ---------------------------
DO $$
DECLARE
  v text;
  fn text;
  needle text;
  checks text[] := ARRAY[
    'tg_appointment_create_notifications|New appointment booked for ',
    'tg_appointment_create_reminders|Reminder: You have an appointment on ',
    'ensure_appointment_reminders|تذكير: لديك موعد بتاريخ ',
    'enqueue_appointment_event|appointment_time'
  ];
  item text;
BEGIN
  FOREACH item IN ARRAY checks LOOP
    fn := split_part(item, '|', 1);
    needle := split_part(item, '|', 2);
    SELECT pg_get_functiondef(p.oid) INTO v
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn;
    IF v IS NULL THEN
      RAISE EXCEPTION 'clinic-time preflight: public.%() is missing', fn;
    END IF;
    IF v NOT LIKE '%' || needle || '%' THEN
      RAISE EXCEPTION 'clinic-time preflight: public.%() drifted, reviewed behaviour "%" is missing', fn, needle;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(p.oid) INTO v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'enqueue_appointment_event';
  IF v NOT LIKE '%whatsapp_opt_in%' OR v NOT LIKE '%communication_event_enabled%' THEN
    RAISE EXCEPTION 'clinic-time preflight: enqueue_appointment_event() lost its consent gates';
  END IF;
END;
$$;

-- ---- shared formatter -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.format_clinic_time(
  p_ts timestamptz,
  p_lang text DEFAULT 'en'::text,
  p_with_date boolean DEFAULT true
) RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_ts IS NULL THEN NULL
    ELSE
      (CASE WHEN p_with_date
        THEN to_char(p_ts AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') || ' '
        ELSE ''
      END)
      || CASE WHEN lower(COALESCE(p_lang, 'en')) = 'ar'
           THEN replace(replace(to_char(p_ts AT TIME ZONE 'Africa/Cairo', 'FMHH12:MI AM'), 'AM', 'ص'), 'PM', 'م')
           ELSE to_char(p_ts AT TIME ZONE 'Africa/Cairo', 'FMHH12:MI AM')
         END
  END
$$;

-- The helper only formats a value the caller already holds; it exposes no rows.
REVOKE ALL ON FUNCTION public.format_clinic_time(timestamptz, text, boolean) FROM PUBLIC;

-- ---- 1. in-app notifications ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_appointment_create_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pname_en text;
  pname_ar text;
  appt_local_en text;
  appt_local_ar text;
  title_en text;
  title_ar text;
  message_en text;
  message_ar text;
BEGIN
  SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name_en, last_name_en)), ''), 'patient'),
         COALESCE(NULLIF(trim(concat_ws(' ', first_name_ar, last_name_ar)), ''), 'مريض')
    INTO pname_en, pname_ar
    FROM public.patients WHERE id = NEW.patient_id;
  appt_local_en := public.format_clinic_time(NEW.scheduled_at, 'en');
  appt_local_ar := public.format_clinic_time(NEW.scheduled_at, 'ar');
  IF NEW.booking_request_status = 'pending' THEN
    title_en := 'Booking request needs confirmation';
    title_ar := 'طلب حجز يحتاج إلى تأكيد';
    message_en := 'A new booking request for ' || pname_en || ' on ' || appt_local_en || ' is waiting for review.';
    message_ar := 'طلب حجز جديد للمريض ' || pname_ar || ' بتاريخ ' || appt_local_ar || ' في انتظار المراجعة.';
  ELSE
    title_en := 'New appointment';
    title_ar := 'موعد جديد';
    message_en := 'New appointment booked for ' || pname_en || ' on ' || appt_local_en;
    message_ar := 'تم حجز موعد جديد للمريض ' || pname_ar || ' في ' || appt_local_ar;
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

-- ---- 2. insert-trigger reminders ------------------------------------------------
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
  appt_local_en text;
  appt_local_ar text;
BEGIN
  IF NEW.booking_request_status = 'pending' THEN RETURN NEW; END IF;
  IF NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now() THEN RETURN NEW; END IF;

  IF NOT public.communication_event_enabled(NEW.branch_id, 'appointment_reminder') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.communication_templates
     WHERE branch_id = NEW.branch_id
       AND event_type = 'appointment_reminder'
       AND enabled = true
  ) THEN
    RETURN NEW;
  END IF;

  SELECT reminder_hours_before INTO hours_arr
    FROM public.appointment_settings WHERE branch_id = NEW.branch_id LIMIT 1;
  IF hours_arr IS NULL OR array_length(hours_arr, 1) IS NULL THEN
    hours_arr := ARRAY[24, 2]::integer[];
  END IF;
  SELECT reminder_channel::text INTO ns_channel
    FROM public.notification_settings WHERE branch_id = NEW.branch_id LIMIT 1;
  channel := COALESCE(NULLIF(ns_channel, ''), 'sms')::public.reminder_channel;
  appt_local_en := public.format_clinic_time(NEW.scheduled_at, 'en');
  appt_local_ar := public.format_clinic_time(NEW.scheduled_at, 'ar');
  msg_en := 'Reminder: You have an appointment on ' || appt_local_en;
  msg_ar := 'تذكير: لديك موعد بتاريخ ' || appt_local_ar;
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

-- ---- 3. approval-path reminders -------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_appointment_reminders(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  hours_arr integer[];
  h integer;
  reminder_time timestamptz;
  channel public.reminder_channel;
  ns_channel text;
  appt_local_en text;
  appt_local_ar text;
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

  IF NOT public.communication_event_enabled(v_appt.branch_id, 'appointment_reminder') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.communication_templates
     WHERE branch_id = v_appt.branch_id
       AND event_type = 'appointment_reminder'
       AND enabled = true
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
  appt_local_en := public.format_clinic_time(v_appt.scheduled_at, 'en');
  appt_local_ar := public.format_clinic_time(v_appt.scheduled_at, 'ar');
  FOREACH h IN ARRAY hours_arr LOOP
    reminder_time := v_appt.scheduled_at - (h || ' hours')::interval;
    IF reminder_time > now() THEN
      INSERT INTO public.reminders(
        appointment_id, patient_id, branch_id, reminder_type, scheduled_time,
        message_ar, message_en, status
      ) VALUES (
        v_appt.id, v_appt.patient_id, v_appt.branch_id, channel, reminder_time,
        'تذكير: لديك موعد بتاريخ ' || appt_local_ar,
        'Reminder: You have an appointment on ' || appt_local_en,
        'pending'
      );
    END IF;
  END LOOP;
END;
$$;

-- ---- 4. templated WhatsApp/e-mail path ------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_appointment_event(
  p_appointment_id uuid,
  p_event_type text,
  p_event_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  p record;
  b record;
  tpl record;
  payload jsonb;
  scheduled timestamptz;
  key text;
BEGIN
  IF p_event_type NOT IN ('booking_confirmation','appointment_reminder','appointment_rescheduled','appointment_cancelled') THEN
    RETURN;
  END IF;

  SELECT id, patient_id, branch_id, scheduled_at, status, updated_at
    INTO a FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_event_type NOT IN ('appointment_cancelled') AND a.status IN ('cancelled','no_show') THEN RETURN; END IF;
  IF NOT public.communication_event_enabled(a.branch_id, p_event_type) THEN RETURN; END IF;

  SELECT id,
         COALESCE(NULLIF(trim(first_name_en || ' ' || COALESCE(last_name_en, '')), ''), trim(first_name_ar || ' ' || COALESCE(last_name_ar, ''))) AS name_en,
         COALESCE(NULLIF(trim(first_name_ar || ' ' || COALESCE(last_name_ar, '')), ''), trim(first_name_en || ' ' || COALESCE(last_name_en, ''))) AS name_ar,
         phone, whatsapp_opt_in, name_language
    INTO p FROM public.patients WHERE id = a.patient_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT name_en, name_ar INTO b FROM public.branches WHERE id = a.branch_id;

  FOR tpl IN
    SELECT * FROM public.communication_templates
    WHERE branch_id = a.branch_id
      AND event_type = p_event_type
      AND enabled = true
  LOOP
        IF tpl.channel = 'whatsapp' AND NOT COALESCE(p.whatsapp_opt_in, false) THEN
      CONTINUE;
    END IF;
    IF tpl.channel = 'whatsapp'
       AND COALESCE((SELECT whatsapp_provider::text FROM public.notification_settings WHERE branch_id = a.branch_id), 'custom') = 'meta'
       AND NULLIF(trim(tpl.meta_template_name), '') IS NULL THEN
      CONTINUE;
    END IF;
    IF p_event_type = 'appointment_reminder' THEN

      IF tpl.hours_before IS NULL OR tpl.hours_before <= 0 THEN CONTINUE; END IF;
      scheduled := a.scheduled_at - make_interval(hours => tpl.hours_before);
      IF scheduled <= now() THEN CONTINUE; END IF;
      key := a.id::text || ':appointment_reminder:' || scheduled::text || ':' || tpl.channel;
    ELSE
      scheduled := now();
      key := a.id::text || ':' || p_event_type || ':' || COALESCE(p_event_key, a.updated_at::text) || ':' || tpl.channel;
    END IF;

    payload := jsonb_build_object(
      'patient_name', COALESCE(p.name_en, ''),
      'patient_name_ar', COALESCE(p.name_ar, ''),
      'appointment_date', to_char(a.scheduled_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD'),
      'appointment_time', public.format_clinic_time(a.scheduled_at, 'en', false),
      'appointment_time_ar', public.format_clinic_time(a.scheduled_at, 'ar', false),
      'branch_name', COALESCE(b.name_en, ''),
      'branch_name_ar', COALESCE(b.name_ar, ''),
      'appointment_id', a.id,
      'meta_template_name', tpl.meta_template_name,
      'meta_template_language', tpl.meta_template_language,
      'meta_template_params', jsonb_build_array(
        CASE WHEN COALESCE(p.name_language, 'en') = 'ar' THEN COALESCE(p.name_ar, '') ELSE COALESCE(p.name_en, '') END,
        public.format_clinic_time(a.scheduled_at, 'en', true),
        COALESCE(b.name_en, '')
      )
    );

    INSERT INTO public.reminders (
      appointment_id, patient_id, branch_id, reminder_type, scheduled_time,
      message_en, message_ar, status, event_type, template_key, payload,
      destination_phone, destination_channel, dedupe_key
    ) VALUES (
      a.id, a.patient_id, a.branch_id, tpl.channel::public.reminder_channel, scheduled,
      public.render_template(tpl.body_en, payload),
      public.render_template(
        tpl.body_ar,
        payload || jsonb_build_object(
          'appointment_time', public.format_clinic_time(a.scheduled_at, 'ar', false)
        )
      ),
      'pending', p_event_type, p_event_type || ':' || tpl.channel, payload,
      p.phone, tpl.channel, key
    ) ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ---- postflight: shape and rendered value --------------------------------------
DO $$
DECLARE
  v text;
  fn text;
  helper text;
  fns text[] := ARRAY[
    'tg_appointment_create_notifications',
    'tg_appointment_create_reminders',
    'ensure_appointment_reminders',
    'enqueue_appointment_event'
  ];
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO helper
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'format_clinic_time';
  IF helper IS NULL THEN
    RAISE EXCEPTION 'clinic-time postflight: public.format_clinic_time() is missing';
  END IF;
  IF helper NOT LIKE '%Africa/Cairo%' OR helper NOT LIKE '%FMHH12%' THEN
    RAISE EXCEPTION 'clinic-time postflight: helper lost the clinic zone or the 12-hour clock';
  END IF;

  IF public.format_clinic_time('2026-11-04 18:00:00+00'::timestamptz, 'en') <> '2026-11-04 8:00 PM'
     OR public.format_clinic_time('2026-11-04 18:00:00+00'::timestamptz, 'ar') <> '2026-11-04 8:00 م'
     OR public.format_clinic_time('2026-11-04 18:00:00+00'::timestamptz, 'en', false) <> '8:00 PM' THEN
    RAISE EXCEPTION 'clinic-time postflight: helper produced an unexpected rendering';
  END IF;

  FOREACH fn IN ARRAY fns LOOP
    SELECT pg_get_functiondef(p.oid) INTO v
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn;
    IF v IS NULL THEN
      RAISE EXCEPTION 'clinic-time postflight: public.%() is missing', fn;
    END IF;
    IF v NOT LIKE '%format_clinic_time%' THEN
      RAISE EXCEPTION 'clinic-time postflight: %() does not use the clinic-time helper', fn;
    END IF;
    IF v LIKE '%HH24%' THEN
      RAISE EXCEPTION 'clinic-time postflight: %() still renders a 24-hour clock', fn;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
