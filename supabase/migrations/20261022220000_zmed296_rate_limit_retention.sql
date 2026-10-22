-- ZMED-296: give the two throttle tables the sweeper that job 12 already gives the third one.
--
-- Everything below is copied from read-only Production `rqcmnfzfytyyicelvifk` measurements taken
-- 2026-10-22, not from a design document:
--
--   cron.job   job 12 'cleanup-public-booking-rate-limits', schedule '17 3 * * *', username postgres,
--              command: DELETE FROM public.public_booking_rate_limits
--                       WHERE updated_at < now() - interval '48 hours'
--              last run 2026-10-22 03:17 UTC -> succeeded, 'DELETE 0', 13 ms.
--   cron.job   there is NO sweeper for public.login_rate_limits or public.subscription_request_rate_limits.
--              Live jobs are 1, 2, 4, 5, 6, 9, 12, 15, 16, 17 and only 9 (cron.job_run_details) and 12
--              delete anything. So both throttle tables grow one row per distinct bucket forever.
--   pg_class   both tables: owner postgres, relrowsecurity=true, relforcerowsecurity=false,
--              relacl={postgres=arwdDxtm/postgres, service_role=arwdDxtm/postgres}. pg_cron runs the
--              command as username=postgres, which is the owner, so no GRANT is required and none is made.
--   pg_indexes each table currently has ONLY its primary key. public_booking_rate_limits additionally has
--              ..._updated_at_idx, which is exactly why job 12's DELETE is an index range scan rather than
--              a sequential scan. The two indexes below give the sweepers the same shape before they run.
--   row census login_rate_limits: 0 rows. subscription_request_rate_limits: 0 rows. Production traffic is
--              near zero, so the first scheduled sweep deletes nothing at all.
--
-- The one deliberate departure from job 12, and why. These two tables carry a `blocked_until` column that
-- public_booking_rate_limits does not have: consume_login_rate_limit (20260921210141) and
-- consume_subscription_request_rate_limit (20260922154103) both set blocked_until = now() + window when the
-- caller passes the limit, and the row IS the lockout. A byte-for-byte copy of job 12's predicate would
-- therefore be able to delete an unexpired block and hand a brute-forcer a clean counter. The live windows
-- are 900 s (supabase/functions/login-by-identifier/index.ts:39) and 3600 s
-- (supabase/functions/public-subscription-request/index.ts:46), both far inside 48 h, so the extra
-- condition can only ever protect a row someone set by hand. It costs nothing and it is why this migration
-- does not simply clone job 12.
--
-- Schedule: 03:37 and 03:47 UTC, two and ten minutes after job 12's 03:17, so the three sweeps are in the
-- same quiet nightly slot without overlapping each other.
--
-- Watched for free: public.assert_cron_health() (ZMED-291, job 17) reads cron.job and reports any job other
-- than itself that fails inside 2 hours, so the two new sweepers need no addition to it.
--
-- Register-only, like ZMED-291's pinning of job 12: an existing job with the right name is left alone, and
-- the shape of both tables is asserted before anything is scheduled. No GRANT, no REVOKE, no policy, no
-- trigger, no data deleted by this migration itself.
--
-- Where this ran. Proof first: work/zmed-296-qa-verify.mjs on the owned QA Postgres, 11/11 checks, receipt
-- outputs/ZMED-296-qa-receipt-2026-10-22.json — inside one rolled-back transaction it seeds five bucket_key
-- cells per table, shows that a literal clone of job 12's predicate deletes q2-old-still-blocked (an
-- unexpired lockout) in BOTH tables, then runs the stored command verbatim and shows it deletes exactly
-- q1-old-unblocked + q5-old-block-expired and keeps q2, q3 and q4. Applied to Production 2026-10-22: jobs
-- 18 'cleanup-login-rate-limits' and 19 'cleanup-subscription-request-rate-limits', active, username
-- postgres, schedules 37 3 * * * and 47 3 * * *, and both _updated_at_idx indexes exist. Both tables were
-- re-measured at 0 rows immediately before and after, so no row was deleted by this work.
--
-- Note on the recorded version: supabase_migrations.schema_migrations row is version 20261022215053, name
-- zmed296_rate_limit_retention — the version is the apply timestamp the connector assigned, not this file's
-- 20261022220000 prefix, exactly as for zmed293 (164237) and zmed294 (164344). The file name and the
-- Production row are therefore joined by the name, not by the number. That drift is pre-existing and is
-- listed under "repo <-> Production migration reconciliation"; do not "fix" it by renaming this file.

DO $zmed296$
DECLARE
  v_job_id        bigint;
  v_login_cmd     text := 'DELETE FROM public.login_rate_limits
        WHERE updated_at < now() - interval ''48 hours''
          AND (blocked_until IS NULL OR blocked_until < now())';
  v_sub_cmd       text := 'DELETE FROM public.subscription_request_rate_limits
        WHERE updated_at < now() - interval ''48 hours''
          AND (blocked_until IS NULL OR blocked_until < now())';
  v_login_sched   text := '37 3 * * *';
  v_sub_sched     text := '47 3 * * *';
  v_cols          text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'zmed296_pg_cron_missing: cron.job is not present in this database';
  END IF;

  -- Both tables must still have the columns the predicate names; a rename would otherwise turn the
  -- scheduled DELETE into a job that fails every night at 03:37.
  SELECT string_agg(c, ',' ORDER BY c) INTO v_cols
    FROM unnest(array['updated_at', 'blocked_until']) c
   WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'login_rate_limits' AND column_name = c);
  IF v_cols IS DISTINCT FROM 'blocked_until,updated_at' THEN
    RAISE EXCEPTION 'zmed296_login_shape_changed: %', coalesce(v_cols, '(none)');
  END IF;

  SELECT string_agg(c, ',' ORDER BY c) INTO v_cols
    FROM unnest(array['updated_at', 'blocked_until']) c
   WHERE EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'subscription_request_rate_limits' AND column_name = c);
  IF v_cols IS DISTINCT FROM 'blocked_until,updated_at' THEN
    RAISE EXCEPTION 'zmed296_subscription_shape_changed: %', coalesce(v_cols, '(none)');
  END IF;

  -- The sweep is driven by updated_at; index it the way job 12's table is indexed.
  CREATE INDEX IF NOT EXISTS login_rate_limits_updated_at_idx
    ON public.login_rate_limits USING btree (updated_at);
  CREATE INDEX IF NOT EXISTS subscription_request_rate_limits_updated_at_idx
    ON public.subscription_request_rate_limits USING btree (updated_at);

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'cleanup-login-rate-limits' LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('cleanup-login-rate-limits', v_login_sched, v_login_cmd);
  END IF;

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'cleanup-subscription-request-rate-limits' LIMIT 1;
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('cleanup-subscription-request-rate-limits', v_sub_sched, v_sub_cmd);
  END IF;

  -- Post-checks: the two jobs exist, carry exactly the intended text, are active, and run as the owner.
  SELECT count(*) INTO v_job_id
    FROM cron.job
   WHERE jobname IN ('cleanup-login-rate-limits', 'cleanup-subscription-request-rate-limits')
     AND active
     AND username = 'postgres'
     AND ((jobname = 'cleanup-login-rate-limits'
             AND schedule = v_login_sched AND command = v_login_cmd)
       OR (jobname = 'cleanup-subscription-request-rate-limits'
             AND schedule = v_sub_sched AND command = v_sub_cmd));
  IF v_job_id <> 2 THEN
    RAISE EXCEPTION 'zmed296_jobs_not_registered_correctly: found % of 2', v_job_id;
  END IF;

  RAISE NOTICE 'zmed296 done cron_jobs=% login_idx=% sub_idx=%',
    (SELECT count(*) FROM cron.job),
    to_regclass('public.login_rate_limits_updated_at_idx')::text,
    to_regclass('public.subscription_request_rate_limits_updated_at_idx')::text;
END
$zmed296$;
