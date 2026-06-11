
-- 1) Idempotency: partial unique index for wallet spend reversal
CREATE UNIQUE INDEX IF NOT EXISTS ux_pwt_payment_adjustment_credit_reversal
  ON public.patient_wallet_transactions(reference_id)
  WHERE reference_type = 'payment' AND tx_type = 'adjustment_credit';

-- 2) Mirror top-up refund error handling in spend reversal branch
CREATE OR REPLACE FUNCTION public.tg_payment_after_soft_delete_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    -- Reverse a top-up: debit wallet (refund)
    IF OLD.is_wallet_topup = true AND OLD.wallet_credit_tx_id IS NOT NULL THEN
      BEGIN
        PERFORM public.apply_wallet_tx(
          OLD.patient_id, 'refund'::public.wallet_tx_type, OLD.amount,
          'payment', OLD.id,
          'Reversal of wallet top-up (payment deleted)',
          'عكس شحن المحفظة (تم حذف الدفعة)',
          OLD.branch_id
        );
      EXCEPTION WHEN unique_violation THEN NULL;
            WHEN OTHERS THEN RAISE;
      END;
    END IF;
    -- Reverse a wallet spend: credit wallet back via adjustment_credit
    IF OLD.payment_method = 'wallet'::public.payment_method AND OLD.is_wallet_topup = false THEN
      BEGIN
        PERFORM public.apply_wallet_tx(
          OLD.patient_id, 'adjustment_credit'::public.wallet_tx_type, OLD.amount,
          'payment', OLD.id,
          'Reversal of wallet spend (payment deleted)',
          'عكس سحب من المحفظة (تم حذف الدفعة)',
          OLD.branch_id
        );
      EXCEPTION WHEN unique_violation THEN NULL;
            WHEN OTHERS THEN RAISE;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) EXECUTE hardening on apply_wallet_tx
REVOKE EXECUTE ON FUNCTION public.apply_wallet_tx(uuid, public.wallet_tx_type, numeric, text, uuid, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_wallet_tx(uuid, public.wallet_tx_type, numeric, text, uuid, text, text, uuid) TO authenticated;
