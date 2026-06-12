
CREATE OR REPLACE FUNCTION public._set_cron_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  db text := current_database();
BEGIN
  EXECUTE format('ALTER DATABASE %I SET app.send_reminder_cron_secret = %L', db, p_secret);
  -- Apply to current session too so immediate reads work
  PERFORM set_config('app.send_reminder_cron_secret', p_secret, false);
END;
$$;

REVOKE ALL ON FUNCTION public._set_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._set_cron_secret(text) TO service_role;
