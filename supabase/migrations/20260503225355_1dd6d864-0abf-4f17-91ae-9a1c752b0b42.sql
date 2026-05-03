
-- Provider enums
DO $$ BEGIN
  CREATE TYPE public.whatsapp_provider AS ENUM ('twilio','meta','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sms_provider AS ENUM ('twilio','messagebird','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_provider public.whatsapp_provider NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS sms_provider public.sms_provider NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS meta_phone_number_id text,
  ADD COLUMN IF NOT EXISTS twilio_account_sid text,
  ADD COLUMN IF NOT EXISTS twilio_auth_token text,
  ADD COLUMN IF NOT EXISTS twilio_from_whatsapp text,
  ADD COLUMN IF NOT EXISTS twilio_from_sms text;

-- Enable extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
