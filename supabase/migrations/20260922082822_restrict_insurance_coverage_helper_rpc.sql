REVOKE EXECUTE ON FUNCTION public.fn_resolve_coverage(uuid, public.invoice_item_type, uuid, numeric)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_coverage(uuid, public.invoice_item_type, uuid, numeric)
TO service_role;
