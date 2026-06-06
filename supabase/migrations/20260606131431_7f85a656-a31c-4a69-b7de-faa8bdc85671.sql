
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric(14,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric(14,2) DEFAULT 0,
  max_discount_amount numeric(14,2),
  usage_limit int,
  usage_count int NOT NULL DEFAULT 0,
  starts_at date,
  ends_at date,
  is_active boolean NOT NULL DEFAULT true,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coupons manage by privileged roles"
ON public.coupons FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'accountant'::app_role)
  OR public.has_role(auth.uid(),'receptionist'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'accountant'::app_role)
  OR public.has_role(auth.uid(),'receptionist'::app_role)
);

CREATE TRIGGER trg_coupons_updated BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  discount_amount numeric(14,2) NOT NULL,
  redeemed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coupon redemptions by privileged roles"
ON public.coupon_redemptions FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'accountant'::app_role)
  OR public.has_role(auth.uid(),'receptionist'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
  OR public.has_role(auth.uid(),'accountant'::app_role)
  OR public.has_role(auth.uid(),'receptionist'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id);

-- RPC: validate a coupon code and return effective discount for a given subtotal
CREATE OR REPLACE FUNCTION public.apply_coupon_code(_code text, _subtotal numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  disc numeric(14,2) := 0;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(_code);
  IF c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error','not_found'); END IF;
  IF NOT c.is_active THEN RETURN jsonb_build_object('ok', false, 'error','disabled'); END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > current_date THEN RETURN jsonb_build_object('ok', false, 'error','not_started'); END IF;
  IF c.ends_at IS NOT NULL AND c.ends_at < current_date THEN RETURN jsonb_build_object('ok', false, 'error','expired'); END IF;
  IF c.usage_limit IS NOT NULL AND c.usage_count >= c.usage_limit THEN RETURN jsonb_build_object('ok', false, 'error','limit_reached'); END IF;
  IF COALESCE(c.min_order_amount,0) > _subtotal THEN
    RETURN jsonb_build_object('ok', false, 'error','min_order', 'min', c.min_order_amount);
  END IF;

  IF c.discount_type = 'percent' THEN
    disc := round(_subtotal * c.discount_value / 100, 2);
  ELSE
    disc := c.discount_value;
  END IF;
  IF c.max_discount_amount IS NOT NULL AND disc > c.max_discount_amount THEN
    disc := c.max_discount_amount;
  END IF;
  IF disc > _subtotal THEN disc := _subtotal; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'discount_amount', disc
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_coupon_code(text, numeric) TO authenticated;
