DROP INDEX IF EXISTS public.reminders_winback_monthly_uniq;

CREATE UNIQUE INDEX reminders_winback_monthly_channel_uniq
ON public.reminders (patient_id, winback_month, reminder_type)
WHERE event_type = 'win_back' AND patient_id IS NOT NULL;
