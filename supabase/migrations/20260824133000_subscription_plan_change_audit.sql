CREATE TABLE IF NOT EXISTS public.subscription_plan_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL DEFAULT 'update',
  before_values jsonb NOT NULL,
  after_values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_plan_change_log_plan_created_idx
  ON public.subscription_plan_change_log(plan_id, created_at DESC);

ALTER TABLE public.subscription_plan_change_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_plan_change_log FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS subscription_plan_change_log_select_system_owner ON public.subscription_plan_change_log;
CREATE POLICY subscription_plan_change_log_select_system_owner
  ON public.subscription_plan_change_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role));
GRANT SELECT ON public.subscription_plan_change_log TO authenticated;

CREATE OR REPLACE FUNCTION public._subscription_plan_change_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscription_plan_change_log (plan_id, actor_id, before_values, after_values)
  VALUES (
    OLD.id,
    auth.uid(),
    jsonb_build_object(
      'name_ar', OLD.name_ar,
      'name_en', OLD.name_en,
      'price_monthly', OLD.price_monthly,
      'price_yearly', OLD.price_yearly,
      'currency', OLD.currency,
      'max_branches', OLD.max_branches,
      'max_staff', OLD.max_staff,
      'max_patients', OLD.max_patients,
      'max_invoices_monthly', OLD.max_invoices_monthly,
      'features', OLD.features,
      'is_popular', OLD.is_popular,
      'is_active', OLD.is_active,
      'display_order', OLD.display_order
    ),
    jsonb_build_object(
      'name_ar', NEW.name_ar,
      'name_en', NEW.name_en,
      'price_monthly', NEW.price_monthly,
      'price_yearly', NEW.price_yearly,
      'currency', NEW.currency,
      'max_branches', NEW.max_branches,
      'max_staff', NEW.max_staff,
      'max_patients', NEW.max_patients,
      'max_invoices_monthly', NEW.max_invoices_monthly,
      'features', NEW.features,
      'is_popular', NEW.is_popular,
      'is_active', NEW.is_active,
      'display_order', NEW.display_order
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_plan_change_audit ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plan_change_audit
  AFTER UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public._subscription_plan_change_audit();
