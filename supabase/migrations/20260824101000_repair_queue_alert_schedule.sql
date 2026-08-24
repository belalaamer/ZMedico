-- Repair Queue Alert scheduling with the current project endpoint.
-- The Edge Function implements its own dedicated secret guard and has verify_jwt=false.
-- No business rows are inserted or updated by this migration.

DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'detect-queue-alerts-every-5min'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'detect-queue-alerts-every-5min',
    '*/5 * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/detect-queue-alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public._get_cron_secret()
        ),
        body := jsonb_build_object('ts', now())
      ) AS request_id;
    $cron$
  );
END
$migration$;
