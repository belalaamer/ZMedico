-- WhatsApp clinic communications: event coverage, consent, provider templates,
-- idempotency, and backend enqueue triggers.
-- No provider secret is stored by this migration.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source text;

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

ALTER TABLE public.communication_templates
  ADD COLUMN IF NOT EXISTS meta_template_name text,
  ADD COLUMN IF NOT EXISTS meta_template_language text NOT NULL DEFAULT 'ar';

ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_event_type_check;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_event_type_check CHECK (
    event_type IN (
      'booking_confirmation', 'appointment_reminder', 'appointment_rescheduled',
      'appointment_cancelled', 'invoice_issued', 'payment_receipt', 'win_back', 'manual'
    )
  );

ALTER TABLE public.communication_templates DROP CONSTRAINT IF EXISTS communication_templates_event_type_check;
ALTER TABLE public.communication_templates
  ADD CONSTRAINT communication_templates_event_type_check CHECK (
    event_type IN (
      'booking_confirmation', 'appointment_reminder', 'appointment_rescheduled',
      'appointment_cancelled', 'invoice_issued', 'payment_receipt', 'win_back'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS reminders_dedupe_key_uniq
  ON public.reminders (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS reminders_provider_message_idx
  ON public.reminders (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- The system owner may manage templates while ordinary clinic users remain
-- restricted to their assigned branch.
DROP POLICY IF EXISTS "comm_tpl read" ON public.communication_templates;
CREATE POLICY "comm_tpl read" ON public.communication_templates
  FOR SELECT TO authenticated
  USING (public.user_has_branch_access(branch_id));

DROP POLICY IF EXISTS "comm_tpl admin write" ON public.communication_templates;
CREATE POLICY "comm_tpl admin write" ON public.communication_templates
  FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'system_owner'::public.app_role))
    AND public.user_has_branch_access(branch_id)
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.has_role(auth.uid(), 'system_owner'::public.app_role))
    AND public.user_has_branch_access(branch_id)
  );

CREATE OR REPLACE FUNCTION public.communication_event_enabled(
  p_branch_id uuid,
  p_event_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_event_type
    WHEN 'booking_confirmation' THEN COALESCE((SELECT send_appointment_confirmation FROM public.notification_settings WHERE branch_id = p_branch_id), true)
    WHEN 'appointment_reminder' THEN COALESCE((SELECT send_appointment_reminders FROM public.notification_settings WHERE branch_id = p_branch_id), true)
    WHEN 'appointment_rescheduled' THEN COALESCE((SELECT send_appointment_confirmation FROM public.notification_settings WHERE branch_id = p_branch_id), true)
    WHEN 'appointment_cancelled' THEN COALESCE((SELECT send_appointment_cancellation FROM public.notification_settings WHERE branch_id = p_branch_id), true)
    WHEN 'invoice_issued' THEN COALESCE((SELECT send_invoice_notification FROM public.notification_settings WHERE branch_id = p_branch_id), true)
    WHEN 'payment_receipt' THEN COALESCE((SELECT send_payment_receipt FROM public.notification_settings WHERE branch_id = p_branch_id), true)
    WHEN 'win_back' THEN COALESCE((SELECT winback_enabled FROM public.notification_settings WHERE branch_id = p_branch_id), false)
    ELSE false
  END;
$$;

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
      'appointment_time', to_char(a.scheduled_at AT TIME ZONE 'Africa/Cairo', 'HH24:MI'),
      'branch_name', COALESCE(b.name_en, ''),
      'branch_name_ar', COALESCE(b.name_ar, ''),
      'appointment_id', a.id,
      'meta_template_name', tpl.meta_template_name,
      'meta_template_language', tpl.meta_template_language,
      'meta_template_params', jsonb_build_array(
        CASE WHEN COALESCE(p.name_language, 'en') = 'ar' THEN COALESCE(p.name_ar, '') ELSE COALESCE(p.name_en, '') END,
        to_char(a.scheduled_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'),
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
      public.render_template(tpl.body_ar, payload),
      'pending', p_event_type, p_event_type || ':' || tpl.channel, payload,
      p.phone, tpl.channel, key
    ) ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_appointment_event(p_appointment_id, 'booking_confirmation');
  PERFORM public.enqueue_appointment_event(p_appointment_id, 'appointment_reminder');
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_appt_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled','no_show') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.reminders
       SET status = 'cancelled'
     WHERE appointment_id = NEW.id
       AND status = 'pending'
       AND event_type = 'appointment_reminder';
    PERFORM public.enqueue_appointment_event(NEW.id, 'appointment_cancelled', NEW.updated_at::text);
  ELSIF NEW.status NOT IN ('cancelled','no_show') AND NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    UPDATE public.reminders
       SET status = 'cancelled'
     WHERE appointment_id = NEW.id
       AND status = 'pending'
       AND event_type = 'appointment_reminder';
    PERFORM public.enqueue_appointment_event(NEW.id, 'appointment_rescheduled', NEW.updated_at::text);
    PERFORM public.enqueue_appointment_event(NEW.id, 'appointment_reminder');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_invoice_event(
  p_invoice_id uuid,
  p_event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i record;
  p record;
  b record;
  tpl record;
  payload jsonb;
BEGIN
  IF p_event_type <> 'invoice_issued' THEN RETURN; END IF;

  SELECT inv.id, inv.patient_id, inv.branch_id, inv.invoice_number, inv.total, inv.paid_amount
    INTO i FROM public.invoices inv WHERE inv.id = p_invoice_id;
  IF NOT FOUND OR i.branch_id IS NULL OR i.status::text = 'draft' OR NOT public.communication_event_enabled(i.branch_id, p_event_type) THEN RETURN; END IF;

  SELECT first_name_en, last_name_en, first_name_ar, last_name_ar, phone, whatsapp_opt_in, name_language
    INTO p FROM public.patients WHERE id = i.patient_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT name_en, name_ar INTO b FROM public.branches WHERE id = i.branch_id;

  FOR tpl IN SELECT * FROM public.communication_templates WHERE branch_id = i.branch_id AND event_type = p_event_type AND enabled = true LOOP
    IF tpl.channel = 'whatsapp' AND NOT COALESCE(p.whatsapp_opt_in, false) THEN CONTINUE; END IF;
    IF tpl.channel = 'whatsapp'
       AND COALESCE((SELECT whatsapp_provider::text FROM public.notification_settings WHERE branch_id = i.branch_id), 'custom') = 'meta'
       AND NULLIF(trim(tpl.meta_template_name), '') IS NULL THEN CONTINUE; END IF;
    payload := jsonb_build_object(
      'patient_name', trim(COALESCE(p.first_name_en,'') || ' ' || COALESCE(p.last_name_en,'')),
      'patient_name_ar', trim(COALESCE(p.first_name_ar,'') || ' ' || COALESCE(p.last_name_ar,'')),
      'invoice_number', i.invoice_number,
      'total', i.total,
      'paid_amount', i.paid_amount,
      'remaining', GREATEST(COALESCE(i.total,0) - COALESCE(i.paid_amount,0), 0),
      'branch_name', COALESCE(b.name_en, ''),
      'branch_name_ar', COALESCE(b.name_ar, ''),
      'invoice_id', i.id,
      'meta_template_name', tpl.meta_template_name,
      'meta_template_language', tpl.meta_template_language,
      'meta_template_params', jsonb_build_array(
        CASE WHEN COALESCE(p.name_language, 'en') = 'ar' THEN trim(COALESCE(p.first_name_ar,'') || ' ' || COALESCE(p.last_name_ar,'')) ELSE trim(COALESCE(p.first_name_en,'') || ' ' || COALESCE(p.last_name_en,'')) END,
        i.invoice_number,
        i.total::text,
        GREATEST(COALESCE(i.total,0) - COALESCE(i.paid_amount,0), 0)::text
      )
    );
    INSERT INTO public.reminders (
      invoice_id, patient_id, branch_id, reminder_type, scheduled_time,
      message_en, message_ar, status, event_type, template_key, payload,
      destination_phone, destination_channel, dedupe_key
    ) VALUES (
      i.id, i.patient_id, i.branch_id, tpl.channel::public.reminder_channel, now(),
      public.render_template(tpl.body_en, payload), public.render_template(tpl.body_ar, payload),
      'pending', p_event_type, p_event_type || ':' || tpl.channel, payload,
      p.phone, tpl.channel, i.id::text || ':' || p_event_type || ':' || tpl.channel
    ) ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_payment_receipt(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay record;
  i record;
  p record;
  b record;
  tpl record;
  payload jsonb;
BEGIN
  SELECT py.id, py.patient_id, py.branch_id, py.invoice_id, py.amount, py.payment_date
    INTO pay FROM public.payments py WHERE py.id = p_payment_id;
  IF NOT FOUND OR pay.branch_id IS NULL OR NOT public.communication_event_enabled(pay.branch_id, 'payment_receipt') THEN RETURN; END IF;
  SELECT invoice_number, total, paid_amount INTO i FROM public.invoices WHERE id = pay.invoice_id;
  SELECT first_name_en, last_name_en, first_name_ar, last_name_ar, phone, whatsapp_opt_in, name_language
    INTO p FROM public.patients WHERE id = pay.patient_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT name_en, name_ar INTO b FROM public.branches WHERE id = pay.branch_id;

  FOR tpl IN SELECT * FROM public.communication_templates WHERE branch_id = pay.branch_id AND event_type = 'payment_receipt' AND enabled = true LOOP
    IF tpl.channel = 'whatsapp' AND NOT COALESCE(p.whatsapp_opt_in, false) THEN CONTINUE; END IF;
    IF tpl.channel = 'whatsapp'
       AND COALESCE((SELECT whatsapp_provider::text FROM public.notification_settings WHERE branch_id = pay.branch_id), 'custom') = 'meta'
       AND NULLIF(trim(tpl.meta_template_name), '') IS NULL THEN CONTINUE; END IF;
    payload := jsonb_build_object(
      'patient_name', trim(COALESCE(p.first_name_en,'') || ' ' || COALESCE(p.last_name_en,'')),
      'patient_name_ar', trim(COALESCE(p.first_name_ar,'') || ' ' || COALESCE(p.last_name_ar,'')),
      'amount', pay.amount,
      'payment_date', pay.payment_date,
      'invoice_number', COALESCE(i.invoice_number, ''),
      'remaining', GREATEST(COALESCE(i.total,0) - COALESCE(i.paid_amount,0), 0),
      'branch_name', COALESCE(b.name_en, ''),
      'branch_name_ar', COALESCE(b.name_ar, ''),
      'payment_id', pay.id,
      'meta_template_name', tpl.meta_template_name,
      'meta_template_language', tpl.meta_template_language,
      'meta_template_params', jsonb_build_array(
        CASE WHEN COALESCE(p.name_language, 'en') = 'ar' THEN trim(COALESCE(p.first_name_ar,'') || ' ' || COALESCE(p.last_name_ar,'')) ELSE trim(COALESCE(p.first_name_en,'') || ' ' || COALESCE(p.last_name_en,'')) END,
        pay.amount::text,
        COALESCE(i.invoice_number, '')
      )
    );
    INSERT INTO public.reminders (
      payment_id, invoice_id, patient_id, branch_id, reminder_type, scheduled_time,
      message_en, message_ar, status, event_type, template_key, payload,
      destination_phone, destination_channel, dedupe_key
    ) VALUES (
      pay.id, pay.invoice_id, pay.patient_id, pay.branch_id, tpl.channel::public.reminder_channel, now(),
      public.render_template(tpl.body_en, payload), public.render_template(tpl.body_ar, payload),
      'pending', 'payment_receipt', 'payment_receipt:' || tpl.channel, payload,
      p.phone, tpl.channel, pay.id::text || ':payment_receipt:' || tpl.channel
    ) ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- Trigger wrappers are used because PostgreSQL trigger functions receive
-- NEW/OLD records rather than arbitrary argument expressions.
CREATE OR REPLACE FUNCTION public.trg_invoice_enqueue_communication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_invoice_event(NEW.id, 'invoice_issued');
  RETURN NEW;
END;
$$;

INSERT INTO public.communication_templates (
  branch_id, event_type, channel, enabled, hours_before, body_en, body_ar
)
SELECT b.id, v.event_type, 'whatsapp', false, NULL, v.body_en, v.body_ar
FROM public.branches b
CROSS JOIN (VALUES
  ('appointment_rescheduled', 'Appointment update: {{patient_name}}, your appointment has been rescheduled to {{appointment_date}} at {{branch_name}}.', 'تحديث الموعد: {{patient_name_ar}}، تم إعادة جدولة موعدك إلى {{appointment_date}} في {{branch_name_ar}}.'),
  ('appointment_cancelled', 'Hello {{patient_name}}, your appointment at {{branch_name}} on {{appointment_date}} has been cancelled. Please contact us to reschedule.', 'أهلاً {{patient_name_ar}}، تم إلغاء موعدك في {{branch_name_ar}} بتاريخ {{appointment_date}}. تواصل معنا لإعادة الحجز.'),
  ('invoice_issued', 'Hello {{patient_name}}, invoice {{invoice_number}} from {{branch_name}} totals {{total}}. Remaining: {{remaining}}.', 'أهلاً {{patient_name_ar}}، فاتورتك رقم {{invoice_number}} من {{branch_name_ar}} بإجمالي {{total}}. المتبقي: {{remaining}}.'),
  ('payment_receipt', 'Thank you {{patient_name}}. We received {{amount}} for invoice {{invoice_number}}.', 'شكرًا {{patient_name_ar}}. تم استلام دفعة {{amount}} للفاتورة رقم {{invoice_number}}.')
) AS v(event_type, body_en, body_ar)
WHERE NOT EXISTS (
  SELECT 1 FROM public.communication_templates ct
  WHERE ct.branch_id = b.id AND ct.event_type = v.event_type AND ct.channel = 'whatsapp'
);

CREATE OR REPLACE FUNCTION public.trg_payment_enqueue_communication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_payment_receipt(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_enqueue_communication ON public.invoices;
CREATE TRIGGER invoice_enqueue_communication
  AFTER INSERT OR UPDATE OF status, total, paid_amount ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_enqueue_communication();

DROP TRIGGER IF EXISTS payment_enqueue_communication ON public.payments;
CREATE TRIGGER payment_enqueue_communication
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_payment_enqueue_communication();

REVOKE EXECUTE ON FUNCTION public.communication_event_enabled(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_appointment_event(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_invoice_event(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_payment_receipt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.communication_event_enabled(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_event(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_invoice_event(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_payment_receipt(uuid) TO service_role;
