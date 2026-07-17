
-- 1) Revoke all SELECT (column + row) on the base table from authenticated.
REVOKE SELECT ON public.notification_settings FROM authenticated;

-- 2) Grant column-level SELECT for every NON-secret column only.
--    Secret columns intentionally excluded: whatsapp_api_key, sms_api_key, twilio_auth_token.
--    This makes it impossible for the browser client to ever read those secrets,
--    even by directly querying the base table with .select("*").
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
  winback_enabled, winback_inactive_days,
  created_at, updated_at
) ON public.notification_settings TO authenticated;

-- Edge Functions / server-side jobs still need full access to read the raw secrets.
GRANT SELECT ON public.notification_settings TO service_role;

-- 3) Secure view exposing only non-secret columns. security_invoker=true so the
--    caller's RLS (ns_select_admin: admin only) still applies row-by-row.
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
  winback_enabled, winback_inactive_days,
  created_at, updated_at
FROM public.notification_settings;

REVOKE ALL ON public.safe_notification_settings FROM PUBLIC, anon;
GRANT SELECT ON public.safe_notification_settings TO authenticated;
GRANT SELECT ON public.safe_notification_settings TO service_role;
