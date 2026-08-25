-- fn_resolve_coverage is a read-only calculation RPC called directly by the
-- authenticated insurance contract UI. Keep anonymous callers blocked.
REVOKE EXECUTE ON FUNCTION public.fn_resolve_coverage(uuid, public.invoice_item_type, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_coverage(uuid, public.invoice_item_type, uuid, numeric) TO authenticated;
