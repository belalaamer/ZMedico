
CREATE TABLE public.queue_alert_runs (
  branch_id uuid PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_status text NOT NULL DEFAULT 'ok',
  last_error text,
  alerts_opened integer NOT NULL DEFAULT 0,
  alerts_resolved integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.queue_alert_runs TO authenticated;
GRANT ALL ON public.queue_alert_runs TO service_role;

ALTER TABLE public.queue_alert_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qar_select_branch_access" ON public.queue_alert_runs
  FOR SELECT TO authenticated
  USING (public.user_has_branch_access(branch_id));

CREATE OR REPLACE FUNCTION public.touch_queue_alert_runs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_queue_alert_runs_updated_at
  BEFORE UPDATE ON public.queue_alert_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_queue_alert_runs_updated_at();

ALTER TABLE public.queue_alert_runs REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_alert_runs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
