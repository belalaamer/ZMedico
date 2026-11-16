-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260905163859
-- name: ai_provider_config_vault
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Non-secret AI provider configuration. Secret material lives ONLY in Supabase
-- Vault (vault.secrets, encrypted at rest); this table only stores an opaque
-- reference (secret_id uuid) to it -- never the key itself.
CREATE TABLE public.ai_provider_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('platform','tenant')),
  tenant_id uuid NULL REFERENCES public.tenants(id),
  provider text NOT NULL DEFAULT 'gemini',
  model text NULL,
  temperature numeric NULL,
  secret_id uuid NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz NULL,
  last_test_status text NULL CHECK (last_test_status IN ('success','failed') OR last_test_status IS NULL),
  last_test_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'platform' AND tenant_id IS NULL) OR (scope = 'tenant' AND tenant_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_ai_provider_config_platform ON public.ai_provider_config((true)) WHERE scope = 'platform';
CREATE UNIQUE INDEX idx_ai_provider_config_tenant ON public.ai_provider_config(tenant_id) WHERE scope = 'tenant';

CREATE TRIGGER trg_ai_provider_config_updated_at
BEFORE UPDATE ON public.ai_provider_config
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.ai_provider_config ENABLE ROW LEVEL SECURITY;
-- Only system_owner can read/write platform-scope config from the client side.
-- (Edge functions use the service-role key, which bypasses RLS entirely --
-- these policies are the defense for any direct client access attempt.)
CREATE POLICY ai_provider_config_system_owner_only ON public.ai_provider_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'));

-- Vault-backed secret read/write wrapper functions. CRITICAL: these must be
-- executable ONLY by service_role (i.e. only from trusted edge functions using
-- the service-role key), never by anon/authenticated -- revoke public/authenticated
-- execute rights explicitly.
CREATE OR REPLACE FUNCTION public.get_ai_provider_secret(p_secret_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_value text;
BEGIN
  SELECT decrypted_secret INTO v_value FROM vault.decrypted_secrets WHERE id = p_secret_id;
  RETURN v_value;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_ai_provider_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_provider_secret(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_ai_provider_secret(p_secret_id uuid, p_new_value text, p_name text DEFAULT 'ai_provider_key')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_secret_id IS NULL THEN
    v_id := vault.create_secret(p_new_value, p_name, 'AI provider API key, managed via ZMedico Settings > AI');
    RETURN v_id;
  ELSE
    PERFORM vault.update_secret(p_secret_id, p_new_value);
    RETURN p_secret_id;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_ai_provider_secret(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_provider_secret(uuid, text, text) TO service_role;

-- Audit log for AI provider CONFIGURATION changes (distinct from ai_tool_audit_log,
-- which logs the AI's runtime tool calls during conversations -- this one logs admin
-- actions on the config itself). Never logs the actual secret value.
CREATE TABLE public.ai_config_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NULL,
  scope text NOT NULL,
  tenant_id uuid NULL,
  action text NOT NULL,
  provider text NULL,
  success boolean NOT NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_config_audit_log_created ON public.ai_config_audit_log(created_at DESC);
ALTER TABLE public.ai_config_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_config_audit_log_system_owner_read ON public.ai_config_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'system_owner'));

