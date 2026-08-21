-- Idempotency: one pending follow-up per lead, due time, and channel.
CREATE UNIQUE INDEX IF NOT EXISTS lead_followups_pending_unique_idx
  ON public.lead_followups(lead_id, due_at, channel)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.tg_lead_activity_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due timestamptz;
  v_channel text;
BEGIN
  IF NEW.activity_type = 'no_answer' THEN
    v_due := now() + interval '1 day';
    v_channel := 'call';
  ELSIF NEW.activity_type = 'whatsapp_sent' THEN
    v_due := now() + interval '24 hours';
    v_channel := 'whatsapp';
  ELSIF NEW.activity_type = 'appointment_booked' THEN
    v_due := now() + interval '12 hours';
    v_channel := 'call';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.lead_followups (lead_id, branch_id, assigned_to, due_at, channel, status, source_rule, notes)
  SELECT l.id, l.branch_id, l.assigned_to, v_due, v_channel, 'pending', NEW.activity_type, NULLIF(NEW.body, '')
  FROM public.leads l
  WHERE l.id = NEW.lead_id
  ON CONFLICT DO NOTHING;

  UPDATE public.leads
  SET next_followup_at = LEAST(COALESCE(next_followup_at, v_due), v_due),
      last_activity_at = COALESCE(NEW.occurred_at, now()),
      updated_at = now()
  WHERE id = NEW.lead_id;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_activity_automation ON public.lead_activities;
CREATE TRIGGER trg_lead_activity_automation
AFTER INSERT ON public.lead_activities
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_activity_automation();
