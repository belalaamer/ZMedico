
-- ============================================================
-- Migration 1: Insurance Contracts
-- ============================================================

-- 1) insurance_contracts ---------------------------------------------------
CREATE TABLE public.insurance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_company_id uuid NOT NULL
    REFERENCES public.insurance_companies(id) ON DELETE CASCADE,
  name_en text NOT NULL,
  name_ar text,
  valid_from date,
  valid_to date,
  default_coverage_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (default_coverage_percent >= 0 AND default_coverage_percent <= 100),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_insurance_contracts_company
  ON public.insurance_contracts(insurance_company_id) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_contracts TO authenticated;
GRANT ALL ON public.insurance_contracts TO service_role;

ALTER TABLE public.insurance_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_read_authenticated"
  ON public.insurance_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "contracts_write_admin_manager"
  ON public.insurance_contracts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'manager'::public.app_role));

CREATE TRIGGER trg_insurance_contracts_updated_at
  BEFORE UPDATE ON public.insurance_contracts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) insurance_contract_rules ---------------------------------------------
CREATE TABLE public.insurance_contract_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL
    REFERENCES public.insurance_contracts(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('service','procedure','item_type')),
  target_id uuid,
  item_type public.invoice_item_type,
  coverage_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
  max_amount_per_item numeric(14,2),
  excluded boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Shape integrity:
  CHECK (
    (scope IN ('service','procedure') AND target_id IS NOT NULL AND item_type IS NULL)
    OR
    (scope = 'item_type' AND item_type IS NOT NULL AND target_id IS NULL)
  )
);

CREATE INDEX idx_contract_rules_contract  ON public.insurance_contract_rules(contract_id);
CREATE INDEX idx_contract_rules_lookup    ON public.insurance_contract_rules(contract_id, scope, target_id);
CREATE INDEX idx_contract_rules_itemtype  ON public.insurance_contract_rules(contract_id, scope, item_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_contract_rules TO authenticated;
GRANT ALL ON public.insurance_contract_rules TO service_role;

ALTER TABLE public.insurance_contract_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_rules_read_authenticated"
  ON public.insurance_contract_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "contract_rules_write_admin_manager"
  ON public.insurance_contract_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'manager'::public.app_role));

CREATE TRIGGER trg_insurance_contract_rules_updated_at
  BEFORE UPDATE ON public.insurance_contract_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) invoice_items audit columns (additive, defaulted) --------------------
ALTER TABLE public.invoice_items
  ADD COLUMN insurance_covered_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN insurance_rule_id uuid
    REFERENCES public.insurance_contract_rules(id) ON DELETE SET NULL;

-- 4) Resolver -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_coverage(
  _contract_id uuid,
  _item_type   public.invoice_item_type,
  _product_id  uuid,
  _line_total  numeric
) RETURNS TABLE (rule_id uuid, covered_amount numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  c record;
  cap numeric(14,2);
  cov numeric(14,2);
BEGIN
  IF _contract_id IS NULL OR _line_total IS NULL OR _line_total <= 0 THEN
    rule_id := NULL; covered_amount := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO c FROM public.insurance_contracts
    WHERE id = _contract_id AND is_active
      AND (valid_from IS NULL OR valid_from <= current_date)
      AND (valid_to   IS NULL OR valid_to   >= current_date);
  IF c.id IS NULL THEN
    rule_id := NULL; covered_amount := 0; RETURN NEXT; RETURN;
  END IF;

  -- Step 1: exact service / procedure match
  IF _product_id IS NOT NULL AND _item_type IN ('service'::public.invoice_item_type,'procedure'::public.invoice_item_type) THEN
    SELECT * INTO r FROM public.insurance_contract_rules
      WHERE contract_id = _contract_id
        AND scope = CASE _item_type
                      WHEN 'service'::public.invoice_item_type   THEN 'service'
                      WHEN 'procedure'::public.invoice_item_type THEN 'procedure'
                    END
        AND target_id = _product_id
      ORDER BY priority ASC, updated_at DESC
      LIMIT 1;
    IF r.id IS NOT NULL THEN
      IF r.excluded THEN
        rule_id := r.id; covered_amount := 0; RETURN NEXT; RETURN;
      END IF;
      cov := round(_line_total * r.coverage_percent / 100.0, 2);
      cap := r.max_amount_per_item;
      IF cap IS NOT NULL AND cov > cap THEN cov := cap; END IF;
      rule_id := r.id; covered_amount := cov; RETURN NEXT; RETURN;
    END IF;
  END IF;

  -- Step 2: item_type fallback
  SELECT * INTO r FROM public.insurance_contract_rules
    WHERE contract_id = _contract_id
      AND scope = 'item_type'
      AND item_type = _item_type
    ORDER BY priority ASC, updated_at DESC
    LIMIT 1;
  IF r.id IS NOT NULL THEN
    IF r.excluded THEN
      rule_id := r.id; covered_amount := 0; RETURN NEXT; RETURN;
    END IF;
    cov := round(_line_total * r.coverage_percent / 100.0, 2);
    cap := r.max_amount_per_item;
    IF cap IS NOT NULL AND cov > cap THEN cov := cap; END IF;
    rule_id := r.id; covered_amount := cov; RETURN NEXT; RETURN;
  END IF;

  -- Step 3: contract default
  cov := round(_line_total * c.default_coverage_percent / 100.0, 2);
  rule_id := NULL; covered_amount := cov; RETURN NEXT; RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resolve_coverage(uuid, public.invoice_item_type, uuid, numeric) TO authenticated;
