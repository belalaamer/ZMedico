-- SMS Misr provider support for Egyptian SMS delivery.
-- Credentials are stored server-side and intentionally excluded from browser SELECT grants.

DO $$
BEGIN
  ALTER TYPE public.sms_provider ADD VALUE IF NOT EXISTS 'smsmisr';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS smsmisr_username text,
  ADD COLUMN IF NOT EXISTS smsmisr_password text,
  ADD COLUMN IF NOT EXISTS smsmisr_sender_token text,
  ADD COLUMN IF NOT EXISTS smsmisr_environment integer NOT NULL DEFAULT 2
    CHECK (smsmisr_environment IN (1, 2)),
  ADD COLUMN IF NOT EXISTS smsmisr_language integer NOT NULL DEFAULT 1
    CHECK (smsmisr_language IN (1, 2, 3));

-- Keep the browser unable to read SMS Misr credentials. The admin UI may still
-- write a newly entered value; existing values are never returned to it.
REVOKE SELECT ON public.notification_settings FROM authenticated;
GRANT SELECT (
  id, branch_id,
  send_appointment_reminders, reminder_channel,
  send_appointment_confirmation, send_appointment_cancellation,
  send_invoice_notification, send_payment_receipt,
  send_birthday_greeting, birthday_discount_percentage,
  send_follow_up_reminder, follow_up_days_after,
  email_sender_name, email_sender_address,
  sms_sender_id, whatsapp_business_number,
  whatsapp_api_url, sms_api_url,
  whatsapp_enabled, sms_enabled,
  whatsapp_provider, sms_provider,
  meta_phone_number_id, twilio_account_sid,
  twilio_from_whatsapp, twilio_from_sms,
  smsmisr_environment, smsmisr_language,
  winback_enabled, winback_inactive_days,
  created_at, updated_at
) ON public.notification_settings TO authenticated;

DROP VIEW IF EXISTS public.safe_notification_settings;
CREATE VIEW public.safe_notification_settings
WITH (security_invoker = true) AS
SELECT
  id, branch_id,
  send_appointment_reminders, reminder_channel,
  send_appointment_confirmation, send_appointment_cancellation,
  send_invoice_notification, send_payment_receipt,
  send_birthday_greeting, birthday_discount_percentage,
  send_follow_up_reminder, follow_up_days_after,
  email_sender_name, email_sender_address,
  sms_sender_id, whatsapp_business_number,
  whatsapp_api_url, sms_api_url,
  whatsapp_enabled, sms_enabled,
  whatsapp_provider, sms_provider,
  meta_phone_number_id, twilio_account_sid,
  twilio_from_whatsapp, twilio_from_sms,
  smsmisr_environment, smsmisr_language,
  winback_enabled, winback_inactive_days,
  created_at, updated_at
FROM public.notification_settings;

REVOKE ALL ON public.safe_notification_settings FROM PUBLIC, anon;
GRANT SELECT ON public.safe_notification_settings TO authenticated;
GRANT SELECT ON public.safe_notification_settings TO service_role;
