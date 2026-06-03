
-- 1) Add commission % to procedures
ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS doctor_commission_percent numeric(5,2) NOT NULL DEFAULT 0;

-- 2) Link invoices to medical_records so payments can map back to procedures
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS medical_record_id uuid REFERENCES public.medical_records(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_medical_record_id ON public.invoices(medical_record_id);

-- 3) Commission status enum
DO $$ BEGIN
  CREATE TYPE public.commission_status AS ENUM ('pending','partial','earned','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) doctor_commissions table
CREATE TABLE IF NOT EXISTS public.doctor_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  record_procedure_id uuid NOT NULL UNIQUE REFERENCES public.record_procedures(id) ON DELETE CASCADE,
  medical_record_id uuid NOT NULL REFERENCES public.medical_records(id) ON DELETE CASCADE,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  base_amount numeric(14,2) NOT NULL DEFAULT 0,
  commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  collected_amount numeric(14,2) NOT NULL DEFAULT 0,
  commission_amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.commission_status NOT NULL DEFAULT 'pending',
  payroll_id uuid REFERENCES public.payroll(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_commissions TO authenticated;
GRANT ALL ON public.doctor_commissions TO service_role;

ALTER TABLE public.doctor_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View commissions" ON public.doctor_commissions;
CREATE POLICY "View commissions" ON public.doctor_commissions
FOR SELECT TO authenticated
USING (doctor_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'hr'::app_role)
  OR public.has_role(auth.uid(),'manager'::app_role));

DROP POLICY IF EXISTS "Manage commissions" ON public.doctor_commissions;
CREATE POLICY "Manage commissions" ON public.doctor_commissions
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr'::app_role))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr'::app_role));

DROP TRIGGER IF EXISTS trg_doctor_commissions_updated_at ON public.doctor_commissions;
CREATE TRIGGER trg_doctor_commissions_updated_at
BEFORE UPDATE ON public.doctor_commissions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) Recalc commissions for an invoice based on paid ratio
CREATE OR REPLACE FUNCTION public.recalc_commissions_for_invoice(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  ratio numeric(10,6);
BEGIN
  IF _invoice_id IS NULL THEN RETURN; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF inv.id IS NULL OR inv.medical_record_id IS NULL THEN RETURN; END IF;
  ratio := CASE WHEN COALESCE(inv.total,0) > 0
                THEN LEAST(COALESCE(inv.paid_amount,0)/inv.total, 1)
                ELSE 0 END;
  UPDATE public.doctor_commissions dc
    SET collected_amount = round(dc.base_amount * ratio, 2),
        commission_amount = round(dc.base_amount * ratio * dc.commission_percent / 100, 2),
        status = CASE
          WHEN dc.status IN ('paid','cancelled') THEN dc.status
          WHEN ratio <= 0 THEN 'pending'::public.commission_status
          WHEN ratio >= 1 THEN 'earned'::public.commission_status
          ELSE 'partial'::public.commission_status
        END,
        updated_at = now()
    WHERE dc.medical_record_id = inv.medical_record_id
      AND dc.status NOT IN ('paid','cancelled');
END; $$;

-- 6) Update recalc_invoice_payments to also recalc commissions
CREATE OR REPLACE FUNCTION public.recalc_invoice_payments(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  paid numeric(14,2);
  inv record;
begin
  if _invoice_id is null then return; end if;
  select coalesce(sum(amount),0) into paid from public.payments where invoice_id = _invoice_id and deleted_at is null;
  select * into inv from public.invoices where id = _invoice_id;
  if inv.id is null then return; end if;
  update public.invoices
    set paid_amount = paid,
        status = (case
          when status = 'cancelled' then 'cancelled'
          when paid <= 0 then case when status = 'draft' then 'draft' else 'pending' end
          when paid >= inv.total then 'paid'
          else 'partial'
        end)::public.invoice_status
    where id = _invoice_id;
  perform public.recalc_commissions_for_invoice(_invoice_id);
end; $$;

-- 7) Trigger on record_procedures to upsert commissions
CREATE OR REPLACE FUNCTION public.tg_record_procedure_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mr RECORD;
  proc RECORD;
  doc uuid;
  base numeric(14,2);
  pct numeric(5,2);
  inv_rec RECORD;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.doctor_commissions
      WHERE record_procedure_id = OLD.id AND status NOT IN ('paid');
    RETURN OLD;
  END IF;

  SELECT * INTO mr FROM public.medical_records WHERE id = NEW.medical_record_id;
  SELECT * INTO proc FROM public.procedures WHERE id = NEW.procedure_id;
  doc := COALESCE(NEW.performed_by, mr.doctor_id);

  IF doc IS NULL OR proc.id IS NULL THEN
    DELETE FROM public.doctor_commissions
      WHERE record_procedure_id = NEW.id AND status NOT IN ('paid');
    RETURN NEW;
  END IF;

  base := COALESCE(proc.default_price,0) * COALESCE(NEW.quantity,1);
  pct  := COALESCE(proc.doctor_commission_percent, 0);

  INSERT INTO public.doctor_commissions(
    doctor_id, record_procedure_id, medical_record_id, procedure_id,
    branch_id, patient_id, base_amount, commission_percent, status
  ) VALUES (
    doc, NEW.id, NEW.medical_record_id, NEW.procedure_id,
    mr.branch_id, mr.patient_id, base, pct, 'pending'
  )
  ON CONFLICT (record_procedure_id) DO UPDATE
    SET doctor_id = EXCLUDED.doctor_id,
        base_amount = EXCLUDED.base_amount,
        commission_percent = EXCLUDED.commission_percent,
        procedure_id = EXCLUDED.procedure_id,
        branch_id = EXCLUDED.branch_id,
        patient_id = EXCLUDED.patient_id,
        updated_at = now()
    WHERE public.doctor_commissions.status NOT IN ('paid');

  FOR inv_rec IN SELECT id FROM public.invoices
    WHERE medical_record_id = NEW.medical_record_id AND deleted_at IS NULL
  LOOP
    PERFORM public.recalc_commissions_for_invoice(inv_rec.id);
  END LOOP;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_record_procedure_commission ON public.record_procedures;
CREATE TRIGGER trg_record_procedure_commission
AFTER INSERT OR UPDATE OR DELETE ON public.record_procedures
FOR EACH ROW EXECUTE FUNCTION public.tg_record_procedure_commission();

-- 8) After payroll insert: attach pending commissions as bonus
CREATE OR REPLACE FUNCTION public.tg_payroll_attach_commissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_comm numeric(14,2) := 0;
BEGIN
  SELECT COALESCE(SUM(commission_amount),0) INTO total_comm
  FROM public.doctor_commissions
  WHERE doctor_id = NEW.staff_id
    AND payroll_id IS NULL
    AND status IN ('earned','partial');

  IF total_comm > 0 THEN
    UPDATE public.doctor_commissions
      SET payroll_id = NEW.id, status = 'paid', paid_at = now(), updated_at = now()
      WHERE doctor_id = NEW.staff_id
        AND payroll_id IS NULL
        AND status IN ('earned','partial');

    INSERT INTO public.salary_adjustments(payroll_id, type, amount, reason_en, reason_ar, created_by)
    VALUES (NEW.id, 'bonus'::public.salary_adjustment_type, total_comm,
            'Doctor commissions from procedures',
            'عمولات الطبيب من الإجراءات', auth.uid());

    UPDATE public.payroll
      SET bonuses = COALESCE(bonuses,0) + total_comm,
          net_salary = COALESCE(base_salary,0) + COALESCE(overtime_amount,0)
                       + COALESCE(bonuses,0) + total_comm
                       - COALESCE(deductions,0) - COALESCE(leave_deductions,0)
      WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_payroll_attach_commissions ON public.payroll;
CREATE TRIGGER trg_payroll_attach_commissions
AFTER INSERT ON public.payroll
FOR EACH ROW EXECUTE FUNCTION public.tg_payroll_attach_commissions();

-- 9) Backfill existing record_procedures
INSERT INTO public.doctor_commissions(
  doctor_id, record_procedure_id, medical_record_id, procedure_id,
  branch_id, patient_id, base_amount, commission_percent, status
)
SELECT
  COALESCE(rp.performed_by, mr.doctor_id),
  rp.id, rp.medical_record_id, rp.procedure_id,
  mr.branch_id, mr.patient_id,
  COALESCE(p.default_price,0) * COALESCE(rp.quantity,1),
  COALESCE(p.doctor_commission_percent,0),
  'pending'::public.commission_status
FROM public.record_procedures rp
JOIN public.medical_records mr ON mr.id = rp.medical_record_id
LEFT JOIN public.procedures p ON p.id = rp.procedure_id
WHERE COALESCE(rp.performed_by, mr.doctor_id) IS NOT NULL
  AND p.id IS NOT NULL
ON CONFLICT (record_procedure_id) DO NOTHING;
