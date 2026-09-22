REVOKE EXECUTE ON FUNCTION public.default_treasury_for_branch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.default_treasury_for_branch(uuid) TO service_role;
