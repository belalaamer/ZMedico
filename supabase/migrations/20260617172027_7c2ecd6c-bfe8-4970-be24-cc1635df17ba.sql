CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.audit_export_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  action text NOT NULL DEFAULT 'all',
  user_filter text NOT NULL DEFAULT 'all',
  ref text NOT NULL DEFAULT '',
  scope_branch boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_export_presets TO authenticated;
GRANT ALL ON public.audit_export_presets TO service_role;

ALTER TABLE public.audit_export_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY aep_select_branch_access ON public.audit_export_presets
  FOR SELECT TO authenticated
  USING (public.user_has_branch_access(branch_id));

CREATE POLICY aep_insert_own ON public.audit_export_presets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.user_has_branch_access(branch_id));

CREATE POLICY aep_update_own ON public.audit_export_presets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.user_has_branch_access(branch_id));

CREATE POLICY aep_delete_own ON public.audit_export_presets
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_audit_export_presets_branch ON public.audit_export_presets(branch_id);
CREATE INDEX idx_audit_export_presets_user ON public.audit_export_presets(user_id);

CREATE TRIGGER trg_audit_export_presets_updated_at
  BEFORE UPDATE ON public.audit_export_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();