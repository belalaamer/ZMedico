-- Save notification settings through a SECURITY DEFINER RPC.
-- The browser never receives the base-table secrets or a RETURNING * response.
CREATE OR REPLACE FUNCTION public.upsert_notification_settings(
  p_branch_id uuid,
  p_settings jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.notification_settings;
  patch public.notification_settings;
BEGIN
  IF p_branch_id IS NULL
     OR NOT (
       public.has_permission(auth.uid(), 'settings.edit')
       OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
     )
     OR NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'permission denied for notification settings'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO current_row
  FROM public.notification_settings
  WHERE branch_id = p_branch_id
  FOR UPDATE;

  patch := jsonb_populate_record(
    NULL::public.notification_settings,
    COALESCE(p_settings, '{}'::jsonb)
  );

  IF current_row.id IS NULL THEN
    INSERT INTO public.notification_settings (
      branch_id,
      send_appointment_reminders, reminder_channel,
      send_appointment_confirmation, send_appointment_cancellation,
      send_invoice_notification, send_payment_receipt,
      send_birthday_greeting, birthday_discount_percentage,
      send_follow_up_reminder, follow_up_days_after,
      email_sender_name, email_sender_address,
      sms_sender_id, whatsapp_business_number,
      whatsapp_api_key, whatsapp_api_url,
      sms_api_key, sms_api_url,
      whatsapp_enabled, sms_enabled,
      whatsapp_provider, sms_provider,
      meta_phone_number_id, twilio_account_sid, twilio_auth_token,
      twilio_from_whatsapp, twilio_from_sms,
      winback_enabled, winback_inactive_days,
      smsmisr_username, smsmisr_password, smsmisr_sender_token,
      smsmisr_environment, smsmisr_language
    ) VALUES (
      p_branch_id,
      COALESCE(patch.send_appointment_reminders, true),
      COALESCE(patch.reminder_channel, 'email'::public.notification_channel),
      COALESCE(patch.send_appointment_confirmation, true),
      COALESCE(patch.send_appointment_cancellation, true),
      COALESCE(patch.send_invoice_notification, true),
      COALESCE(patch.send_payment_receipt, true),
      COALESCE(patch.send_birthday_greeting, false),
      COALESCE(patch.birthday_discount_percentage, 0),
      COALESCE(patch.send_follow_up_reminder, true),
      COALESCE(patch.follow_up_days_after, 7),
      patch.email_sender_name, patch.email_sender_address,
      patch.sms_sender_id, patch.whatsapp_business_number,
      patch.whatsapp_api_key, patch.whatsapp_api_url,
      patch.sms_api_key, patch.sms_api_url,
      COALESCE(patch.whatsapp_enabled, false),
      COALESCE(patch.sms_enabled, false),
      COALESCE(patch.whatsapp_provider, 'custom'::public.whatsapp_provider),
      COALESCE(patch.sms_provider, 'custom'::public.sms_provider),
      patch.meta_phone_number_id, patch.twilio_account_sid, patch.twilio_auth_token,
      patch.twilio_from_whatsapp, patch.twilio_from_sms,
      COALESCE(patch.winback_enabled, false),
      COALESCE(patch.winback_inactive_days, 120),
      patch.smsmisr_username, patch.smsmisr_password, patch.smsmisr_sender_token,
      COALESCE(patch.smsmisr_environment, 2),
      COALESCE(patch.smsmisr_language, 1)
    );
  ELSE
    UPDATE public.notification_settings
    SET
      send_appointment_reminders = COALESCE(patch.send_appointment_reminders, current_row.send_appointment_reminders),
      reminder_channel = COALESCE(patch.reminder_channel, current_row.reminder_channel),
      send_appointment_confirmation = COALESCE(patch.send_appointment_confirmation, current_row.send_appointment_confirmation),
      send_appointment_cancellation = COALESCE(patch.send_appointment_cancellation, current_row.send_appointment_cancellation),
      send_invoice_notification = COALESCE(patch.send_invoice_notification, current_row.send_invoice_notification),
      send_payment_receipt = COALESCE(patch.send_payment_receipt, current_row.send_payment_receipt),
      send_birthday_greeting = COALESCE(patch.send_birthday_greeting, current_row.send_birthday_greeting),
      birthday_discount_percentage = COALESCE(patch.birthday_discount_percentage, current_row.birthday_discount_percentage),
      send_follow_up_reminder = COALESCE(patch.send_follow_up_reminder, current_row.send_follow_up_reminder),
      follow_up_days_after = COALESCE(patch.follow_up_days_after, current_row.follow_up_days_after),
      email_sender_name = COALESCE(patch.email_sender_name, current_row.email_sender_name),
      email_sender_address = COALESCE(patch.email_sender_address, current_row.email_sender_address),
      sms_sender_id = COALESCE(patch.sms_sender_id, current_row.sms_sender_id),
      whatsapp_business_number = COALESCE(patch.whatsapp_business_number, current_row.whatsapp_business_number),
      whatsapp_api_key = COALESCE(patch.whatsapp_api_key, current_row.whatsapp_api_key),
      whatsapp_api_url = COALESCE(patch.whatsapp_api_url, current_row.whatsapp_api_url),
      sms_api_key = COALESCE(patch.sms_api_key, current_row.sms_api_key),
      sms_api_url = COALESCE(patch.sms_api_url, current_row.sms_api_url),
      whatsapp_enabled = COALESCE(patch.whatsapp_enabled, current_row.whatsapp_enabled),
      sms_enabled = COALESCE(patch.sms_enabled, current_row.sms_enabled),
      whatsapp_provider = COALESCE(patch.whatsapp_provider, current_row.whatsapp_provider),
      sms_provider = COALESCE(patch.sms_provider, current_row.sms_provider),
      meta_phone_number_id = COALESCE(patch.meta_phone_number_id, current_row.meta_phone_number_id),
      twilio_account_sid = COALESCE(patch.twilio_account_sid, current_row.twilio_account_sid),
      twilio_auth_token = COALESCE(patch.twilio_auth_token, current_row.twilio_auth_token),
      twilio_from_whatsapp = COALESCE(patch.twilio_from_whatsapp, current_row.twilio_from_whatsapp),
      twilio_from_sms = COALESCE(patch.twilio_from_sms, current_row.twilio_from_sms),
      winback_enabled = COALESCE(patch.winback_enabled, current_row.winback_enabled),
      winback_inactive_days = COALESCE(patch.winback_inactive_days, current_row.winback_inactive_days),
      smsmisr_username = COALESCE(patch.smsmisr_username, current_row.smsmisr_username),
      smsmisr_password = COALESCE(patch.smsmisr_password, current_row.smsmisr_password),
      smsmisr_sender_token = COALESCE(patch.smsmisr_sender_token, current_row.smsmisr_sender_token),
      smsmisr_environment = COALESCE(patch.smsmisr_environment, current_row.smsmisr_environment),
      smsmisr_language = COALESCE(patch.smsmisr_language, current_row.smsmisr_language),
      updated_at = now()
    WHERE id = current_row.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_notification_settings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_notification_settings(uuid, jsonb) TO authenticated, service_role;
