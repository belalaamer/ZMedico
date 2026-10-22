-- ZMED-279 : restore the physio event type and make patient WhatsApp consent a
-- database-enforced invariant instead of a per-producer habit.
--
-- Two independent problems, one migration, because fixing the first naively
-- activates the second:
--
--   1. 20260818100000_schedule_physio_followups.sql created a partial index keyed on
--      reminders.event_type = 'physio_followup'. Eight days later
--      20260826040000_whatsapp_clinic_events_and_templates.sql dropped and re-added
--      reminders_event_type_check WITHOUT that value. Since then every insert from
--      functions/enqueue-physio-followups/index.ts raises 23514, and on main the error
--      handler counts any failure as a skip (:102-104) and answers HTTP 200 - so a
--      feature that has been structurally dead since 2026-08-26 reports a healthy run.
--
--   2. patients.whatsapp_opt_in (20260826040000:6, NOT NULL DEFAULT false) is skipped by
--      every DB-side enqueue in that migration (:139 appointments, :257 invoice_issued,
--      :318 payment_receipt) and by functions/send-patient-portal-message/index.ts:84, but
--      nothing enforces it on the reminders table itself. The two cron producers that build
--      WhatsApp rows directly - win_back and physio_followup - read no consent column at all
--      (main: enqueue-winback/index.ts:78, enqueue-physio-followups/index.ts:61), so they
--      enqueue paid messages for patients who never opted in. The dispatcher cannot
--      compensate: its gate (functions/send-reminder, EVENT_CONSENT_FLAG) maps event type to
--      branch-level notification_settings flags and never reads the patient row.
--
-- This migration restores the enum value AND makes consent a BEFORE INSERT invariant on
-- reminders, so no producer - existing, future, or manual RPC - can reintroduce the gap.
-- It revokes no client access to data, disables no RLS, and grants no new privilege.

---------------------------------------------------------------------------
-- 1. Restore 'physio_followup' to the allowed event types.
--    The list below is 20260826040000:26-31 verbatim plus physio_followup. The guard
--    refuses the migration if the live constraint is missing, is not the IN-list shape
--    this file rewrites, or holds a value outside the reviewed set - so this can never
--    silently narrow the live set.
---------------------------------------------------------------------------
DO $$
DECLARE
  v_def      text;
  v_vals     text[];
  v_required text[] := ARRAY[
    'booking_confirmation','appointment_reminder','appointment_rescheduled',
    'appointment_cancelled','invoice_issued','payment_receipt','win_back',
    'physio_followup','manual'
  ];
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.reminders'::regclass
     AND c.conname  = 'reminders_event_type_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'reminders_event_type_check is absent; refusing to assume its shape';
  END IF;

  IF v_def NOT LIKE 'CHECK (%event_type = ANY (ARRAY[%' THEN
    RAISE EXCEPTION 'reminders_event_type_check is not an IN-list CHECK (%); review manually', v_def;
  END IF;

  SELECT array_agg(DISTINCT m[1])
    INTO v_vals
    FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m;

  IF v_vals IS NULL THEN
    RAISE EXCEPTION 'no event type literals parsed from reminders_event_type_check; review manually';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_vals) AS v(x) WHERE NOT (v.x = ANY (v_required))) THEN
    RAISE EXCEPTION 'live event types % include a value outside the reviewed set; review before replacing the constraint', v_vals;
  END IF;
END
$$;

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_event_type_check;

ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_event_type_check CHECK (
    event_type IN (
      'booking_confirmation', 'appointment_reminder', 'appointment_rescheduled',
      'appointment_cancelled', 'invoice_issued', 'payment_receipt', 'win_back',
      'physio_followup', 'manual'
    )
  );

---------------------------------------------------------------------------
-- 2. Patient-level WhatsApp consent, enforced at insert time.
--
--    * Cancels rather than discards, so the row stays inspectable and the monthly
--      win-back dedupe still records that this patient was considered.
--    * Applies only to reminder_type = 'whatsapp'. There is no sms_opt_in or
--      email_opt_in column in the schema, and inventing a consent signal for those
--      channels would be a behaviour change nobody authorised.
--    * Excludes event_type = 'manual', matching the dispatcher's documented rule that
--      operator-initiated messages are not blocked by an automated consent gate.
--    * SECURITY DEFINER with a pinned search_path because the inserting caller may not
--      be able to see the patient row; it writes only to NEW, so it changes no stored
--      data. Fail-closed: an absent or soft-deleted patient cancels the message.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_reminders_whatsapp_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_opt_in boolean;
BEGIN
  IF NEW.reminder_type IS DISTINCT FROM 'whatsapp'::reminder_channel THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'pending'::reminder_status THEN
    RETURN NEW;
  END IF;

  -- Operator-initiated messages keep their documented escape hatch.
  IF NEW.event_type = 'manual' THEN
    RETURN NEW;
  END IF;

  SELECT p.whatsapp_opt_in
    INTO v_opt_in
    FROM public.patients p
   WHERE p.id = NEW.patient_id
     AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    NEW.error_message := trim(both ' |' FROM
      concat_ws(' | ', NULLIF(NEW.error_message, ''), 'cancelled:consent_check_failed_patient_unavailable'));
    NEW.status := 'cancelled'::reminder_status;
    RETURN NEW;
  END IF;

  IF NOT COALESCE(v_opt_in, false) THEN
    NEW.error_message := trim(both ' |' FROM
      concat_ws(' | ', NULLIF(NEW.error_message, ''), 'cancelled:patient_not_opted_in'));
    NEW.status := 'cancelled'::reminder_status;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_reminders_whatsapp_consent ON public.reminders;
CREATE TRIGGER trg_reminders_whatsapp_consent
  BEFORE INSERT ON public.reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_reminders_whatsapp_consent();

-- Trigger-only function: clients reach it through the trigger, never directly.
-- Same posture as 20261015102812_revoke_branch_trigger_direct_execution.sql.
REVOKE ALL ON FUNCTION public.tg_reminders_whatsapp_consent()
  FROM PUBLIC, anon, authenticated, service_role;

---------------------------------------------------------------------------
-- 3. Dispatch-time re-check. A reminder can be queued hours before it is due and the
--    patient can withdraw consent inside that window, so the verdict must be taken from
--    the patient row at send time. This function reads and decides; it mutates nothing.
--    LEFT JOIN so a non-WhatsApp row whose patient is gone is not falsely blocked.
---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reminder_whatsapp_consent_ok(_reminder uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT CASE
             WHEN r.reminder_type <> 'whatsapp'::reminder_channel THEN true
             WHEN r.event_type = 'manual'                        THEN true
             ELSE COALESCE(p.whatsapp_opt_in, false)
           END
      FROM public.reminders r
      LEFT JOIN public.patients p
             ON p.id = r.patient_id
            AND p.deleted_at IS NULL
     WHERE r.id = _reminder
  ), false);
$function$;

REVOKE ALL ON FUNCTION public.reminder_whatsapp_consent_ok(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminder_whatsapp_consent_ok(uuid) TO service_role;
