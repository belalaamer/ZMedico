
ALTER TABLE public.queue_settings
  ADD COLUMN IF NOT EXISTS business_hours_start text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS business_hours_end   text NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled  boolean NOT NULL DEFAULT true;

-- Validate HH:MM 24h format using a trigger (CHECK can't reference now()-style
-- functions but we still want to guard malformed strings cheaply).
CREATE OR REPLACE FUNCTION public.queue_settings_validate_hours()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.business_hours_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'business_hours_start must be HH:MM (24h)';
  END IF;
  IF NEW.business_hours_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'business_hours_end must be HH:MM (24h)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS queue_settings_validate_hours_trg ON public.queue_settings;
CREATE TRIGGER queue_settings_validate_hours_trg
  BEFORE INSERT OR UPDATE ON public.queue_settings
  FOR EACH ROW EXECUTE FUNCTION public.queue_settings_validate_hours();
