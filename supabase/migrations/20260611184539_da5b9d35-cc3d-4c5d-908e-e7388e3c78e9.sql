
-- =========================================================
-- Automated Communication v1
-- =========================================================

-- 1) reminders: new columns
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'manual'
    CHECK (event_type IN ('booking_confirmation','appointment_reminder','win_back','manual')),
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS destination_phone text,
  ADD COLUMN IF NOT EXISTS destination_channel text;

-- Generated column for monthly win-back uniqueness in UTC
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS winback_month date
  GENERATED ALWAYS AS (
    CASE WHEN event_type = 'win_back'
         THEN (date_trunc('month', scheduled_time AT TIME ZONE 'UTC'))::date
    END
  ) STORED;

-- Unique idempotency for appointment-bound enqueues
CREATE UNIQUE INDEX IF NOT EXISTS reminders_appt_event_time_uniq
  ON public.reminders (appointment_id, event_type, scheduled_time)
  WHERE appointment_id IS NOT NULL
    AND event_type IN ('booking_confirmation','appointment_reminder');

-- Win-back: at most one per patient per UTC calendar month
CREATE UNIQUE INDEX IF NOT EXISTS reminders_winback_monthly_uniq
  ON public.reminders (patient_id, winback_month)
  WHERE event_type = 'win_back' AND patient_id IS NOT NULL;

-- Due poller index
CREATE INDEX IF NOT EXISTS reminders_status_scheduled_idx
  ON public.reminders (status, scheduled_time);

-- 2) notification_settings: win-back fields
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS winback_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS winback_inactive_days integer NOT NULL DEFAULT 120
    CHECK (winback_inactive_days > 0);

-- 3) communication_templates
CREATE TABLE IF NOT EXISTS public.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('booking_confirmation','appointment_reminder','win_back')),
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  enabled boolean NOT NULL DEFAULT true,
  body_en text NOT NULL DEFAULT '',
  body_ar text NOT NULL DEFAULT '',
  hours_before integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (event_type = 'appointment_reminder' AND hours_before IS NOT NULL AND hours_before > 0)
    OR (event_type <> 'appointment_reminder' AND hours_before IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS comm_tpl_uniq
  ON public.communication_templates (branch_id, event_type, channel, COALESCE(hours_before, -1));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_templates TO authenticated;
GRANT ALL ON public.communication_templates TO service_role;

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_tpl read" ON public.communication_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "comm_tpl admin write" ON public.communication_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS comm_tpl_touch ON public.communication_templates;
CREATE TRIGGER comm_tpl_touch BEFORE UPDATE ON public.communication_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) Helper: render template body
CREATE OR REPLACE FUNCTION public.render_template(body text, payload jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k text; v text; out_text text := COALESCE(body,'');
BEGIN
  IF payload IS NULL THEN RETURN out_text; END IF;
  FOR k, v IN SELECT key, COALESCE(value::text, '') FROM jsonb_each_text(payload)
  LOOP
    out_text := replace(out_text, '{{' || k || '}}', v);
  END LOOP;
  RETURN out_text;
END;
$$;

-- 5) Enqueue logic for appointments
CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      a.id, a.patient_id, a.branch_id, tpl.channel::reminder_type, sched,
      public.render_template(tpl.body_en, payload),
      public.render_template(tpl.body_ar, payload),
      'pending', tpl.event_type, tpl.event_type || ':' || tpl.channel, payload,
      p.phone, tpl.channel
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_appt_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_appointment_reminders(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appt_enqueue_on_insert ON public.appointments;
CREATE TRIGGER appt_enqueue_on_insert
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appt_after_insert();

CREATE OR REPLACE FUNCTION public.trg_appt_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('cancelled','no_show')
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    UPDATE public.reminders
       SET status = 'cancelled'
     WHERE appointment_id = NEW.id
       AND status = 'pending'
       AND event_type = 'appointment_reminder';
  END IF;

  IF NEW.status NOT IN ('cancelled','no_show')
     AND NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    PERFORM public.enqueue_appointment_reminders(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appt_enqueue_on_update ON public.appointments;
CREATE TRIGGER appt_enqueue_on_update
  AFTER UPDATE OF scheduled_at, status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appt_after_update();
