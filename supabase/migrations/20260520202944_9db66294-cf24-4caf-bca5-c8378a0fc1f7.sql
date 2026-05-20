-- ============================================================
-- Auto-reverse treasury & inventory effects on soft delete
-- ============================================================

-- 1) When a payment is soft-deleted, push a reversing treasury tx
--    and recompute the parent invoice's paid_amount/status.
CREATE OR REPLACE FUNCTION public.tg_payment_after_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t uuid;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    t := NEW.treasury_id;
    IF t IS NULL AND NEW.branch_id IS NOT NULL THEN
      t := public.default_treasury_for_branch(NEW.branch_id);
    END IF;
    IF t IS NOT NULL THEN
      PERFORM public.add_treasury_tx(
        t, 'expense'::treasury_tx_type, NEW.amount,
        'payment_reversal', NEW.id,
        'Reversal: payment deleted #' || COALESCE(NEW.reference_number, substring(NEW.id::text,1,8)),
        'عكس: دفعة محذوفة #' || COALESCE(NEW.reference_number, substring(NEW.id::text,1,8)),
        auth.uid()
      );
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      -- Adjust invoice paid_amount manually (recalc fn sums all payment rows
      -- regardless of deleted_at — so we compute the non-deleted sum here).
      UPDATE public.invoices i
      SET paid_amount = COALESCE((
            SELECT SUM(amount) FROM public.payments
            WHERE invoice_id = i.id AND deleted_at IS NULL
          ), 0),
          status = CASE
            WHEN i.status = 'cancelled' THEN 'cancelled'
            WHEN COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id AND deleted_at IS NULL),0) <= 0
              THEN CASE WHEN i.status = 'draft' THEN 'draft' ELSE 'pending' END
            WHEN COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id AND deleted_at IS NULL),0) >= i.total
              THEN 'paid'
            ELSE 'partial'
          END
      WHERE i.id = NEW.invoice_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_after_soft_delete ON public.payments;
CREATE TRIGGER trg_payment_after_soft_delete
AFTER UPDATE OF deleted_at ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.tg_payment_after_soft_delete();

-- 2) When an expense is soft-deleted, push a reversing treasury tx.
CREATE OR REPLACE FUNCTION public.tg_expense_after_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t uuid;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    t := NEW.treasury_id;
    IF t IS NULL THEN
      t := public.default_treasury_for_branch(NEW.branch_id);
    END IF;
    IF t IS NOT NULL THEN
      PERFORM public.add_treasury_tx(
        t, 'income'::treasury_tx_type, NEW.amount,
        'expense_reversal', NEW.id,
        'Reversal: expense deleted',
        'عكس: مصروف محذوف',
        auth.uid()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_after_soft_delete ON public.expenses;
CREATE TRIGGER trg_expense_after_soft_delete
AFTER UPDATE OF deleted_at ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.tg_expense_after_soft_delete();

-- 3) When a purchase order is soft-deleted, reverse inventory effects of its
--    received items (and the corresponding stock quantity).
CREATE OR REPLACE FUNCTION public.tg_po_after_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  it record;
  cur numeric(14,3);
  newq numeric(14,3);
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    FOR it IN
      SELECT product_id, branch_id, SUM(quantity) AS qty
      FROM public.inventory_transactions
      WHERE reference_type = 'purchase_order' AND reference_id = NEW.id
      GROUP BY product_id, branch_id
    LOOP
      IF it.qty <> 0 THEN
        SELECT quantity INTO cur FROM public.inventory
          WHERE product_id = it.product_id AND branch_id = it.branch_id FOR UPDATE;
        IF cur IS NOT NULL THEN
          newq := GREATEST(cur - it.qty, 0);
          UPDATE public.inventory SET quantity = newq, updated_at = now()
            WHERE product_id = it.product_id AND branch_id = it.branch_id;
          INSERT INTO public.inventory_transactions(
            product_id, branch_id, transaction_type, quantity,
            quantity_before, quantity_after,
            reference_type, reference_id, notes_en, notes_ar, created_by
          ) VALUES (
            it.product_id, it.branch_id, 'adjustment'::inventory_tx_type, -it.qty,
            cur, newq,
            'purchase_order_reversal', NEW.id,
            'Reversal: PO ' || NEW.po_number || ' deleted',
            'عكس: أمر شراء ' || NEW.po_number || ' محذوف',
            auth.uid()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_after_soft_delete ON public.purchase_orders;
CREATE TRIGGER trg_po_after_soft_delete
AFTER UPDATE OF deleted_at ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_po_after_soft_delete();