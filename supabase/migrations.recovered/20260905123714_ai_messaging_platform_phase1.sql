-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260905123714
-- name: ai_messaging_platform_phase1
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- AI Messaging Platform — Phase 1 infrastructure
-- channel_accounts, conversations, messages, ai_tenant_settings

-- 1) channel_accounts
CREATE TABLE public.channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid NULL REFERENCES public.branches(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','instagram','messenger')),
  external_account_id text NOT NULL,
  display_name text NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_account_id)
);
CREATE INDEX idx_channel_accounts_tenant ON public.channel_accounts(tenant_id);
CREATE INDEX idx_channel_accounts_branch ON public.channel_accounts(branch_id);

CREATE OR REPLACE FUNCTION public.tg_channel_account_branch_tenant_match()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = NEW.branch_id AND tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'branch_tenant_mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_channel_account_branch_tenant_match
BEFORE INSERT OR UPDATE ON public.channel_accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_channel_account_branch_tenant_match();
CREATE TRIGGER trg_channel_accounts_updated_at
BEFORE UPDATE ON public.channel_accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_accounts_select_scoped ON public.channel_accounts FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY channel_accounts_write_scoped ON public.channel_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'system_owner') OR public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(),'system_owner') OR public.user_has_tenant_access(tenant_id));

-- 2) conversations
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid NULL REFERENCES public.branches(id) ON DELETE SET NULL,
  channel_account_id uuid NOT NULL REFERENCES public.channel_accounts(id),
  channel text NOT NULL CHECK (channel IN ('whatsapp','instagram','messenger')),
  external_contact_id text NOT NULL,
  patient_id uuid NULL REFERENCES public.patients(id),
  status text NOT NULL DEFAULT 'ai_active' CHECK (status IN ('ai_active','human_active','closed')),
  assigned_staff_id uuid NULL REFERENCES public.profiles(id),
  handoff_reason text NULL,
  handoff_at timestamptz NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_conversations_active_contact ON public.conversations(channel_account_id, external_contact_id) WHERE status <> 'closed';
CREATE INDEX idx_conversations_tenant ON public.conversations(tenant_id);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);
COMMENT ON COLUMN public.conversations.branch_id IS 'Set only after backend validation confirms the branch belongs to tenant_id. Never trust an AI/customer-stated branch directly -- keep it as a candidate in state until confirmed.';

CREATE OR REPLACE FUNCTION public.tg_conversation_branch_tenant_match()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = NEW.branch_id AND tenant_id = NEW.tenant_id
  ) THEN RAISE EXCEPTION 'branch_tenant_mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_conversation_branch_tenant_match
BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_branch_tenant_match();
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_select_scoped ON public.conversations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'system_owner')
    OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
    OR (branch_id IS NULL AND public.user_has_tenant_access(tenant_id)));
CREATE POLICY conversations_update_scoped ON public.conversations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'system_owner')
    OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
    OR (branch_id IS NULL AND public.user_has_tenant_access(tenant_id)))
  WITH CHECK (public.has_role(auth.uid(),'system_owner')
    OR (branch_id IS NOT NULL AND public.user_has_branch_access(branch_id))
    OR (branch_id IS NULL AND public.user_has_tenant_access(tenant_id)));

-- 3) messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_type text NOT NULL CHECK (sender_type IN ('patient','ai','staff','system')),
  content text NULL,
  message_type text NOT NULL DEFAULT 'text',
  media_url text NULL,
  external_message_id text NULL,
  ai_generated boolean NOT NULL DEFAULT false,
  delivery_status text NULL,
  raw_payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_messages_external_id ON public.messages(external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_tenant ON public.messages(tenant_id);

CREATE OR REPLACE FUNCTION public.tg_message_tenant_match()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_conv_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_conv_tenant FROM public.conversations WHERE id = NEW.conversation_id;
  IF v_conv_tenant IS NULL OR v_conv_tenant <> NEW.tenant_id THEN RAISE EXCEPTION 'message_tenant_mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_message_tenant_match
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.tg_message_tenant_match();

CREATE OR REPLACE FUNCTION public.tg_prevent_ai_message_when_human_active()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  IF NEW.sender_type = 'ai' THEN
    SELECT status INTO v_status FROM public.conversations WHERE id = NEW.conversation_id;
    IF v_status IS DISTINCT FROM 'ai_active' THEN RAISE EXCEPTION 'ai_reply_blocked_conversation_not_ai_active'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_prevent_ai_message_when_human_active
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_ai_message_when_human_active();

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_select_scoped ON public.messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'system_owner') OR EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id
      AND ((c.branch_id IS NOT NULL AND public.user_has_branch_access(c.branch_id))
        OR (c.branch_id IS NULL AND public.user_has_tenant_access(c.tenant_id)))));
CREATE POLICY messages_insert_staff_reply ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_type = 'staff' AND EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id
      AND ((c.branch_id IS NOT NULL AND public.user_has_branch_access(c.branch_id))
        OR (c.branch_id IS NULL AND public.user_has_tenant_access(c.tenant_id)))));

-- 4) ai_tenant_settings
CREATE TABLE public.ai_tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id),
  ai_enabled boolean NOT NULL DEFAULT false,
  language text NOT NULL DEFAULT 'ar',
  tone text NULL,
  greeting_en text NULL,
  greeting_ar text NULL,
  booking_enabled boolean NOT NULL DEFAULT true,
  rescheduling_enabled boolean NOT NULL DEFAULT true,
  cancellation_enabled boolean NOT NULL DEFAULT true,
  human_handoff_enabled boolean NOT NULL DEFAULT true,
  business_hours_behavior text NOT NULL DEFAULT 'ai_always' CHECK (business_hours_behavior IN ('ai_always','ai_business_hours_only','human_only_after_hours')),
  custom_instructions text NULL,
  extra_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_ai_tenant_settings_updated_at
BEFORE UPDATE ON public.ai_tenant_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.ai_tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_tenant_settings_select_scoped ON public.ai_tenant_settings FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));
CREATE POLICY ai_tenant_settings_write_scoped ON public.ai_tenant_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'system_owner') OR public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.has_role(auth.uid(),'system_owner') OR public.user_has_tenant_access(tenant_id));

