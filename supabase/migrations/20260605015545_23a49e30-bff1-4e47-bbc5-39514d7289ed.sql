-- Tighten RLS on treatment_plans and treatment_sessions
-- Doctors: only their own plans/sessions. Admin/manager/receptionist/accountant/nurse/hr: full read; staff: none.

DROP POLICY IF EXISTS "auth read treatment_plans" ON public.treatment_plans;
DROP POLICY IF EXISTS "auth insert treatment_plans" ON public.treatment_plans;
DROP POLICY IF EXISTS "auth update treatment_plans" ON public.treatment_plans;
DROP POLICY IF EXISTS "auth delete treatment_plans" ON public.treatment_plans;

CREATE POLICY "tp select" ON public.treatment_plans FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR public.has_role(auth.uid(), 'accountant'::app_role)
  OR public.has_role(auth.uid(), 'nurse'::app_role)
  OR (public.has_role(auth.uid(), 'doctor'::app_role) AND doctor_id = auth.uid())
);

CREATE POLICY "tp insert" ON public.treatment_plans FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR (public.has_role(auth.uid(), 'doctor'::app_role) AND (doctor_id IS NULL OR doctor_id = auth.uid()))
);

CREATE POLICY "tp update" ON public.treatment_plans FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR (public.has_role(auth.uid(), 'doctor'::app_role) AND doctor_id = auth.uid())
  OR (public.has_role(auth.uid(), 'nurse'::app_role))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR (public.has_role(auth.uid(), 'doctor'::app_role) AND (doctor_id IS NULL OR doctor_id = auth.uid()))
  OR public.has_role(auth.uid(), 'nurse'::app_role)
);

CREATE POLICY "tp delete" ON public.treatment_plans FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

DROP POLICY IF EXISTS "auth read treatment_sessions" ON public.treatment_sessions;
DROP POLICY IF EXISTS "auth insert treatment_sessions" ON public.treatment_sessions;
DROP POLICY IF EXISTS "auth update treatment_sessions" ON public.treatment_sessions;
DROP POLICY IF EXISTS "auth delete treatment_sessions" ON public.treatment_sessions;

CREATE POLICY "ts select" ON public.treatment_sessions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR public.has_role(auth.uid(), 'accountant'::app_role)
  OR public.has_role(auth.uid(), 'nurse'::app_role)
  OR (
    public.has_role(auth.uid(), 'doctor'::app_role)
    AND EXISTS (SELECT 1 FROM public.treatment_plans tp WHERE tp.id = treatment_sessions.treatment_plan_id AND tp.doctor_id = auth.uid())
  )
);

CREATE POLICY "ts insert" ON public.treatment_sessions FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR (
    public.has_role(auth.uid(), 'doctor'::app_role)
    AND EXISTS (SELECT 1 FROM public.treatment_plans tp WHERE tp.id = treatment_sessions.treatment_plan_id AND tp.doctor_id = auth.uid())
  )
);

CREATE POLICY "ts update" ON public.treatment_sessions FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR public.has_role(auth.uid(), 'nurse'::app_role)
  OR (
    public.has_role(auth.uid(), 'doctor'::app_role)
    AND EXISTS (SELECT 1 FROM public.treatment_plans tp WHERE tp.id = treatment_sessions.treatment_plan_id AND tp.doctor_id = auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR public.has_role(auth.uid(), 'nurse'::app_role)
  OR (
    public.has_role(auth.uid(), 'doctor'::app_role)
    AND EXISTS (SELECT 1 FROM public.treatment_plans tp WHERE tp.id = treatment_sessions.treatment_plan_id AND tp.doctor_id = auth.uid())
  )
);

CREATE POLICY "ts delete" ON public.treatment_sessions FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);