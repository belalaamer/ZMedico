
-- Idempotency marker for invoice cancellations
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

-- Reverse wallet/treasury movements + cancel pending commissions when an
-- invoice transitions to 'cancelled'. Idempotent via invoices.voided_at.
CREATE OR REPLACE FUNCTION public.tg_invoice_after_cancel_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p RECORD;
  is_wallet_spend boolean;
BEGIN
  -- Only run on transition into cancelled and only once
  IF NEW.status <> 'cancelled'::public.invoice_status THEN RETURN NEW; END IF;
  IF OLD.status = 'cancelled'::public.invoice_status THEN RETURN NEW; END IF;
  IF NEW.voided_at IS NOT NULL THEN RETURN NEW; END IF;

  -- Iterate active payments tied to this invoice and reverse them
  FOR p IN
    SELECT * FROM public.payments
     WHERE invoice_id = NEW.id AND deleted_at IS NULL
     FOR UPDATE
  LOOP
    is_wallet_spend := (p.payment_method = 'wallet'::public.payment_method AND p.is_wallet_topup = false);

    -- Wallet reversal: restore wallet balance for spends (refund) and
    -- debit back any top-up wrongly attached to a now-cancelled invoice.
    IF is_wallet_spend THEN
      BEGIN
        PERFORM public.apply_wallet_tx(
          p.patient_id, 'refund'::public.wallet_tx_type, p.amount,
          'invoice_cancel', NEW.id,
          'Reversal: cancelled invoice ' || NEW.invoice_number,
          'استرجاع: فاتورة ملغاة ' || NEW.invoice_number,
          NEW.branch_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'wallet refund reversal failed for payment %: %', p.id, SQLERRM;
      END;
    ELSIF p.is_wallet_topup = true THEN
      BEGIN
        PERFORM public.apply_wallet_tx(
          p.patient_id, 'adjustment_debit'::public.wallet_tx_type, p.amount,
          'invoice_cancel', NEW.id,
          'Reversal of top-up tied to cancelled invoice ' || NEW.invoice_number,
          'عكس شحن مرتبط بفاتورة ملغاة ' || NEW.invoice_number,
          NEW.branch_id);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'wallet topup reversal failed for payment %: %', p.id, SQLERRM;
      END;
    ELSE
      -- Cash / non-cash: reverse the treasury movement
      IF p.treasury_id IS NOT NULL THEN
        BEGIN
          PERFORM public.add_treasury_tx(
            p.treasury_id, 'expense'::public.treasury_tx_type, p.amount,
            'payment_reversal', p.id,
            'Reversal: cancelled invoice ' || NEW.invoice_number,
            'استرجاع: فاتورة ملغاة ' || NEW.invoice_number,
            auth.uid(),
            (p.payment_method = 'cash'::public.payment_method));
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'treasury reversal failed for payment %: %', p.id, SQLERRM;
        END;
      END IF;
    END IF;

    -- Soft-delete the payment so it stops counting toward paid_amount
    UPDATE public.payments
       SET deleted_at = now()
     WHERE id = p.id;
  END LOOP;

  -- Recalc paid_amount + commission collected amounts for this invoice
  PERFORM public.recalc_invoice_payments(NEW.id);

  -- Cancel any still-pending doctor commissions for this invoice's procedures
  UPDATE public.doctor_commissions dc
     SET status = 'cancelled', updated_at = now()
   WHERE dc.status = 'pending'
     AND dc.record_procedure_id IN (
       SELECT ii.record_procedure_id
         FROM public.invoice_items ii
        WHERE ii.invoice_id = NEW.id AND ii.record_procedure_id IS NOT NULL
     );

  -- Mark as voided so this trigger is a no-op on re-entry
  UPDATE public.invoices SET voided_at = now() WHERE id = NEW.id AND voided_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_after_cancel_reversal ON public.invoices;
CREATE TRIGGER trg_invoice_after_cancel_reversal
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.tg_invoice_after_cancel_reversal();
