
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS whatsapp_api_key text,
  ADD COLUMN IF NOT EXISTS whatsapp_api_url text,
  ADD COLUMN IF NOT EXISTS sms_api_key text,
  ADD COLUMN IF NOT EXISTS sms_api_url text;

CREATE OR REPLACE FUNCTION public.tg_appointment_create_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now() THEN
    RETURN NEW;
  END IF;

  SELECT reminder_hours_before INTO hours_arr
    FROM public.appointment_settings
    WHERE branch_id = NEW.branch_id
    LIMIT 1;
  IF hours_arr IS NULL OR array_length(hours_arr, 1) IS NULL THEN
    hours_arr := ARRAY[24, 2]::integer[];
  END IF;

  SELECT reminder_channel::text INTO ns_channel
    FROM public.notification_settings
    WHERE branch_id = NEW.branch_id
    LIMIT 1;
  channel := COALESCE(NULLIF(ns_channel, ''), 'sms')::public.reminder_channel;

  appt_local := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI');
  msg_en := 'Reminder: You have an appointment on ' || appt_local;
  msg_ar := 'تذكير: لديك موعد بتاريخ ' || appt_local;

  FOREACH h IN ARRAY hours_arr LOOP
    reminder_time := NEW.scheduled_at - (h || ' hours')::interval;
    IF reminder_time > now() THEN
      INSERT INTO public.reminders(
        appointment_id, patient_id, branch_id,
        reminder_type, scheduled_time, message_ar, message_en, status
      ) VALUES (
        NEW.id, NEW.patient_id, NEW.branch_id,
        channel, reminder_time, msg_ar, msg_en, 'pending'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_create_reminders ON public.appointments;
CREATE TRIGGER appointment_create_reminders
AFTER INSERT ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.tg_appointment_create_reminders();

CREATE OR REPLACE FUNCTION public.tg_appointment_create_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pname_en text;
  pname_ar text;
  appt_local text;
BEGIN
  SELECT
    COALESCE(NULLIF(trim(concat_ws(' ', first_name_en, last_name_en)), ''), 'patient'),
    COALESCE(NULLIF(trim(concat_ws(' ', first_name_ar, last_name_ar)), ''), 'مريض')
  INTO pname_en, pname_ar
  FROM public.patients WHERE id = NEW.patient_id;

  appt_local := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI');

  INSERT INTO public.notifications(
    user_id, title_ar, title_en, message_ar, message_en, type,
    related_entity_type, related_entity_id
  )
  SELECT
    ur.user_id,
    'موعد جديد',
    'New appointment',
    'تم حجز موعد جديد للمريض ' || pname_ar || ' في ' || appt_local,
    'New appointment booked for ' || pname_en || ' on ' || appt_local,
    'appointment'::public.notification_type,
    'appointment',
    NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'receptionist'::public.app_role);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_create_notifications ON public.appointments;
CREATE TRIGGER appointment_create_notifications
AFTER INSERT ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.tg_appointment_create_notifications();
