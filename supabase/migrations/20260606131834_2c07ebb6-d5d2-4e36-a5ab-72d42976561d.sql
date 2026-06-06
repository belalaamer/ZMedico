CREATE OR REPLACE FUNCTION public.tg_coupon_redemption_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.coupons
    SET usage_count = COALESCE(usage_count, 0) + 1,
        updated_at = now()
    WHERE id = NEW.coupon_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS coupon_redemption_increment ON public.coupon_redemptions;
CREATE TRIGGER coupon_redemption_increment
AFTER INSERT ON public.coupon_redemptions
FOR EACH ROW EXECUTE FUNCTION public.tg_coupon_redemption_after_insert();