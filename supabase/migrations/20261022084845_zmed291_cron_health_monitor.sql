-- ZMED-291 / ZMED-287 option B1: a read-only health probe for the scheduled surface.
--
-- The reason cron needed this: measured on 2026-10-22, every one of the nine jobs reported
-- "succeeded" for seven straight days while, in the same window, three pg_net timeouts were
-- recorded against detect-queue-alerts and job 16 (booking-expiry) had never once executed
-- its loop body. pg_cron stores the completion of the *outer* statement, not the outcome of
-- the work, so a conditional job that finds nothing and a job whose dispatch silently
-- disappeared are both indistinguishable from a healthy run.
--
-- This is B1: it reads, it reports, it changes nothing. It never sends a message, never
-- calls an Edge Function and never touches a business row. The alarm channel is pg_cron's
-- own status: a detected anomaly raises, so the monitor's run is recorded as "failed" in
-- cron.job_run_details and is visible in the Supabase dashboard without any provider spend.
--
-- It also pins the one remaining cron job that no migration registered
-- ('cleanup-public-booking-rate-limits'), for the same reason as ZMED-290's job: without it
-- a rebuilt environment silently loses the rate-limit table's housekeeping.

-- Human-readable census. Owner is postgres and it is revoked from every client role: the
-- view exposes job text and timings, which are not a patient-facing concern.
-- Note the REVOKE target: a view takes table privileges. "ON VIEW name" is not in the
-- GRANT/REVOKE grammar - it parses as a relation literally named "view" and then fails on
-- the schema qualifier. service_role is revoked too: Supabase's ALTER DEFAULT PRIVILEGES
-- hands every new table to anon, authenticated and service_role, and this census is not a
-- product surface - only the monitor (and a human, as postgres) needs it.
CREATE OR REPLACE VIEW public.cron_health AS
 SELECT j.jobid,
        j.jobname,
        j.schedule,
        j.active,
        j.username,
        (SELECT max(d.end_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid) AS last_end,
        (SELECT d.status FROM cron.job_run_details d WHERE d.jobid = j.jobid
          ORDER BY d.runid DESC LIMIT 1) AS last_status,
        (SELECT count(*) FROM cron.job_run_details d
          WHERE d.jobid = j.jobid AND d.end_time > now() - interval '24 hours'
            AND d.status <> 'succeeded') AS failures_24h,
        (SELECT count(*) FROM cron.job_run_details d
          WHERE d.jobid = j.jobid AND d.end_time > now() - interval '24 hours') AS runs_24h
   FROM cron.job j;

REVOKE ALL ON TABLE public.cron_health FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_cron_health()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_anomalies text[] := '{}';
  v_missing_secret boolean;
  v_failed record;
  v_stale record;
  v_summary text;
BEGIN
  -- 1. The single Vault secret every messaging job depends on.
  SELECT (count(*) = 0) INTO v_missing_secret
    FROM vault.decrypted_secrets
   WHERE name = 'send_reminder_cron_secret' AND decrypted_secret IS NOT NULL;
  IF v_missing_secret THEN
    v_anomalies := array_append(v_anomalies,
      'Vault secret send_reminder_cron_secret is absent: all patient messaging is inert');
  END IF;

  -- 2. Any job other than this monitor that failed inside the last two hours.
  FOR v_failed IN
    SELECT d.jobid, j.jobname, count(*) AS n, max(d.return_message) AS worst
      FROM cron.job_run_details d
      JOIN cron.job j ON j.jobid = d.jobid
     WHERE d.status <> 'succeeded'
       AND d.end_time > now() - interval '2 hours'
       AND j.jobname <> 'cron-health-monitor'
     GROUP BY d.jobid, j.jobname
  LOOP
    v_anomalies := array_append(v_anomalies,
      format('job %s (%s) failed %s time(s) in 2h: %s',
             v_failed.jobid, v_failed.jobname, v_failed.n, left(v_failed.worst, 160)));
  END LOOP;

  -- 3. The dispatcher heartbeat. send-due-reminders is */15; no completed run in 20 minutes
  --    means the pg_cron worker, the job, or its schedule is gone - not a slow send, an
  --    absence.
  FOR v_stale IN
    SELECT j.jobid, j.jobname,
           (SELECT max(d.end_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid) AS last_end
      FROM cron.job j
     WHERE j.jobname = 'send-due-reminders'
       AND (SELECT max(d.end_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid)
             < now() - interval '20 minutes'
  LOOP
    v_anomalies := array_append(v_anomalies,
      format('job %s (%s) has not completed a run since %s',
             v_stale.jobid, v_stale.jobname, v_stale.last_end));
  END LOOP;

  IF array_length(v_anomalies, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'cron health: %', array_to_string(v_anomalies, ' | ');
  END IF;

  SELECT format('cron jobs=%s, runs_24h=%s, failures_24h=%s, vault secret present',
                 count(*),
                 sum(runs_24h),
                 sum(failures_24h))
    INTO v_summary
    FROM public.cron_health;

  RETURN v_summary;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_cron_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_cron_health() TO service_role;

DO $migration$
DECLARE
  v_job_id bigint;
  v_schedule text;
  v_command text;
  v_monitor_command text := 'SELECT public.assert_cron_health();';
  v_cleanup_command text := 'DELETE FROM public.public_booking_rate_limits
        WHERE updated_at < now() - interval ''48 hours''';
BEGIN
  SELECT jobid, schedule, command INTO v_job_id, v_schedule, v_command
    FROM cron.job WHERE jobname = 'cron-health-monitor' LIMIT 1;

  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('cron-health-monitor', '*/15 * * * *',
      $cron$SELECT public.assert_cron_health();$cron$);
  ELSIF v_command IS DISTINCT FROM v_monitor_command
        OR v_schedule IS DISTINCT FROM '*/15 * * * *' THEN
    PERFORM cron.alter_job(
      job_id := v_job_id,
      schedule := '*/15 * * * *',
      command := v_monitor_command
    );
  END IF;

  -- Pin the rate-limit sweeper that was never versioned. Deliberately register-only: the
  -- command text below is copied byte-for-byte from Production job 12, and rewriting a
  -- healthy job would be churn against a running schedule.
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'cleanup-public-booking-rate-limits' LIMIT 1;

  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('cleanup-public-booking-rate-limits', '17 3 * * *', v_cleanup_command);
  END IF;
END
$migration$;
