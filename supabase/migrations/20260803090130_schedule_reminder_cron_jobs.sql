-- Package A / Fix 3: activate the scheduler.
--
-- send-reminder and enqueue-winback were written, deployed and secure, but
-- nothing ever invoked them: no pg_cron job existed. Result: all 26 reminders
-- sat undelivered. pg_cron and pg_net were already installed.
--
-- Both functions authenticate with:
--   Authorization: Bearer <SEND_REMINDER_CRON_SECRET>
-- We generate that shared secret here and store it in Vault, so it is never
-- hardcoded in SQL, committed to the repo, or printed in plaintext.
--
-- MANUAL STEP REQUIRED (cannot be done from SQL): the same value must be set as
-- the SEND_REMINDER_CRON_SECRET Edge Function secret in the Supabase Dashboard
-- (Project Settings -> Edge Functions -> Secrets). Read the value from
-- Dashboard -> Vault -> send_reminder_cron_secret.
-- Until then these jobs receive HTTP 401 and do nothing -- harmless, since
-- message delivery is disabled at the settings level anyway.
--
-- Applied to the live database on 2026-08-03 as migration 20260803090130.
-- Idempotent: safe to re-run.

-- 1) Create the shared secret only if it does not already exist.
DO $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'send_reminder_cron_secret') THEN
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(
      v_secret,
      'send_reminder_cron_secret',
      'Shared bearer secret used by pg_cron to invoke the send-reminder and enqueue-winback Edge Functions. Must match the SEND_REMINDER_CRON_SECRET Edge Function secret.'
    );
  END IF;
END $$;

-- 2) Dispatch helper: reads the secret from Vault at call time.
CREATE OR REPLACE FUNCTION public.invoke_reminder_function(_fn text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'send_reminder_cron_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'send_reminder_cron_secret missing from Vault; skipping %', _fn;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/' || _fn,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := _body,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_reminder_function(text, jsonb) FROM PUBLIC, anon, authenticated;

-- 3) Schedule. Idempotent: drop any prior job of the same name first.
DO $$
BEGIN
  PERFORM cron.unschedule('send-due-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('enqueue-winback-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-due-reminders',
  '*/15 * * * *',
  $cron$ SELECT public.invoke_reminder_function('send-reminder', '{"due_only": true}'::jsonb); $cron$
);

SELECT cron.schedule(
  'enqueue-winback-daily',
  '0 2 * * *',
  $cron$ SELECT public.invoke_reminder_function('enqueue-winback', '{}'::jsonb); $cron$
);
