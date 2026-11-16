-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260817093835
-- name: add_patient_name_language
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS name_language text; DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_name_language_check' AND conrelid = 'public.patients'::regclass) THEN ALTER TABLE public.patients ADD CONSTRAINT patients_name_language_check CHECK (name_language IS NULL OR name_language IN ('ar', 'en')); END IF; END $$; ALTER TABLE public.patients ALTER COLUMN name_language SET DEFAULT 'en'; COMMENT ON COLUMN public.patients.name_language IS 'Original input language for patient identity display; NULL means legacy row with inferred script.';
