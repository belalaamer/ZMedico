-- Package A / Fix 4: seed notification config for the single existing branch.
--
-- Both notification_settings and communication_templates were EMPTY, which is
-- why send-reminder failed every delivery ("provider not configured") and
-- enqueue-winback skipped the branch with reason "no_template".
--
-- Deliberate safety choices:
--   * whatsapp_enabled / sms_enabled = false -> nothing can be sent until the
--     clinic owner enters real provider credentials via /settings/communication.
--   * winback_enabled = false -> enabling the cron does NOT immediately message
--     all 38 existing patients. The owner opts in explicitly.
--   * No provider secret or API key is written here.
--
-- Template placeholders use the {{var}} syntax implemented by enqueue-winback's
-- render(): {{patient_name}} and {{patient_name_ar}}.
--
-- Schema CHECK constraints respected:
--   event_type IN (booking_confirmation, appointment_reminder, win_back)
--   channel    IN (whatsapp, sms, email)
--   hours_before > 0 for appointment_reminder, NULL for everything else
--
-- Applied to the live database on 2026-08-03 as migration 20260803090057.
-- Idempotent: safe to re-run.

INSERT INTO public.notification_settings (branch_id, whatsapp_enabled, sms_enabled, winback_enabled)
SELECT b.id, false, false, false
FROM public.branches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_settings ns WHERE ns.branch_id = b.id
);

WITH b AS (SELECT id FROM public.branches WHERE is_main_branch = true LIMIT 1)
INSERT INTO public.communication_templates (branch_id, event_type, channel, enabled, hours_before, body_en, body_ar)
SELECT b.id, v.event_type, v.channel, true, v.hours_before, v.body_en, v.body_ar
FROM b
CROSS JOIN (VALUES
  (
    'booking_confirmation', 'whatsapp', NULL::int,
    'Hello {{patient_name}}, your appointment at Blitz Physio has been confirmed. We look forward to seeing you.',
    'أهلاً {{patient_name_ar}}، تم تأكيد حجز موعدك في بليتز فيزيو. في انتظارك.'
  ),
  (
    'appointment_reminder', 'whatsapp', 24,
    'Reminder: {{patient_name}}, you have an appointment at Blitz Physio tomorrow. Please arrive 10 minutes early.',
    'تذكير: {{patient_name_ar}}، عندك موعد في بليتز فيزيو بكرة. برجاء الحضور قبل الموعد بعشر دقائق.'
  ),
  (
    'win_back', 'whatsapp', NULL::int,
    'Hello {{patient_name}}, it has been a while since your last visit to Blitz Physio. How are you feeling? We are here whenever you need us.',
    'أهلاً {{patient_name_ar}}، بقالك فترة من آخر زيارة ليك في بليتز فيزيو. عامل إيه دلوقتي؟ إحنا موجودين في أي وقت تحتاجنا.'
  )
) AS v(event_type, channel, hours_before, body_en, body_ar)
WHERE NOT EXISTS (
  SELECT 1 FROM public.communication_templates ct
  WHERE ct.branch_id = b.id AND ct.event_type = v.event_type AND ct.channel = v.channel
);
