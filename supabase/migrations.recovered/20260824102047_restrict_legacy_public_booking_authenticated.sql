-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260824102047
-- name: restrict_legacy_public_booking_authenticated
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

REVOKE EXECUTE ON FUNCTION public.public_booking_options() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.public_booking_options() TO anon, service_role; REVOKE EXECUTE ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.public_booking_slots(uuid, uuid, date, uuid) TO anon, service_role; REVOKE EXECUTE ON FUNCTION public.public_create_booking(uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.public_create_booking(uuid, uuid, timestamptz, text, text, uuid, text, text, text, jsonb) TO anon, service_role;
