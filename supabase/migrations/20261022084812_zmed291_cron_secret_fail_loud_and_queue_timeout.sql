-- ZMED-291 N-2 and N-3: make a missing cron secret fail loudly, and stop job 6 from
-- bypassing the shared helper.
--
-- N-2. invoke_reminder_function() used to answer a missing Vault secret with
--   RAISE WARNING + RETURN NULL. A WARNING does not abort the transaction, so pg_cron
--   recorded every one of those skipped runs as "succeeded", net.http_post was never
--   called, and therefore nothing appeared in net._http_response either. Both monitoring
--   channels stayed silent while all four messaging jobs (send-due-reminders,
--   enqueue-winback, enqueue-physio-followups, enqueue-lead-followups) did nothing at all.
--   The secret is now a hard precondition: if it is absent the job fails and the failure is
--   visible in cron.job_run_details.
--
-- N-3. Job 'detect-queue-alerts-every-5min' inlined its own net.http_post with no
--   timeout_milliseconds, so it inherited pg_net's 5000 ms default while the helper the
--   other jobs use sets 60000. Measured over 24 h: the three pg_net timeouts in
--   net._http_response all belong to that job and none to the helper-driven jobs. It now
--   routes through the same helper, with an identical URL, header set and body
--   (jsonb_build_object('ts', now())), so this is a timeout-and-secret-policy change only.
--   The detect-queue-alerts function keeps verify_jwt=false and its own secret guard.
--
-- No business row is read, written or corrected by this migration.

CREATE OR REPLACE FUNCTION public.invoke_reminder_function(_fn text, _body jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'send_reminder_cron_secret';

  IF v_secret IS NULL THEN
    -- Loud on purpose. A silent skip here stops every patient message in the system while
    -- pg_cron reports success. No ERRCODE override: an unrecognised condition name would
    -- only surface at runtime, which is exactly when this path is needed.
    RAISE EXCEPTION 'send_reminder_cron_secret is missing from Vault; refusing to invoke %', _fn;
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
$function$;

REVOKE ALL ON FUNCTION public.invoke_reminder_function(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_reminder_function(text, jsonb) TO service_role;

DO $migration$
DECLARE
  v_job_id bigint;
  v_command text;
  v_desired_command text :=
    'SELECT public.invoke_reminder_function(''detect-queue-alerts'', jsonb_build_object(''ts'', now()));';
BEGIN
  SELECT jobid, command INTO v_job_id, v_command
    FROM cron.job WHERE jobname = 'detect-queue-alerts-every-5min' LIMIT 1;

  IF v_job_id IS NULL THEN
    -- Nothing to re-point on a fresh environment: register it through the helper directly.
    PERFORM cron.schedule('detect-queue-alerts-every-5min', '*/5 * * * *',
      $cron$SELECT public.invoke_reminder_function('detect-queue-alerts', jsonb_build_object('ts', now()));$cron$);
  ELSIF v_command IS DISTINCT FROM v_desired_command THEN
    -- Only the command changes; the live */5 schedule is left exactly as it is.
    PERFORM cron.alter_job(job_id := v_job_id, command := v_desired_command);
  END IF;
END
$migration$;
