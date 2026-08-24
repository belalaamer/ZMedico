-- Enforce subscription plan limits at the database boundary.
CREATE OR REPLACE FUNCTION public.enforce_tenant_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_limit integer;
  v_count integer;
  v_month_start date;
BEGIN
  IF TG_TABLE_NAME = 'branches' THEN
    v_tenant_id := NEW.tenant_id;
    SELECT sp.max_branches INTO v_limit
    FROM public.tenants t LEFT JOIN public.subscription_plans sp ON sp.id = t.plan_id
    WHERE t.id = v_tenant_id;
    IF v_limit IS NOT NULL THEN
      SELECT count(*)::integer INTO v_count FROM public.branches WHERE tenant_id = v_tenant_id AND is_active = true;
      IF v_count >= v_limit THEN RAISE EXCEPTION 'plan_limit_branches_reached'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'staff_profiles' THEN
    SELECT b.tenant_id INTO v_tenant_id FROM public.branches b WHERE b.id = NEW.branch_id;
    IF v_tenant_id IS NOT NULL THEN
      SELECT sp.max_staff INTO v_limit FROM public.tenants t LEFT JOIN public.subscription_plans sp ON sp.id = t.plan_id WHERE t.id = v_tenant_id;
      IF v_limit IS NOT NULL THEN
        SELECT count(DISTINCT staff_id)::integer INTO v_count
        FROM (
          SELECT s.id AS staff_id FROM public.staff_profiles s WHERE s.branch_id IN (SELECT id FROM public.branches WHERE tenant_id = v_tenant_id)
          UNION
          SELECT sb.user_id FROM public.staff_branches sb JOIN public.branches b2 ON b2.id = sb.branch_id WHERE b2.tenant_id = v_tenant_id
        ) scoped_staff;
        IF v_count >= v_limit THEN RAISE EXCEPTION 'plan_limit_staff_reached'; END IF;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'patients' THEN
    SELECT b.tenant_id INTO v_tenant_id FROM public.branches b WHERE b.id = NEW.branch_id;
    IF v_tenant_id IS NOT NULL THEN
      SELECT sp.max_patients INTO v_limit FROM public.tenants t LEFT JOIN public.subscription_plans sp ON sp.id = t.plan_id WHERE t.id = v_tenant_id;
      IF v_limit IS NOT NULL THEN
        SELECT count(*)::integer INTO v_count FROM public.patients p JOIN public.branches b ON b.id = p.branch_id WHERE b.tenant_id = v_tenant_id AND p.deleted_at IS NULL;
        IF v_count >= v_limit THEN RAISE EXCEPTION 'plan_limit_patients_reached'; END IF;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    SELECT b.tenant_id INTO v_tenant_id FROM public.branches b WHERE b.id = NEW.branch_id;
    IF v_tenant_id IS NOT NULL THEN
      SELECT sp.max_invoices_monthly INTO v_limit FROM public.tenants t LEFT JOIN public.subscription_plans sp ON sp.id = t.plan_id WHERE t.id = v_tenant_id;
      IF v_limit IS NOT NULL THEN
        v_month_start := date_trunc('month', COALESCE(NEW.invoice_date, CURRENT_DATE))::date;
        SELECT count(*)::integer INTO v_count FROM public.invoices i JOIN public.branches b ON b.id = i.branch_id WHERE b.tenant_id = v_tenant_id AND i.invoice_date >= v_month_start AND i.invoice_date < (v_month_start + interval '1 month')::date;
        IF v_count >= v_limit THEN RAISE EXCEPTION 'plan_limit_monthly_invoices_reached'; END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_limit_branches ON public.branches;
CREATE TRIGGER trg_plan_limit_branches BEFORE INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_plan_limits();
DROP TRIGGER IF EXISTS trg_plan_limit_staff ON public.staff_profiles;
CREATE TRIGGER trg_plan_limit_staff BEFORE INSERT ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_plan_limits();
DROP TRIGGER IF EXISTS trg_plan_limit_patients ON public.patients;
CREATE TRIGGER trg_plan_limit_patients BEFORE INSERT ON public.patients FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_plan_limits();
DROP TRIGGER IF EXISTS trg_plan_limit_invoices ON public.invoices;
CREATE TRIGGER trg_plan_limit_invoices BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_plan_limits();
REVOKE ALL ON FUNCTION public.enforce_tenant_plan_limits() FROM PUBLIC;
