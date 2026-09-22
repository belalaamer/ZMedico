CREATE OR REPLACE FUNCTION public.void_invoice_financials(
  _invoice_id uuid,
  _user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  it RECORD;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Forbidden: authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF _invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id required';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'admin'::public.app_role)
    OR public.has_role(v_actor, 'accountant'::public.app_role)
    OR public.has_permission(v_actor, 'invoices.delete')
  ) THEN
    RAISE EXCEPTION 'Forbidden: void_invoice_financials'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO inv
  FROM public.invoices
  WHERE id = _invoice_id
  FOR UPDATE;

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF inv.branch_id IS NULL OR NOT public.user_has_branch_access(inv.branch_id) THEN
    RAISE EXCEPTION 'Forbidden: invoice is outside the caller branch scope'
      USING ERRCODE = '42501';
  END IF;

  IF inv.status = 'cancelled' THEN
    RETURN;
  END IF;

  UPDATE public.invoices
  SET status = 'cancelled',
      voided_at = now()
  WHERE id = _invoice_id;

  UPDATE public.payments
  SET deleted_at = now()
  WHERE invoice_id = _invoice_id
    AND deleted_at IS NULL;

  IF inv.branch_id IS NOT NULL THEN
    FOR it IN
      SELECT product_id, quantity
      FROM public.invoice_items
      WHERE invoice_id = _invoice_id
        AND item_type = 'product'
        AND product_id IS NOT NULL
        AND COALESCE(quantity, 0) > 0
    LOOP
      PERFORM public.apply_inventory_tx(
        it.product_id,
        inv.branch_id,
        'return'::public.inventory_tx_type,
        it.quantity,
        NULL::numeric,
        'invoice_cancel',
        _invoice_id,
        'Cancelled invoice ' || inv.invoice_number,
        'إلغاء فاتورة ' || inv.invoice_number,
        NULL::date,
        NULL::text,
        v_actor
      );
    END LOOP;
  END IF;

  IF inv.medical_record_id IS NOT NULL THEN
    UPDATE public.doctor_commissions
    SET status = 'cancelled'::public.commission_status
    WHERE medical_record_id = inv.medical_record_id
      AND status IN ('earned','partial','pending')
      AND payroll_id IS NULL;
  END IF;
END;
$function$;
