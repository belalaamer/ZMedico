-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20261021203931
-- name: 20261021190000_gate_legacy_appointment_reminder_enqueue
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- ZMED-275 — appointment-reminder enqueue must honour the per-branch opt-out,
--             and must not duplicate the templated reminder path.
-- Migration: 20261021190000_gate_legacy_appointment_reminder_enqueue
-- Applied as one atomic migration; the file's own BEGIN;/COMMIT; are omitted because
-- the migration API already wraps this in a single transaction.

-- ---- preflight: refuse to apply on drift ----------------------------------------
DO $$
DECLARE
  v_legacy  text;
  v_ensure  text;
  v_helpers integer;
  v_need    text[];
  v_item    text;
  v_inserts integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_legacy
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'tg_appointment_create_reminders'
     AND p.pronargs = 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ZMED-275 preflight: public.tg_appointment_create_reminders() is absent -- nothing to gate';
  END IF;
  IF v_legacy LIKE '%communication_event_enabled%' THEN
    RAISE EXCEPTION 'ZMED-275 preflight: legacy reminder trigger is already gated -- this migration was already applied';
  END IF;

  v_inserts := (length(v_legacy) - length(replace(v_legacy, 'INSERT INTO', ''))) / length('INSERT INTO');
  IF v_inserts <> 1 OR v_legacy NOT LIKE '%INSERT INTO public.reminders%' THEN
    RAISE EXCEPTION 'ZMED-275 preflight: tg_appointment_create_reminders() no longer performs exactly one reminders insert (found % INSERT INTO clauses)', v_inserts;
  END IF;
  v_need := ARRAY[
    'Reminder: You have an appointment on ',
    'تذكير: لديك موعد بتاريخ ',
    'ARRAY[24, 2]::integer[]',
    'reminder_hours_before',
    'reminder_channel::text',
    'NEW.booking_request_status',
    'NEW.scheduled_at'];
  FOREACH v_item IN ARRAY v_need LOOP
    IF v_legacy NOT LIKE '%' || v_item || '%' THEN
      RAISE EXCEPTION 'ZMED-275 preflight: tg_appointment_create_reminders() drifted, reviewed behaviour % is missing', v_item;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(p.oid) INTO v_ensure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'ensure_appointment_reminders'
     AND p.pronargs = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ZMED-275 preflight: public.ensure_appointment_reminders(uuid) is absent';
  END IF;
  v_inserts := (length(v_ensure) - length(replace(v_ensure, 'INSERT INTO', ''))) / length('INSERT INTO');
  IF v_inserts <> 1 OR v_ensure NOT LIKE '%INSERT INTO public.reminders%' THEN
    RAISE EXCEPTION 'ZMED-275 preflight: ensure_appointment_reminders() no longer performs exactly one reminders insert (found % INSERT INTO clauses)', v_inserts;
  END IF;
  v_need := ARRAY[
    'Reminder: You have an appointment on ',
    'تذكير: لديك موعد بتاريخ ',
    'ARRAY[24, 2]::integer[]',
    'reminder_hours_before',
    'reminder_channel::text',
    'v_appt.booking_request_status',
    'appointment_id = v_appt.id AND status'];
  FOREACH v_item IN ARRAY v_need LOOP
    IF v_ensure NOT LIKE '%' || v_item || '%' THEN
      RAISE EXCEPTION 'ZMED-275 preflight: ensure_appointment_reminders() drifted, reviewed behaviour % is missing', v_item;
    END IF;
  END LOOP;

  RAISE NOTICE 'ZMED-275 preflight fingerprint tg_appointment_create_reminders = %', md5(v_legacy);
  RAISE NOTICE 'ZMED-275 preflight fingerprint ensure_appointment_reminders = %', md5(v_ensure);

  SELECT count(*) INTO v_helpers
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'communication_event_enabled'
     AND p.pronargs = 2;
  IF v_helpers <> 1 THEN
    RAISE EXCEPTION 'ZMED-275 preflight: communication_event_enabled(uuid,text) not found exactly once (got %)', v_helpers;
  END IF;
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'communication_event_enabled')
     NOT LIKE '%send_appointment_reminders%' THEN
    RAISE EXCEPTION 'ZMED-275 preflight: communication_event_enabled no longer reads send_appointment_reminders';
  END IF;

  IF (SELECT count(*) FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
       WHERE c.relname = 'appointments' AND NOT t.tgisinternal
         AND t.tgname = 'appointment_create_reminders') <> 1 THEN
    RAISE EXCEPTION 'ZMED-275 preflight: appointment_create_reminders trigger is not attached exactly once';
  END IF;
END;
$$;

-- ---- path 1: the AFTER INSERT booking trigger -----------------------------------
CREATE OR REPLACE FUNCTION public.tg_appointment_create_reminders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hours_arr integer[];
  h integer;
  reminder_time timestamptz;
  channel public.reminder_channel;
  ns_channel text;
  msg_en text;
  msg_ar text;
  appt_local text;
BEGIN
  IF NEW.booking_request_status = 'pending' THEN RETURN NEW; END IF;
  IF NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now() THEN RETURN NEW; END IF;

  IF NOT public.communication_event_enabled(NEW.branch_id, 'appointment_reminder') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.communication_templates
     WHERE branch_id = NEW.branch_id
       AND event_type = 'appointment_reminder'
       AND enabled = true
  ) THEN
    RETURN NEW;
  END IF;

  SELECT reminder_hours_before INTO hours_arr
    FROM public.appointment_settings WHERE branch_id = NEW.branch_id LIMIT 1;
  IF hours_arr IS NULL OR array_length(hours_arr, 1) IS NULL THEN
    hours_arr := ARRAY[24, 2]::integer[];
  END IF;
  SELECT reminder_channel::text INTO ns_channel
    FROM public.notification_settings WHERE branch_id = NEW.branch_id LIMIT 1;
  channel := COALESCE(NULLIF(ns_channel, ''), 'sms')::public.reminder_channel;
  appt_local := to_char(NEW.scheduled_at, 'YYYY-MM-DD HH24:MI');
  msg_en := 'Reminder: You have an appointment on ' || appt_local;
  msg_ar := 'تذكير: لديك موعد بتاريخ ' || appt_local;
  FOREACH h IN ARRAY hours_arr LOOP
    reminder_time := NEW.scheduled_at - (h || ' hours')::interval;
    IF reminder_time > now() THEN
      INSERT INTO public.reminders(
        appointment_id, patient_id, branch_id, reminder_type, scheduled_time,
        message_ar, message_en, status
      ) VALUES (
        NEW.id, NEW.patient_id, NEW.branch_id, channel, reminder_time,
        msg_ar, msg_en, 'pending'
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- ---- approval path twin, same opt-out was ignored -------------------------------
CREATE OR REPLACE FUNCTION public.ensure_appointment_reminders(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  hours_arr integer[];
  h integer;
  reminder_time timestamptz;
  channel public.reminder_channel;
  ns_channel text;
  appt_local text;
BEGIN
  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id AND deleted_at IS NULL;
  IF NOT FOUND
     OR v_appt.status::text IN ('cancelled', 'no_show')
     OR v_appt.booking_request_status = 'pending'
     OR v_appt.scheduled_at IS NULL
     OR v_appt.scheduled_at <= now() THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reminders
     WHERE appointment_id = v_appt.id AND status = 'pending'
  ) THEN
    RETURN;
  END IF;

  IF NOT public.communication_event_enabled(v_appt.branch_id, 'appointment_reminder') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.communication_templates
     WHERE branch_id = v_appt.branch_id
       AND event_type = 'appointment_reminder'
       AND enabled = true
  ) THEN
    RETURN;
  END IF;

  SELECT reminder_hours_before INTO hours_arr
    FROM public.appointment_settings WHERE branch_id = v_appt.branch_id LIMIT 1;
  IF hours_arr IS NULL OR array_length(hours_arr, 1) IS NULL THEN
    hours_arr := ARRAY[24, 2]::integer[];
  END IF;
  SELECT reminder_channel::text INTO ns_channel
    FROM public.notification_settings WHERE branch_id = v_appt.branch_id LIMIT 1;
  channel := COALESCE(NULLIF(ns_channel, ''), 'sms')::public.reminder_channel;
  appt_local := to_char(v_appt.scheduled_at, 'YYYY-MM-DD HH24:MI');
  FOREACH h IN ARRAY hours_arr LOOP
    reminder_time := v_appt.scheduled_at - (h || ' hours')::interval;
    IF reminder_time > now() THEN
      INSERT INTO public.reminders(
        appointment_id, patient_id, branch_id, reminder_type, scheduled_time,
        message_ar, message_en, status
      ) VALUES (
        v_appt.id, v_appt.patient_id, v_appt.branch_id, channel, reminder_time,
        'تذكير: لديك موعد بتاريخ ' || appt_local,
        'Reminder: You have an appointment on ' || appt_local,
        'pending'
      );
    END IF;
  END LOOP;
END;
$$;

-- ---- postflight: prove the shape, never widen anything --------------------------
DO $$
DECLARE
  v_legacy text;
  v_ensure text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_legacy
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'tg_appointment_create_reminders' AND p.pronargs = 0;
  SELECT pg_get_functiondef(p.oid) INTO v_ensure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'ensure_appointment_reminders' AND p.pronargs = 1;

  IF v_legacy NOT LIKE '%communication_event_enabled%'
     OR v_ensure NOT LIKE '%communication_event_enabled%' THEN
    RAISE EXCEPTION 'ZMED-275 postflight: opt-out gate missing from one of the legacy enqueue paths';
  END IF;
  IF v_legacy NOT LIKE '%SECURITY DEFINER%' OR v_ensure NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'ZMED-275 postflight: SECURITY DEFINER attribute lost';
  END IF;
  IF v_legacy NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'ZMED-275 postflight: pinned search_path lost';
  END IF;
  IF has_function_privilege('anon', 'public.tg_appointment_create_reminders()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tg_appointment_create_reminders()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ZMED-275 postflight: tg_appointment_create_reminders() execution is reachable from client roles';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE c.relname = 'appointments' AND NOT t.tgisinternal
         AND t.tgname = 'appointment_create_reminders') <> 1 THEN
    RAISE EXCEPTION 'ZMED-275 postflight: booking reminder trigger is no longer attached exactly once';
  END IF;
END;
$$;
