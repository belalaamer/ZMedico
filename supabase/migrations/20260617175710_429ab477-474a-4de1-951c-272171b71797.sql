
CREATE OR REPLACE FUNCTION public.touch_queue_alerts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.queue_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  state text NOT NULL DEFAULT 'active',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  snoozed_until timestamptz,
  snoozed_by uuid,
  resolved_at timestamptz
);

CREATE INDEX queue_alerts_branch_state_idx ON public.queue_alerts(branch_id, state, created_at DESC);
CREATE INDEX queue_alerts_branch_type_open_idx ON public.queue_alerts(branch_id, alert_type) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_alerts TO authenticated;
GRANT ALL ON public.queue_alerts TO service_role;

ALTER TABLE public.queue_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view branch alerts"
  ON public.queue_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert branch alerts"
  ON public.queue_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update branch alerts"
  ON public.queue_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete branch alerts"
  ON public.queue_alerts FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_queue_alerts_updated_at
  BEFORE UPDATE ON public.queue_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_queue_alerts_updated_at();
