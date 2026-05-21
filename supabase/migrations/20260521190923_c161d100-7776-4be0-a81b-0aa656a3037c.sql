
CREATE OR REPLACE FUNCTION public.tg_payment_after_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  removed_amount numeric(14,2) := 0;
  t uuid;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    t := NEW.treasury_id;
    IF t IS NULL AND NEW.branch_id IS NOT NULL THEN
      t := public.default_treasury_for_branch(NEW.branch_id);
    END IF;
    IF t IS NOT NULL THEN
      SELECT COALESCE(SUM(CASE WHEN transaction_type='income' THEN amount ELSE -amount END), 0)
        INTO removed_amount
        FROM public.treasury_transactions
        WHERE treasury_id = t AND reference_type = 'payment' AND reference_id = NEW.id;

      DELETE FROM public.treasury_transactions
        WHERE treasury_id = t AND reference_type IN ('payment','payment_reversal') AND reference_id = NEW.id;

      IF removed_amount <> 0 THEN
        UPDATE public.treasury
          SET current_balance = current_balance - removed_amount, updated_at = now()
          WHERE id = t;
      END IF;
    END IF;

    IF NEW.invoice_id IS NOT NULL THEN
      UPDATE public.invoices i
      SET paid_amount = COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id AND deleted_at IS NULL), 0),
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
$function$;

CREATE OR REPLACE FUNCTION public.tg_expense_after_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  removed_amount numeric(14,2) := 0;
  t uuid;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    t := NEW.treasury_id;
    IF t IS NULL THEN
      t := public.default_treasury_for_branch(NEW.branch_id);
    END IF;
    IF t IS NOT NULL THEN
      SELECT COALESCE(SUM(CASE WHEN transaction_type='income' THEN amount ELSE -amount END), 0)
        INTO removed_amount
        FROM public.treasury_transactions
        WHERE treasury_id = t AND reference_type = 'expense' AND reference_id = NEW.id;

      DELETE FROM public.treasury_transactions
        WHERE treasury_id = t AND reference_type IN ('expense','expense_reversal') AND reference_id = NEW.id;

      IF removed_amount <> 0 THEN
        UPDATE public.treasury
          SET current_balance = current_balance - removed_amount, updated_at = now()
          WHERE id = t;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
