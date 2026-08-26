-- Contract tests for the public booking confirmation workflow.
-- This file is intended for a disposable/local database and is never applied
-- as a production migration.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(14);

SELECT has_column('public', 'appointments', 'booking_request_status', 'appointments exposes booking request status');
SELECT has_column('public', 'appointments', 'booking_request_expires_at', 'appointments expose booking request expiry');
SELECT has_column('public', 'appointments', 'booking_rejection_reason', 'appointments expose rejection reason');
SELECT has_column('public', 'appointments', 'booking_rejected_by', 'appointments expose rejecting user');
SELECT has_column('public', 'appointments', 'booking_confirmed_by', 'appointments expose confirming user');
SELECT has_column('public', 'appointment_settings', 'booking_request_hold_minutes', 'appointment settings expose hold duration');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_booking_request_status_check'
  ),
  'booking request status has a constrained state machine'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.appointments'::regclass
      AND tgname = 'trg_public_booking_request_defaults'
      AND NOT tgisinternal
  ),
  'public booking inserts get workflow defaults'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.confirm_public_booking(uuid)'::regprocedure AND prosecdef),
  'confirm RPC is SECURITY DEFINER'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.confirm_public_booking(uuid)', 'EXECUTE'),
  'authenticated can execute confirm RPC'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.confirm_public_booking(uuid)', 'EXECUTE'),
  'anon cannot execute confirm RPC'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.reject_public_booking(uuid,text)'::regprocedure AND prosecdef),
  'reject RPC is SECURITY DEFINER'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.expire_public_booking_requests(uuid)'::regprocedure AND prosecdef),
  'expiry RPC is SECURITY DEFINER'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'appointment_create_notifications' AND NOT tgisinternal),
  'appointment notification trigger remains installed'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.appointments'::regclass AND tgname = 'appointment_create_reminders' AND NOT tgisinternal),
  'reminder trigger remains installed'
);

SELECT * FROM finish();
ROLLBACK;
