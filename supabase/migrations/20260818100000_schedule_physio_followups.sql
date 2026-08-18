-- Create at most one physiotherapy follow-up reminder per case and due date.
-- The payload carries the stable case/due-date identity because reminders are
-- also used by appointment and win-back workflows.
CREATE UNIQUE INDEX IF NOT EXISTS reminders_physio_followup_due_uniq
  ON public.reminders (
    (payload->>'physio_case_id'),
    (payload->>'followup_due_date'),
    reminder_type
  )
  WHERE event_type = 'physio_followup';

-- Enqueue due physiotherapy follow-ups daily. The function uses the same
-- Vault-backed cron secret as send-reminder and enqueue-winback.
DO $$
BEGIN
  PERFORM cron.unschedule('enqueue-physio-followups-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'enqueue-physio-followups-daily',
  '30 1 * * *',
  $cron$ SELECT public.invoke_reminder_function('enqueue-physio-followups', '{}'::jsonb); $cron$
);
