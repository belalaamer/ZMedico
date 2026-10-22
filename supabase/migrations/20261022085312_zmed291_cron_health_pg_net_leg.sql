-- ZMED-291 N-1 follow-up: give the monitor the one channel cron cannot see.
--
-- pg_net dispatches asynchronously: net.http_post() returns a request id immediately, so
-- the cron statement succeeds whether the Edge Function answers 200, 500, or never answers.
-- That is finding N-1 in one sentence - cron status is not an oracle - and the read-only
-- monitor installed by the previous migration inherits it. Measured on Production within
-- minutes of that install: assert_cron_health() reported "cron jobs=10, runs_24h=1829,
-- failures_24h=0" while net._http_response held 5 timeouts and 5 transport errors over the
-- same 24 hours.
--
-- Threshold is three bad responses in two hours, and the reason is measured, not guessed:
-- 32 pg_net responses completed in the current 2-hour window with zero failures, so the
-- monitor starts quiet. A single failure is self-healing - the reminder row stays pending
-- and the next tick retries it - while three inside two hours means the function, the
-- gateway or the bearer secret is persistently wrong, not briefly slow.
--
-- Read-only, like the rest of B1. It never dispatches, never retries, never writes.

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
  v_net_bad bigint;
  v_net_all bigint;
  v_net_timeouts bigint;
  v_net_http bigint;
  v_net_worst text;
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

  -- 4. The asynchronous result cron cannot see. status_code is NULL when the request never
  --    completed, so it is counted only under error_msg/timed_out and never compared to 400
  --    in isolation.
  SELECT count(*) FILTER (WHERE r.timed_out OR r.error_msg IS NOT NULL OR r.status_code >= 400),
         count(*),
         count(*) FILTER (WHERE r.timed_out),
         count(*) FILTER (WHERE r.error_msg IS NULL AND r.status_code >= 400),
         max(COALESCE(r.error_msg, 'HTTP ' || r.status_code::text, 'unknown'))
    INTO v_net_bad, v_net_all, v_net_timeouts, v_net_http, v_net_worst
    FROM net._http_response r
   WHERE r.created > now() - interval '2 hours';

  IF v_net_bad >= 3 THEN
    v_anomalies := array_append(v_anomalies,
      format('%s of %s pg_net responses in 2h failed (%s timeouts, %s HTTP 4xx/5xx), worst: %s',
             v_net_bad, v_net_all, v_net_timeouts, v_net_http, left(v_net_worst, 120)));
  END IF;

  IF array_length(v_anomalies, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'cron health: %', array_to_string(v_anomalies, ' | ');
  END IF;

  SELECT format('cron jobs=%s, runs_24h=%s, failures_24h=%s, pg_net 2h=%s/%s ok, vault secret present',
                 count(*),
                 sum(runs_24h),
                 sum(failures_24h),
                 v_net_all - v_net_bad,
                 v_net_all)
    INTO v_summary
    FROM public.cron_health;

  RETURN v_summary;
END;
$function$;

-- The leg added here reads two more objects, and the function is deliberately NOT security
-- definer: it must run with the caller's own rights so it can never become a path that
-- exposes Vault plaintext or job internals through a wrapper.
REVOKE ALL ON FUNCTION public.assert_cron_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_cron_health() TO service_role;

DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  -- Nothing to re-point when the monitor was just registered by the previous migration;
  -- this block only matters for an environment rebuilt from migrations in one pass.
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'cron-health-monitor' LIMIT 1;

  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('cron-health-monitor', '*/15 * * * *',
      $cron$SELECT public.assert_cron_health();$cron$);
  END IF;
END
$migration$;
