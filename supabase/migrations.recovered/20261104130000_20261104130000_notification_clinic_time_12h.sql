-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261104130000
-- name: 20261104130000_notification_clinic_time_12h
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

Registered 2026-11-05 under owner authorization. The DDL was applied out of band on 2026-11-04 and was verified live in the Production catalog immediately before this row was written: public.format_clinic_time(timestamptz, text, boolean) exists and all four appointment-time producers (tg_appointment_create_notifications, tg_appointment_create_reminders, ensure_appointment_reminders, enqueue_appointment_event) reference it in their bodies. Source of truth for the SQL bytes: supabase/migrations/20261104130000_notification_clinic_time_12h.sql on branch main, md5 f03408224e0877d078e1f37e94a8b300, 16581 bytes, 419 lines. This row records applied status only; no DDL was executed by it.
