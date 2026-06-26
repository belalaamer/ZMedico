
DO $$ BEGIN
  CREATE TYPE public.physio_case_status AS ENUM ('active','paused','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.physio_attendance AS ENUM ('scheduled','done','missed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.physio_trend AS ENUM ('improving','unchanged','worsening');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cases
CREATE TABLE IF NOT EXISTS public.physio_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  therapist_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  diagnosis text,
  treatment_goal text,
  treatment_plan text,
  start_date date NOT NULL DEFAULT current_date,
  expected_sessions int NOT NULL DEFAULT 0,
  status public.physio_case_status NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_physio_cases_patient ON public.physio_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_physio_cases_branch ON public.physio_cases(branch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.physio_cases TO authenticated;
GRANT ALL ON public.physio_cases TO service_role;
ALTER TABLE public.physio_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physio_cases_select" ON public.physio_cases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_branch_access(branch_id));
CREATE POLICY "physio_cases_insert" ON public.physio_cases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_branch_access(branch_id));
CREATE POLICY "physio_cases_update" ON public.physio_cases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_branch_access(branch_id))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_branch_access(branch_id));
CREATE POLICY "physio_cases_delete" ON public.physio_cases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.user_has_branch_access(branch_id));

CREATE TRIGGER trg_physio_cases_updated BEFORE UPDATE ON public.physio_cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Helper for child tables
CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_physio_case(_case uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _case IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.physio_cases WHERE id = _case));
$$;

-- Sessions
CREATE TABLE IF NOT EXISTS public.physio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.physio_cases(id) ON DELETE CASCADE,
  session_number int NOT NULL DEFAULT 1,
  session_date date NOT NULL DEFAULT current_date,
  therapist_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  attendance public.physio_attendance NOT NULL DEFAULT 'scheduled',
  pain_level int CHECK (pain_level IS NULL OR (pain_level BETWEEN 0 AND 10)),
  pain_note text,
  interventions text,
  progress_note text,
  symptom_change text,
  mobility_note text,
  strength_note text,
  adherence text,
  home_exercise text,
  therapist_assessment text,
  next_recommendation text,
  next_review_plan text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_physio_sessions_case ON public.physio_sessions(case_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.physio_sessions TO authenticated;
GRANT ALL ON public.physio_sessions TO service_role;
ALTER TABLE public.physio_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physio_sessions_select" ON public.physio_sessions FOR SELECT TO authenticated
  USING (public.user_has_branch_access_via_physio_case(case_id));
CREATE POLICY "physio_sessions_insert" ON public.physio_sessions FOR INSERT TO authenticated
  WITH CHECK (public.user_has_branch_access_via_physio_case(case_id));
CREATE POLICY "physio_sessions_update" ON public.physio_sessions FOR UPDATE TO authenticated
  USING (public.user_has_branch_access_via_physio_case(case_id))
  WITH CHECK (public.user_has_branch_access_via_physio_case(case_id));
CREATE POLICY "physio_sessions_delete" ON public.physio_sessions FOR DELETE TO authenticated
  USING (public.user_has_branch_access_via_physio_case(case_id));

CREATE TRIGGER trg_physio_sessions_updated BEFORE UPDATE ON public.physio_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Reassessments
CREATE TABLE IF NOT EXISTS public.physio_reassessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.physio_cases(id) ON DELETE CASCADE,
  therapist_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  assessment_date date NOT NULL DEFAULT current_date,
  initial_condition text,
  current_condition text,
  trend public.physio_trend NOT NULL DEFAULT 'unchanged',
  plan_update text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_physio_reassessments_case ON public.physio_reassessments(case_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.physio_reassessments TO authenticated;
GRANT ALL ON public.physio_reassessments TO service_role;
ALTER TABLE public.physio_reassessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physio_reassessments_select" ON public.physio_reassessments FOR SELECT TO authenticated
  USING (public.user_has_branch_access_via_physio_case(case_id));
CREATE POLICY "physio_reassessments_insert" ON public.physio_reassessments FOR INSERT TO authenticated
  WITH CHECK (public.user_has_branch_access_via_physio_case(case_id));
CREATE POLICY "physio_reassessments_update" ON public.physio_reassessments FOR UPDATE TO authenticated
  USING (public.user_has_branch_access_via_physio_case(case_id))
  WITH CHECK (public.user_has_branch_access_via_physio_case(case_id));
CREATE POLICY "physio_reassessments_delete" ON public.physio_reassessments FOR DELETE TO authenticated
  USING (public.user_has_branch_access_via_physio_case(case_id));

CREATE TRIGGER trg_physio_reassessments_updated BEFORE UPDATE ON public.physio_reassessments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
