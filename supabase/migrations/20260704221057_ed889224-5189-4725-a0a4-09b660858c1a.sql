REVOKE EXECUTE ON FUNCTION public._set_cron_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._get_cron_secret() FROM PUBLIC, anon, authenticated;