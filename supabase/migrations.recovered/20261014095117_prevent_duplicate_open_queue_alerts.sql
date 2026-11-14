-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261014095117
-- name: prevent_duplicate_open_queue_alerts
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.queue_alerts WHERE resolved_at IS NULL
    GROUP BY branch_id, alert_type HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate open queue alerts require review before installing uniqueness guard' USING ERRCODE = '23505';
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_alerts_open_branch_type ON public.queue_alerts(branch_id, alert_type) WHERE resolved_at IS NULL;
