-- Platform change log: append-only, tenant-scoped history for administrative changes.
CREATE TABLE IF NOT EXISTS public.platform_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('subscription', 'modules', 'domains', 'tenant')),
  action text NOT NULL,
  summary text NOT NULL,
  before_values jsonb,
  after_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_change_log_tenant_created_idx
  ON public.platform_change_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_change_log_category_created_idx
  ON public.platform_change_log (category, created_at DESC);

ALTER TABLE public.platform_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_change_log_select_system_owner ON public.platform_change_log;
CREATE POLICY platform_change_log_select_system_owner
  ON public.platform_change_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'));

DROP POLICY IF EXISTS platform_change_log_insert_system_owner ON public.platform_change_log;
CREATE POLICY platform_change_log_insert_system_owner
  ON public.platform_change_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'system_owner') AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public._platform_change_log_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform_change_log is append-only (op=%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS platform_change_log_no_update ON public.platform_change_log;
DROP TRIGGER IF EXISTS platform_change_log_no_delete ON public.platform_change_log;
CREATE TRIGGER platform_change_log_no_update
  BEFORE UPDATE ON public.platform_change_log
  FOR EACH ROW EXECUTE FUNCTION public._platform_change_log_append_only();
CREATE TRIGGER platform_change_log_no_delete
  BEFORE DELETE ON public.platform_change_log
  FOR EACH ROW EXECUTE FUNCTION public._platform_change_log_append_only();

REVOKE INSERT, UPDATE, DELETE ON public.platform_change_log FROM anon;
REVOKE UPDATE, DELETE ON public.platform_change_log FROM authenticated;
GRANT SELECT, INSERT ON public.platform_change_log TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_log_change(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_id uuid;
  v_category text;
  v_action text;
  v_summary text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner') THEN
    RAISE EXCEPTION 'system_owner role required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_tenant_id := (payload->>'tenant_id')::uuid;
  v_category := NULLIF(trim(payload->>'category'), '');
  v_action := NULLIF(trim(payload->>'action'), '');
  v_summary := NULLIF(trim(payload->>'summary'), '');

  IF v_tenant_id IS NULL OR v_category IS NULL OR v_action IS NULL OR v_summary IS NULL THEN
    RAISE EXCEPTION 'tenant_id, category, action and summary are required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_category NOT IN ('subscription', 'modules', 'domains', 'tenant') THEN
    RAISE EXCEPTION 'unsupported platform change category' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.platform_change_log
    (tenant_id, actor_id, category, action, summary, before_values, after_values)
  VALUES
    (v_tenant_id, auth.uid(), v_category, v_action, left(v_summary, 500),
     NULLIF(payload->'before_values', 'null'::jsonb),
     NULLIF(payload->'after_values', 'null'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_log_change(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_log_change(jsonb) TO authenticated;
