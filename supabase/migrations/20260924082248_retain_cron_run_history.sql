-- Keep pg_cron execution history bounded.
-- Supabase documents that cron.job_run_details is not cleaned automatically
-- and recommends retaining only the latest seven days.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'job-run-details-cleanup'
  ) THEN
    PERFORM cron.schedule(
      'job-run-details-cleanup',
      '0 0 * * *',
      $cron$DELETE FROM cron.job_run_details
            WHERE end_time < now() - interval '7 days'$cron$
    );
  END IF;
END
$$;

DELETE FROM cron.job_run_details
WHERE end_time < now() - interval '7 days';
