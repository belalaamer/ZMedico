
-- Target bonuses for staff
CREATE TABLE IF NOT EXISTS public.staff_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name_en text,
  name_ar text,
  metric_type text NOT NULL CHECK (metric_type IN ('revenue','appointments_completed','procedures_count','procedures_revenue','collections')),
  target_value numeric(14,2) NOT NULL CHECK (target_value > 0),
  bonus_type text NOT NULL DEFAULT 'fixed' CHECK (bonus_type IN ('fixed','percent_of_target','percent_of_actual')),
  bonus_value numeric(14,2) NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','missed','cancelled','paid')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_targets TO authenticated;
GRANT ALL ON public.staff_targets TO service_role;

ALTER TABLE public.staff_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR/manager full access on staff_targets"
ON public.staff_targets FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role)
);

CREATE POLICY "Staff can view own targets"
ON public.staff_targets FOR SELECT TO authenticated
USING (staff_id = auth.uid());

CREATE TRIGGER trg_staff_targets_updated
BEFORE UPDATE ON public.staff_targets
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_staff_targets_staff ON public.staff_targets(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_targets_period ON public.staff_targets(period_start, period_end);

-- RPC: compute actual achievement value for a target
CREATE OR REPLACE FUNCTION public.staff_target_actual(_target_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  v numeric := 0;
BEGIN
  SELECT * INTO t FROM public.staff_targets WHERE id = _target_id;
  IF t.id IS NULL THEN RETURN 0; END IF;

  IF t.metric_type = 'revenue' THEN
    SELECT COALESCE(SUM(i.total),0) INTO v
    FROM public.invoices i
    LEFT JOIN public.medical_records mr ON mr.id = i.medical_record_id
    WHERE i.deleted_at IS NULL
      AND i.invoice_date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR i.branch_id = t.branch_id)
      AND mr.doctor_id = t.staff_id;

  ELSIF t.metric_type = 'collections' THEN
    SELECT COALESCE(SUM(p.amount),0) INTO v
    FROM public.payments p
    WHERE p.deleted_at IS NULL
      AND p.payment_date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR p.branch_id = t.branch_id)
      AND p.received_by = t.staff_id;

  ELSIF t.metric_type = 'appointments_completed' THEN
    SELECT COUNT(*) INTO v
    FROM public.appointments a
    WHERE a.doctor_id = t.staff_id
      AND a.status = 'completed'
      AND a.scheduled_at::date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR a.branch_id = t.branch_id);

  ELSIF t.metric_type = 'procedures_count' THEN
    SELECT COALESCE(SUM(rp.quantity),0) INTO v
    FROM public.record_procedures rp
    JOIN public.medical_records mr ON mr.id = rp.medical_record_id
    WHERE COALESCE(rp.performed_by, mr.doctor_id) = t.staff_id
      AND rp.created_at::date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR mr.branch_id = t.branch_id);

  ELSIF t.metric_type = 'procedures_revenue' THEN
    SELECT COALESCE(SUM(COALESCE(pr.default_price,0) * COALESCE(rp.quantity,1)),0) INTO v
    FROM public.record_procedures rp
    JOIN public.procedures pr ON pr.id = rp.procedure_id
    JOIN public.medical_records mr ON mr.id = rp.medical_record_id
    WHERE COALESCE(rp.performed_by, mr.doctor_id) = t.staff_id
      AND rp.created_at::date BETWEEN t.period_start AND t.period_end
      AND (t.branch_id IS NULL OR mr.branch_id = t.branch_id);
  END IF;

  RETURN COALESCE(v,0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_target_actual(uuid) TO authenticated;
