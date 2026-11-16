-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260905161736
-- name: ai_tool_audit_log
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- AI tool call audit log -- every tool invocation the AI agent makes, especially
-- sensitive ones (booking/cancel/reschedule/patient lookup/human handoff).
CREATE TABLE public.ai_tool_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  conversation_id uuid NULL REFERENCES public.conversations(id),
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NULL,
  success boolean NOT NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_tool_audit_log_tenant ON public.ai_tool_audit_log(tenant_id);
CREATE INDEX idx_ai_tool_audit_log_conversation ON public.ai_tool_audit_log(conversation_id);
CREATE INDEX idx_ai_tool_audit_log_tool_name ON public.ai_tool_audit_log(tool_name);

ALTER TABLE public.ai_tool_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_tool_audit_log_select_scoped ON public.ai_tool_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'system_owner') OR public.user_has_tenant_access(tenant_id));
-- No INSERT/UPDATE/DELETE policy for `authenticated` -- only the service-role-driven
-- AI orchestrator writes here, same trust boundary as conversations/messages.

