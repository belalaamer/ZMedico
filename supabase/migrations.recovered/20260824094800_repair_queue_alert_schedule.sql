-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260824094800
-- name: repair_queue_alert_schedule
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

DO $migration$ DECLARE v_job_id bigint; BEGIN SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'detect-queue-alerts-every-5min' LIMIT 1; IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF; PERFORM cron.schedule('detect-queue-alerts-every-5min', '*/5 * * * *', $cron$ SELECT net.http_post(url := 'https://rqcmnfzfytyyicelvifk.supabase.co/functions/v1/detect-queue-alerts', headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || public._get_cron_secret()), body := jsonb_build_object('ts', now())) AS request_id; $cron$); END $migration$;
