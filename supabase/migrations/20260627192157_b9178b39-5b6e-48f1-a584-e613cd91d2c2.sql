-- Add the missing record_procedure_id link to invoice_items and update the cancel reversal trigger
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS record_procedure_id uuid REFERENCES public.record_procedures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoice_items_record_procedure_id_idx
  ON public.invoice_items(record_procedure_id)
  WHERE record_procedure_id IS NOT NULL;

-- Harden the cancel reversal trigger so it never crashes if the column is empty,
-- and also fall back to cancelling commissions via medical_record_id linkage
-- (covers older invoices that were created before record_procedure_id existed).
CREATE OR REPLACE FUNCTION public.tg_invoice_after_cancel_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  is_wallet_spend boolean;
BEGIN
  IF NEW.status <> 'cancelled'::public.invoice_status THEN RETURN NEW; END IF;
  IF OLD.status = 'cancelled'::public.invoice_status THEN RETURN NEW; END IF;
  IF NEW.voided_at IS NOT NULL THEN RETURN NEW; END IF;

  FOR p IN
    SELECT * FROM public.payments
     WHERE invoice_id = NEW.id AND deleted_at IS NULL
     FOR UPDATE
  LOOP
    is_wallet_spend := (p.payment_method = 'wallet'::public.payment_method AND p.is_wallet_topup = false);

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

    UPDATE public.payments SET deleted_at = now() WHERE id = p.id;
  END LOOP;

  PERFORM public.recalc_invoice_payments(NEW.id);

  -- Cancel pending commissions linked directly via record_procedure_id on invoice_items
  BEGIN
    UPDATE public.doctor_commissions dc
       SET status = 'cancelled', updated_at = now()
     WHERE dc.status = 'pending'
       AND dc.record_procedure_id IN (
         SELECT ii.record_procedure_id
           FROM public.invoice_items ii
          WHERE ii.invoice_id = NEW.id
            AND ii.record_procedure_id IS NOT NULL
       );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'commission cancel by invoice_items failed: %', SQLERRM;
  END;

  -- Fallback: also cancel via medical_record link on the invoice (for legacy rows)
  BEGIN
    IF NEW.medical_record_id IS NOT NULL THEN
      UPDATE public.doctor_commissions dc
         SET status = 'cancelled', updated_at = now()
       WHERE dc.status = 'pending'
         AND dc.medical_record_id = NEW.medical_record_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'commission cancel by medical_record failed: %', SQLERRM;
  END;

  UPDATE public.invoices SET voided_at = now() WHERE id = NEW.id AND voided_at IS NULL;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.tg_invoice_after_cancel_reversal() FROM PUBLIC, anon, authenticated;