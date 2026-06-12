
CREATE OR REPLACE FUNCTION public._set_cron_secret(p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
BEGIN
  -- Apply to current session immediately
  PERFORM set_config('app.send_reminder_cron_secret', p_secret, false);
  -- Persist for the roles that run pg_cron jobs
  FOR r IN SELECT unnest(ARRAY['postgres','supabase_admin','authenticator']) LOOP
    BEGIN
      EXECUTE format('ALTER ROLE %I SET app.send_reminder_cron_secret = %L', r, p_secret);
    EXCEPTION WHEN OTHERS THEN
      -- ignore roles we cannot alter in this environment
      NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._set_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._set_cron_secret(text) TO service_role;
