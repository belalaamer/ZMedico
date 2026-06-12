
CREATE OR REPLACE FUNCTION public._set_cron_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'send_reminder_cron_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_secret, 'send_reminder_cron_secret', 'Shared bearer for pg_cron -> edge function auth');
  ELSE
    PERFORM vault.update_secret(v_id, p_secret, 'send_reminder_cron_secret', 'Shared bearer for pg_cron -> edge function auth');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._set_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._set_cron_secret(text) TO service_role;

-- Helper that returns the secret. SECURITY DEFINER, locked to service_role and postgres only.
CREATE OR REPLACE FUNCTION public._get_cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'send_reminder_cron_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._get_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._get_cron_secret() TO service_role;
