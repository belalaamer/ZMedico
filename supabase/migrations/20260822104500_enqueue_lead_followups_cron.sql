-- The job only creates internal lead_followups rows. It does not send SMS,
-- WhatsApp, or email and therefore remains safe while providers are unverified.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'enqueue-lead-followups-daily' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule(
    'enqueue-lead-followups-daily',
    '0 3 * * *',
    $job$SELECT public.invoke_reminder_function('enqueue-lead-followups', '{}'::jsonb);$job$
  );
END $$;
