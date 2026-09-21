-- Pin search_path on AI messaging trigger functions so object resolution
-- cannot be influenced by a caller-controlled search_path.
ALTER FUNCTION public.tg_channel_account_branch_tenant_match() SET search_path TO public;
ALTER FUNCTION public.tg_conversation_branch_tenant_match() SET search_path TO public;
ALTER FUNCTION public.tg_message_tenant_match() SET search_path TO public;
ALTER FUNCTION public.tg_prevent_ai_message_when_human_active() SET search_path TO public;
