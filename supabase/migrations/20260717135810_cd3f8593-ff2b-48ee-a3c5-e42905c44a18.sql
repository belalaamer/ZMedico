
-- 1) Update recalc_commissions_for_invoice to use discounted proportional base_amount from invoice_items
CREATE OR REPLACE FUNCTION public.recalc_commissions_for_invoice(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  ratio numeric(10,6);        -- paid / total
  disc_ratio numeric(10,6);   -- total / subtotal (proportional discount)
BEGIN
  IF _invoice_id IS NULL THEN RETURN; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF inv.id IS NULL OR inv.medical_record_id IS NULL THEN RETURN; END IF;

  ratio := CASE WHEN COALESCE(inv.total,0) > 0
                THEN LEAST(COALESCE(inv.paid_amount,0)/inv.total, 1)
                ELSE 0 END;

  -- Proportional discount factor: total / subtotal. Fallback = 1.
  disc_ratio := CASE WHEN COALESCE(inv.subtotal,0) > 0
                     THEN COALESCE(inv.total,0) / inv.subtotal
                     ELSE 1 END;

  -- First: for commissions linked via invoice_items.record_procedure_id,
  -- rebase base_amount to the (unit_price * qty) * disc_ratio from the item.
  UPDATE public.doctor_commissions dc
    SET base_amount = round((ii.unit_price * ii.quantity) * disc_ratio, 2),
        updated_at = now()
    FROM public.invoice_items ii
    WHERE ii.invoice_id = inv.id
      AND ii.record_procedure_id IS NOT NULL
      AND dc.record_procedure_id = ii.record_procedure_id
      AND dc.status NOT IN ('paid','cancelled');

  -- Then: recompute collected/commission/status from the (possibly rebased) base.
  UPDATE public.doctor_commissions dc
    SET collected_amount = round(dc.base_amount * ratio, 2),
        commission_amount = round(dc.base_amount * ratio * dc.commission_percent / 100, 2),
        status = CASE
          WHEN dc.status IN ('paid','cancelled') THEN dc.status
          WHEN ratio <= 0 THEN 'pending'::public.commission_status
          WHEN ratio >= 1 THEN 'earned'::public.commission_status
          ELSE 'partial'::public.commission_status
        END,
        updated_at = now()
    WHERE dc.medical_record_id = inv.medical_record_id
      AND dc.status NOT IN ('paid','cancelled');
END; $function$;

-- 2) Atomic invoice void RPC
CREATE OR REPLACE FUNCTION public.void_invoice_financials(_invoice_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  it RECORD;
BEGIN
  IF _invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id required';
  END IF;

  -- Permission: admin, accountant, or invoices.delete via has_permission
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_permission(auth.uid(), 'invoices.delete')
  ) THEN
    RAISE EXCEPTION 'Forbidden: void_invoice_financials';
  END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF inv.status = 'cancelled' THEN
    RETURN;
  END IF;

  -- a) Cancel invoice
  UPDATE public.invoices
    SET status = 'cancelled',
        voided_at = now(),
        updated_at = now()
    WHERE id = _invoice_id;

  -- b) Soft-delete linked payments
  UPDATE public.payments
    SET deleted_at = now(),
        updated_at = now()
    WHERE invoice_id = _invoice_id
      AND deleted_at IS NULL;

  -- c) Restore inventory for product line items
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
        'return'::inventory_tx_type,
        it.quantity,
        NULL::numeric,
        'invoice_cancel',
        _invoice_id,
        'Cancelled invoice ' || inv.invoice_number,
        'إلغاء فاتورة ' || inv.invoice_number,
        NULL::date,
        NULL::text,
        _user_id
      );
    END LOOP;
  END IF;

  -- d) Cancel unpaid commissions on this invoice's medical record
  IF inv.medical_record_id IS NOT NULL THEN
    UPDATE public.doctor_commissions
      SET status = 'cancelled'::commission_status,
          updated_at = now()
      WHERE medical_record_id = inv.medical_record_id
        AND status IN ('earned','partial','pending')
        AND payroll_id IS NULL;
  END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.void_invoice_financials(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_invoice_financials(uuid, uuid) TO authenticated;
