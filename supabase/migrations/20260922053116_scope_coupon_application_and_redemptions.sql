CREATE OR REPLACE FUNCTION public.apply_coupon_code(
  _code text,
  _subtotal numeric,
  _branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.coupons%ROWTYPE;
  disc numeric(14,2) := 0;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.has_permission(v_actor, 'invoices.coupon.apply') THEN
    RAISE EXCEPTION 'Forbidden: missing permission invoices.coupon.apply'
      USING ERRCODE = '42501';
  END IF;

  IF _branch_id IS NULL OR NOT public.user_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Forbidden: coupon branch is outside caller scope'
      USING ERRCODE = '42501';
  END IF;

  IF _subtotal IS NULL OR _subtotal < 0 THEN
    RAISE EXCEPTION 'subtotal must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c
  FROM public.coupons
  WHERE upper(code) = upper(_code)
    AND branch_id = _branch_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT c.is_active THEN RETURN jsonb_build_object('ok', false, 'error', 'disabled'); END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > current_date THEN RETURN jsonb_build_object('ok', false, 'error', 'not_started'); END IF;
  IF c.ends_at IS NOT NULL AND c.ends_at < current_date THEN RETURN jsonb_build_object('ok', false, 'error', 'expired'); END IF;
  IF c.usage_limit IS NOT NULL AND c.usage_count >= c.usage_limit THEN RETURN jsonb_build_object('ok', false, 'error', 'limit_reached'); END IF;
  IF COALESCE(c.min_order_amount, 0) > _subtotal THEN
    RETURN jsonb_build_object('ok', false, 'error', 'min_order', 'min', c.min_order_amount);
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
$function$;

REVOKE ALL ON FUNCTION public.apply_coupon_code(text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_coupon_code(text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_coupon_code(text, numeric, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_coupon_redemption_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_branch uuid;
  v_invoice_patient uuid;
  v_coupon_branch uuid;
  v_usage_limit integer;
  v_usage_count integer;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RAISE EXCEPTION 'coupon redemption requires invoice_id'
      USING ERRCODE = '23514';
  END IF;

  SELECT branch_id, patient_id
  INTO v_invoice_branch, v_invoice_patient
  FROM public.invoices
  WHERE id = NEW.invoice_id
    AND deleted_at IS NULL;

  IF NOT FOUND OR v_invoice_branch IS NULL THEN
    RAISE EXCEPTION 'coupon redemption invoice not found'
      USING ERRCODE = '23503';
  END IF;

  SELECT branch_id, usage_limit, usage_count
  INTO v_coupon_branch, v_usage_limit, v_usage_count
  FROM public.coupons
  WHERE id = NEW.coupon_id
  FOR UPDATE;

  IF NOT FOUND OR v_coupon_branch IS NULL THEN
    RAISE EXCEPTION 'coupon not found or has no branch'
      USING ERRCODE = '23503';
  END IF;

  IF v_coupon_branch IS DISTINCT FROM v_invoice_branch THEN
    RAISE EXCEPTION 'coupon and invoice belong to different branches'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.branch_id IS NULL THEN
    NEW.branch_id := v_invoice_branch;
  ELSIF NEW.branch_id IS DISTINCT FROM v_invoice_branch THEN
    RAISE EXCEPTION 'redemption and invoice branches do not match'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.patient_id IS NULL THEN
    NEW.patient_id := v_invoice_patient;
  ELSIF NEW.patient_id IS DISTINCT FROM v_invoice_patient THEN
    RAISE EXCEPTION 'redemption patient does not match invoice patient'
      USING ERRCODE = '23514';
  END IF;

  IF v_usage_limit IS NOT NULL AND COALESCE(v_usage_count, 0) >= v_usage_limit THEN
    RAISE EXCEPTION 'coupon usage limit reached'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS coupon_redemption_scope_guard ON public.coupon_redemptions;
CREATE TRIGGER coupon_redemption_scope_guard
BEFORE INSERT ON public.coupon_redemptions
FOR EACH ROW
EXECUTE FUNCTION public.tg_coupon_redemption_before_insert();

REVOKE ALL ON FUNCTION public.tg_coupon_redemption_before_insert() FROM PUBLIC, anon, authenticated;
