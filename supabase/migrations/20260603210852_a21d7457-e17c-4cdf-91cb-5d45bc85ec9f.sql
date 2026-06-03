
-- 1) Assigned doctor on patients
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS assigned_doctor_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patients_assigned_doctor ON public.patients(assigned_doctor_id);

-- 2) Treatment plans
CREATE TABLE IF NOT EXISTS public.treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name_ar text,
  name_en text,
  total_sessions integer NOT NULL DEFAULT 1 CHECK (total_sessions > 0),
  price numeric(14,2) NOT NULL DEFAULT 0,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  start_date date NOT NULL DEFAULT current_date,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','paused')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plans TO authenticated;
GRANT ALL ON public.treatment_plans TO service_role;
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read treatment_plans" ON public.treatment_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert treatment_plans" ON public.treatment_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update treatment_plans" ON public.treatment_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete treatment_plans" ON public.treatment_plans FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_tp_patient ON public.treatment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_tp_doctor ON public.treatment_plans(doctor_id);
CREATE INDEX IF NOT EXISTS idx_tp_branch ON public.treatment_plans(branch_id);
CREATE TRIGGER trg_tp_updated_at BEFORE UPDATE ON public.treatment_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Treatment sessions
CREATE TABLE IF NOT EXISTS public.treatment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id uuid NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  session_number integer NOT NULL,
  scheduled_date date,
  performed_at timestamptz,
  doctor_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','missed','cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_sessions TO authenticated;
GRANT ALL ON public.treatment_sessions TO service_role;
ALTER TABLE public.treatment_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read treatment_sessions" ON public.treatment_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert treatment_sessions" ON public.treatment_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update treatment_sessions" ON public.treatment_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete treatment_sessions" ON public.treatment_sessions FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_ts_plan ON public.treatment_sessions(treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_ts_doctor ON public.treatment_sessions(doctor_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ts_plan_number ON public.treatment_sessions(treatment_plan_id, session_number);
CREATE TRIGGER trg_ts_updated_at BEFORE UPDATE ON public.treatment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Auto-complete treatment_plan when all sessions completed
CREATE OR REPLACE FUNCTION public.tg_treatment_session_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  plan_id uuid;
  total int;
  done int;
BEGIN
  plan_id := COALESCE(NEW.treatment_plan_id, OLD.treatment_plan_id);
  SELECT total_sessions INTO total FROM public.treatment_plans WHERE id = plan_id;
  SELECT count(*) INTO done FROM public.treatment_sessions
    WHERE treatment_plan_id = plan_id AND status = 'completed';
  IF total IS NOT NULL THEN
    IF done >= total THEN
      UPDATE public.treatment_plans
        SET status = CASE WHEN status IN ('cancelled') THEN status ELSE 'completed' END,
            end_date = COALESCE(end_date, current_date),
            updated_at = now()
        WHERE id = plan_id AND status <> 'cancelled';
    ELSE
      UPDATE public.treatment_plans
        SET status = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
            updated_at = now()
        WHERE id = plan_id AND status = 'completed';
    END IF;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_ts_after_change ON public.treatment_sessions;
CREATE TRIGGER trg_ts_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.treatment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_treatment_session_after_change();
