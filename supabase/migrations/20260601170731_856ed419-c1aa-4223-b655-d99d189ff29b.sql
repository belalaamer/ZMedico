-- Add non-cash balance tracking to treasury

ALTER TABLE public.treasury
  ADD COLUMN IF NOT EXISTS non_cash_balance numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.treasury_transactions
  ADD COLUMN IF NOT EXISTS is_cash boolean NOT NULL DEFAULT true;

-- Updated add_treasury_tx with optional is_cash flag, routes to correct bucket
CREATE OR REPLACE FUNCTION public.add_treasury_tx(
  _treasury_id uuid, _type treasury_tx_type, _amount numeric,
  _ref_type text, _ref_id uuid, _desc_en text, _desc_ar text, _by uuid,
  _is_cash boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  cur numeric(14,2);
  new_balance numeric(14,2);
  delta numeric(14,2);
  new_id uuid;
begin
  if not (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'receptionist'::app_role)
  ) then
    raise exception 'Forbidden: insufficient role';
  end if;

  if _is_cash then
    select current_balance into cur from public.treasury where id = _treasury_id for update;
  else
    select non_cash_balance into cur from public.treasury where id = _treasury_id for update;
  end if;
  if cur is null then
    raise exception 'Treasury % not found', _treasury_id;
  end if;
  delta := case when _type = 'income' then _amount else -_amount end;
  new_balance := cur + delta;
  insert into public.treasury_transactions(
    treasury_id, transaction_type, amount, balance_after,
    reference_type, reference_id, description_en, description_ar, created_by, is_cash
  ) values (
    _treasury_id, _type, _amount, new_balance,
    _ref_type, _ref_id, _desc_en, _desc_ar, _by, _is_cash
  ) returning id into new_id;
  if _is_cash then
    update public.treasury set current_balance = new_balance, updated_at = now() where id = _treasury_id;
  else
    update public.treasury set non_cash_balance = new_balance, updated_at = now() where id = _treasury_id;
  end if;
  return new_id;
end; $function$;

-- Payment trigger routes by payment_method
CREATE OR REPLACE FUNCTION public.tg_payment_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  t uuid;
  is_cash boolean;
begin
  t := new.treasury_id;
  if t is null and new.branch_id is not null then
    t := public.default_treasury_for_branch(new.branch_id);
    if t is not null then
      update public.payments set treasury_id = t where id = new.id;
    end if;
  end if;
  is_cash := (new.payment_method = 'cash'::public.payment_method);
  if t is not null then
    perform public.add_treasury_tx(
      t, 'income'::treasury_tx_type, new.amount,
      'payment', new.id,
      'Payment received #' || coalesce(new.reference_number, substring(new.id::text,1,8)),
      'دفعة مستلمة #' || coalesce(new.reference_number, substring(new.id::text,1,8)),
      new.received_by,
      is_cash
    );
  end if;
  if new.invoice_id is not null then
    perform public.recalc_invoice_payments(new.invoice_id);
  end if;
  return new;
end; $function$;

-- Payment soft delete reverses correct bucket
CREATE OR REPLACE FUNCTION public.tg_payment_after_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  removed_cash numeric(14,2) := 0;
  removed_noncash numeric(14,2) := 0;
  t uuid;
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    t := NEW.treasury_id;
    IF t IS NULL AND NEW.branch_id IS NOT NULL THEN
      t := public.default_treasury_for_branch(new.branch_id);
    END IF;
    IF t IS NOT NULL THEN
      SELECT
        COALESCE(SUM(CASE WHEN is_cash AND transaction_type='income' THEN amount
                          WHEN is_cash AND transaction_type='expense' THEN -amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN NOT is_cash AND transaction_type='income' THEN amount
                          WHEN NOT is_cash AND transaction_type='expense' THEN -amount ELSE 0 END), 0)
        INTO removed_cash, removed_noncash
        FROM public.treasury_transactions
        WHERE treasury_id = t AND reference_type = 'payment' AND reference_id = NEW.id;

      DELETE FROM public.treasury_transactions
        WHERE treasury_id = t AND reference_type IN ('payment','payment_reversal') AND reference_id = NEW.id;

      IF removed_cash <> 0 OR removed_noncash <> 0 THEN
        UPDATE public.treasury
          SET current_balance = current_balance - removed_cash,
              non_cash_balance = non_cash_balance - removed_noncash,
              updated_at = now()
          WHERE id = t;
      END IF;
    END IF;

    IF NEW.invoice_id IS NOT NULL THEN
      UPDATE public.invoices i
      SET paid_amount = COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id AND deleted_at IS NULL), 0),
          status = (CASE
            WHEN i.status = 'cancelled' THEN 'cancelled'
            WHEN COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id AND deleted_at IS NULL),0) <= 0
              THEN CASE WHEN i.status = 'draft' THEN 'draft' ELSE 'pending' END
            WHEN COALESCE((SELECT SUM(amount) FROM public.payments WHERE invoice_id = i.id AND deleted_at IS NULL),0) >= i.total
              THEN 'paid'
            ELSE 'partial'
          END)::public.invoice_status
      WHERE i.id = NEW.invoice_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill: mark existing treasury_transactions is_cash based on linked payment method
UPDATE public.treasury_transactions tt
SET is_cash = (p.payment_method = 'cash'::public.payment_method)
FROM public.payments p
WHERE tt.reference_type = 'payment'
  AND tt.reference_id = p.id
  AND tt.is_cash = true
  AND p.payment_method IS DISTINCT FROM 'cash'::public.payment_method;

-- Recompute treasury balances from scratch using transactions
WITH agg AS (
  SELECT treasury_id,
    COALESCE(SUM(CASE WHEN is_cash AND transaction_type='income' THEN amount
                      WHEN is_cash AND transaction_type='expense' THEN -amount
                      WHEN is_cash AND transaction_type='transfer' THEN
                        CASE WHEN amount > 0 THEN amount ELSE amount END
                      ELSE 0 END), 0) AS cash,
    COALESCE(SUM(CASE WHEN NOT is_cash AND transaction_type='income' THEN amount
                      WHEN NOT is_cash AND transaction_type='expense' THEN -amount
                      ELSE 0 END), 0) AS noncash
  FROM public.treasury_transactions
  GROUP BY treasury_id
)
UPDATE public.treasury t
SET non_cash_balance = COALESCE(agg.noncash, 0),
    current_balance = t.current_balance - COALESCE(agg.noncash, 0)
FROM agg
WHERE agg.treasury_id = t.id
  AND agg.noncash <> 0;