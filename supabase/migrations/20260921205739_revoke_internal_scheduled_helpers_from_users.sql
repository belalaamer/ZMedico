-- Internal scheduled/trigger helpers are not part of the client RPC surface.
REVOKE ALL ON FUNCTION public.fn_consume_for_invoice(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consume_for_invoice(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.notify_pending_booking_expiry_soon()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_pending_booking_expiry_soon()
  TO service_role;
