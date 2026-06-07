-- 1. Table
CREATE TABLE public.service_consumables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_consumables_one_parent
    CHECK ((service_id IS NOT NULL) <> (procedure_id IS NOT NULL))
);

CREATE UNIQUE INDEX service_consumables_service_product_key
  ON public.service_consumables(service_id, product_id)
  WHERE service_id IS NOT NULL;

CREATE UNIQUE INDEX service_consumables_procedure_product_key
  ON public.service_consumables(procedure_id, product_id)
  WHERE procedure_id IS NOT NULL;

CREATE INDEX idx_service_consumables_product ON public.service_consumables(product_id);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_consumables TO authenticated;
GRANT ALL ON public.service_consumables TO service_role;

-- 3. RLS
ALTER TABLE public.service_consumables ENABLE ROW LEVEL SECURITY;

CREATE POLICY sc_select ON public.service_consumables
  FOR SELECT TO authenticated USING (true);

CREATE POLICY sc_admin_insert ON public.service_consumables
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY sc_admin_update ON public.service_consumables
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY sc_admin_delete ON public.service_consumables
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. updated_at trigger
CREATE TRIGGER trg_service_consumables_updated_at
  BEFORE UPDATE ON public.service_consumables
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5. Consumption function (idempotent)
CREATE OR REPLACE FUNCTION public.fn_consume_for_invoice(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
  r RECORD;
  total_qty numeric(14,3);
BEGIN
  IF _invoice_id IS NULL THEN RETURN; END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF inv.id IS NULL OR inv.deleted_at IS NOT NULL OR inv.status <> 'paid'::public.invoice_status THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT sc.product_id,
           SUM(COALESCE(ii.quantity,1) * COALESCE(sc.quantity,1))::numeric(14,3) AS qty
    FROM public.invoice_items ii
    JOIN public.service_consumables sc
      ON (ii.item_type = 'service'::public.invoice_item_type   AND sc.service_id   = ii.product_id)
      OR (ii.item_type = 'procedure'::public.invoice_item_type AND sc.procedure_id = ii.product_id)
    WHERE ii.invoice_id = _invoice_id
    GROUP BY sc.product_id
  LOOP
    -- Idempotency guard: skip if already consumed for this invoice + product
    IF EXISTS (
      SELECT 1 FROM public.inventory_transactions
      WHERE reference_type = 'invoice_consumable'
        AND reference_id   = _invoice_id
        AND product_id     = r.product_id
    ) THEN
      CONTINUE;
    END IF;

    total_qty := r.qty;
    IF total_qty IS NULL OR total_qty <= 0 THEN CONTINUE; END IF;

    BEGIN
      PERFORM public.apply_inventory_tx(
        r.product_id,
        inv.branch_id,
        'sale'::public.inventory_tx_type,
        -total_qty,
        NULL,
        'invoice_consumable',
        _invoice_id,
        'Auto-consumed for paid invoice ' || inv.invoice_number,
        'استهلاك تلقائي لفاتورة مدفوعة ' || inv.invoice_number,
        NULL, NULL, NULL
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log via notice but don't block invoice status update
      RAISE NOTICE 'fn_consume_for_invoice: skipping product % – %', r.product_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- 6. Trigger on invoices: only fires on status transition INTO 'paid'
CREATE OR REPLACE FUNCTION public.tg_invoice_after_status_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.deleted_at IS NULL
     AND NEW.status = 'paid'::public.invoice_status
     AND (OLD.status IS DISTINCT FROM NEW.status)
  THEN
    PERFORM public.fn_consume_for_invoice(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_after_status_paid ON public.invoices;
CREATE TRIGGER trg_invoice_after_status_paid
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_after_status_paid();