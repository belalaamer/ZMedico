-- Supabase default privileges grant authenticated/service_role EXECUTE even
-- on new trigger-only functions. Their triggers do not need client execution.
DO $$
BEGIN
  IF md5(pg_get_functiondef('public.tg_guard_last_tenant_branch()'::regprocedure)) <> 'e940cde707d81e8d9e073d0679866103'
     OR md5(pg_get_functiondef('public.tg_guard_last_active_tenant_branch()'::regprocedure)) <> '5b27e689c22f492c507af50b59a86c00' THEN
    RAISE EXCEPTION 'Unexpected branch trigger definitions; review before changing grants';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.tg_guard_last_tenant_branch() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tg_guard_last_active_tenant_branch() FROM PUBLIC, anon, authenticated, service_role;
