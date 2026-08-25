-- The tenant-scoped catalog RLS policies call this SECURITY DEFINER helper.
-- Keep execution restricted to authenticated users so services/procedures can be
-- evaluated by RLS without exposing the helper to anonymous callers.
REVOKE ALL ON FUNCTION public.user_has_tenant_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid) TO authenticated;
