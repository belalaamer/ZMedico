-- Prevent admin sessions from reading plaintext third-party API secrets via PostgREST.
-- Root cause: table-level SELECT on notification_settings exposed sms_api_key, whatsapp_api_key,
-- twilio_auth_token in `select *`. RLS cannot filter columns, so we enforce it with
-- column-level GRANTs. Writes remain admin-only via existing RLS; edge functions read via
-- service_role, which bypasses column grants.

REVOKE SELECT ON public.notification_settings FROM authenticated;
REVOKE SELECT ON public.notification_settings FROM anon;

GRANT SELECT (
  id, branch_id, created_at, updated_at,
  birthday_discount_percentage,
  email_sender_address, email_sender_name,
  follow_up_days_after,
  meta_phone_number_id,
  reminder_channel,
  send_appointment_cancellation, send_appointment_confirmation, send_appointment_reminders,
  send_birthday_greeting, send_follow_up_reminder,
  send_invoice_notification, send_payment_receipt,
  sms_api_url, sms_enabled, sms_provider, sms_sender_id,
  twilio_account_sid, twilio_from_sms, twilio_from_whatsapp,
  whatsapp_api_url, whatsapp_business_number, whatsapp_enabled, whatsapp_provider,
  winback_enabled, winback_inactive_days
) ON public.notification_settings TO authenticated;

-- Keep write privileges intact (admin RLS still gates the row).
GRANT INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;