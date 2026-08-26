-- Per-workspace/branch email delivery settings. Provider secrets remain in
-- protected columns or Worker secrets and are never exposed by the safe view.
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_provider text NOT NULL DEFAULT 'cloudflare',
  ADD COLUMN IF NOT EXISTS email_reply_to text;

ALTER TABLE public.notification_settings
  DROP CONSTRAINT IF EXISTS notification_settings_email_provider_check;
ALTER TABLE public.notification_settings
  ADD CONSTRAINT notification_settings_email_provider_check
  CHECK (email_provider IN ('cloudflare', 'resend'));

CREATE OR REPLACE VIEW public.safe_notification_settings AS
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
  meta_phone_number_id,
  twilio_account_sid, twilio_from_whatsapp, twilio_from_sms,
  smsmisr_environment, smsmisr_language,
  winback_enabled, winback_inactive_days,
  created_at, updated_at,
  email_reply_to, email_enabled, email_provider
FROM public.notification_settings;

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

  patch := jsonb_populate_record(NULL::public.notification_settings, COALESCE(p_settings, '{}'::jsonb));

  IF current_row.id IS NULL THEN
    INSERT INTO public.notification_settings (
      branch_id,
      send_appointment_reminders, reminder_channel,
      send_appointment_confirmation, send_appointment_cancellation,
      send_invoice_notification, send_payment_receipt,
      send_birthday_greeting, birthday_discount_percentage,
      send_follow_up_reminder, follow_up_days_after,
      email_sender_name, email_sender_address, email_reply_to,
      email_enabled, email_provider,
      sms_sender_id, whatsapp_business_number,
      whatsapp_api_key, whatsapp_api_url, sms_api_key, sms_api_url,
      whatsapp_enabled, sms_enabled, whatsapp_provider, sms_provider,
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
      patch.email_sender_name, patch.email_sender_address, patch.email_reply_to,
      COALESCE(patch.email_enabled, false), COALESCE(patch.email_provider, 'cloudflare'),
      patch.sms_sender_id, patch.whatsapp_business_number,
      patch.whatsapp_api_key, patch.whatsapp_api_url, patch.sms_api_key, patch.sms_api_url,
      COALESCE(patch.whatsapp_enabled, false), COALESCE(patch.sms_enabled, false),
      COALESCE(patch.whatsapp_provider, 'custom'::public.whatsapp_provider),
      COALESCE(patch.sms_provider, 'custom'::public.sms_provider),
      patch.meta_phone_number_id, patch.twilio_account_sid, patch.twilio_auth_token,
      patch.twilio_from_whatsapp, patch.twilio_from_sms,
      COALESCE(patch.winback_enabled, false), COALESCE(patch.winback_inactive_days, 120),
      patch.smsmisr_username, patch.smsmisr_password, patch.smsmisr_sender_token,
      COALESCE(patch.smsmisr_environment, 2), COALESCE(patch.smsmisr_language, 1)
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
      email_reply_to = COALESCE(patch.email_reply_to, current_row.email_reply_to),
      email_enabled = COALESCE(patch.email_enabled, current_row.email_enabled),
      email_provider = COALESCE(patch.email_provider, current_row.email_provider),
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

CREATE OR REPLACE FUNCTION public.patient_portal_send_context(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patient public.patients%ROWTYPE;
  v_account public.patient_portal_accounts%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_profile public.clinic_profile%ROWTYPE;
  v_settings public.notification_settings%ROWTYPE;
  v_allowed boolean := false;
  v_is_system_owner boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('allowed', false); END IF;
  v_is_system_owner := public.has_role(auth.uid(), 'system_owner'::public.app_role);
  IF v_is_system_owner OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role, 'receptionist'::public.app_role, 'doctor'::public.app_role, 'nurse'::public.app_role)
  ) THEN
    SELECT * INTO v_patient FROM public.patients WHERE id = p_patient_id AND deleted_at IS NULL;
    SELECT * INTO v_account FROM public.patient_portal_accounts WHERE patient_id = p_patient_id;
    SELECT * INTO v_branch FROM public.branches WHERE id = v_patient.branch_id;
    SELECT * INTO v_profile FROM public.clinic_profile WHERE branch_id = v_patient.branch_id;
    SELECT * INTO v_settings FROM public.notification_settings WHERE branch_id = v_patient.branch_id;
    IF v_patient.id IS NOT NULL AND v_account.auth_user_id IS NOT NULL AND v_account.portal_enabled = true AND v_account.status = 'active'
       AND (v_is_system_owner OR public.user_has_branch_access(v_patient.branch_id)) THEN v_allowed := true; END IF;
  END IF;
  IF NOT v_allowed THEN RETURN jsonb_build_object('allowed', false); END IF;
  RETURN jsonb_build_object(
    'allowed', true,
    'email', v_patient.email,
    'phone', v_patient.phone,
    'patient_name', COALESCE(v_patient.first_name_en, v_patient.first_name_ar, 'Patient'),
    'patient_name_ar', COALESCE(v_patient.first_name_ar, v_patient.first_name_en, 'المريض'),
    'clinic_name', COALESCE(v_profile.clinic_name_en, v_branch.name_en, 'Clinic'),
    'clinic_name_ar', COALESCE(v_profile.clinic_name_ar, v_branch.name_ar, 'العيادة'),
    'whatsapp_opt_in', COALESCE(v_patient.whatsapp_opt_in, false),
    'branch_id', v_patient.branch_id,
    'support_email', (SELECT s.support_email FROM public.patient_portal_settings s WHERE s.branch_id = v_patient.branch_id LIMIT 1),
    'support_phone', (SELECT s.support_phone FROM public.patient_portal_settings s WHERE s.branch_id = v_patient.branch_id LIMIT 1),
    'email_enabled', COALESCE(v_settings.email_enabled, false),
    'email_provider', COALESCE(v_settings.email_provider, 'cloudflare'),
    'email_sender_name', COALESCE(v_settings.email_sender_name, v_profile.clinic_name_en, v_branch.name_en),
    'email_sender_address', v_settings.email_sender_address,
    'email_reply_to', v_settings.email_reply_to
  );
END;
$$;
REVOKE ALL ON FUNCTION public.patient_portal_send_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_portal_send_context(uuid) TO authenticated;
