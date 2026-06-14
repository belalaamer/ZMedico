CREATE TABLE IF NOT EXISTS public.queue_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid UNIQUE REFERENCES public.branches(id) ON DELETE CASCADE,
  long_wait_minutes integer NOT NULL DEFAULT 30 CHECK (long_wait_minutes BETWEEN 5 AND 240),
  default_my_queue boolean NOT NULL DEFAULT true,
  show_no_shows_in_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_settings TO authenticated;
GRANT ALL ON public.queue_settings TO service_role;

ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qs_select_authenticated" ON public.queue_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "qs_insert_authenticated" ON public.queue_settings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qs_update_authenticated" ON public.queue_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.queue_settings_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS queue_settings_updated_at ON public.queue_settings;
CREATE TRIGGER queue_settings_updated_at BEFORE UPDATE ON public.queue_settings
FOR EACH ROW EXECUTE FUNCTION public.queue_settings_touch_updated_at();