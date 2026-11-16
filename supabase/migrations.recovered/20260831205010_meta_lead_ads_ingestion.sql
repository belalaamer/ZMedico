-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260831205010
-- name: meta_lead_ads_ingestion
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Dedupe key for leads ingested from Meta Lead Ads forms. The sync function
-- upserts on this, so re-running a sync can never duplicate a lead.
alter table public.leads add column if not exists meta_lead_id text;
create unique index if not exists leads_meta_lead_id_key
  on public.leads (meta_lead_id)
  where meta_lead_id is not null;
