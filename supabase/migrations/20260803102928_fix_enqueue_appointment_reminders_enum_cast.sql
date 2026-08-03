-- Hotfix: appointment creation failed with: type "reminder_type" does not exist.
--
-- public.enqueue_appointment_reminders() cast the template channel with
--   tpl.channel::reminder_type
-- but `reminder_type` is the COLUMN NAME on public.reminders, not a type.
-- The actual enum is `reminder_channel` (values: sms, email, whatsapp, push).
--
-- This bug was DORMANT: the loop body only executes when the branch has rows in
-- communication_templates, and that table was empty until migration
-- 20260803090057 seeded it. Seeding therefore ACTIVATED a pre-existing defect
-- and broke INSERT on public.appointments via the `appointment_create_reminders`
-- trigger chain.
--
-- Reproduced live as a receptionist (in a rolled-back transaction):
--   patient INSERT ok; appointment INSERT FAILED: type "reminder_type" does not exist
-- After this fix, same test:
--   patient INSERT ok; appointment INSERT ok; invoice INSERT ok
--
-- Only the cast changes. The function body is otherwise byte-identical.
--
-- Applied to the live database on 2026-08-03 as migration 20260803102928.

CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders(p_appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  p record;
  tpl record;
  payload jsonb;
  sched timestamptz;
BEGIN
  SELECT id, patient_id, branch_id, scheduled_at, status
    INTO a FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND OR a.status IN ('cancelled','no_show') THEN RETURN; END IF;

  SELECT id, COALESCE(NULLIF(first_name_en,'') || ' ' || NULLIF(last_name_en,''), first_name_ar || ' ' || last_name_ar) AS name_en,
         COALESCE(first_name_ar || ' ' || last_name_ar, first_name_en || ' ' || last_name_en) AS name_ar,
         phone
    INTO p FROM public.patients WHERE id = a.patient_id;

  payload := jsonb_build_object(
    'patient_name', COALESCE(p.name_en, ''),
    'patient_name_ar', COALESCE(p.name_ar, ''),
    'appt_time', to_char(a.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'),
    'appointment_id', a.id
  );

  FOR tpl IN
    SELECT * FROM public.communication_templates
     WHERE branch_id = a.branch_id
       AND enabled = true
       AND event_type IN ('booking_confirmation','appointment_reminder')
  LOOP
    IF tpl.event_type = 'booking_confirmation' THEN
      sched := now();
    ELSE
      sched := a.scheduled_at - make_interval(hours => tpl.hours_before);
      IF sched <= now() THEN CONTINUE; END IF;
    END IF;

    INSERT INTO public.reminders (
      appointment_id, patient_id, branch_id, reminder_type, scheduled_time,
      message_en, message_ar, status, event_type, template_key, payload,
      destination_phone, destination_channel
    ) VALUES (
      a.id, a.patient_id, a.branch_id, tpl.channel::public.reminder_channel, sched,
      public.render_template(tpl.body_en, payload),
      public.render_template(tpl.body_ar, payload),
      'pending', tpl.event_type, tpl.event_type || ':' || tpl.channel, payload,
      p.phone, tpl.channel
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$function$;
