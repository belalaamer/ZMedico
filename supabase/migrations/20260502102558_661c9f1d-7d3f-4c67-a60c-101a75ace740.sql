-- 1. staff_profiles: prevent self-escalation via trigger guarding sensitive columns
CREATE OR REPLACE FUNCTION public.tg_staff_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.position_id IS DISTINCT FROM OLD.position_id
       OR NEW.department_id IS DISTINCT FROM OLD.department_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.hire_date IS DISTINCT FROM OLD.hire_date
       OR NEW.contract_type IS DISTINCT FROM OLD.contract_type
       OR NEW.contract_end_date IS DISTINCT FROM OLD.contract_end_date
       OR NEW.salary IS DISTINCT FROM OLD.salary
       OR NEW.salary_currency IS DISTINCT FROM OLD.salary_currency
       OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
       OR NEW.bank_account IS DISTINCT FROM OLD.bank_account
       OR NEW.working_hours_per_week IS DISTINCT FROM OLD.working_hours_per_week
       OR NEW.annual_leave_balance IS DISTINCT FROM OLD.annual_leave_balance
       OR NEW.sick_leave_balance IS DISTINCT FROM OLD.sick_leave_balance
       OR NEW.national_id IS DISTINCT FROM OLD.national_id
       OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.termination_date IS DISTINCT FROM OLD.termination_date
       OR NEW.termination_reason IS DISTINCT FROM OLD.termination_reason
    THEN
      RAISE EXCEPTION 'Forbidden: only HR/admin may modify employment, salary, or identity fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_self_update_guard ON public.staff_profiles;
CREATE TRIGGER staff_self_update_guard
BEFORE UPDATE ON public.staff_profiles
FOR EACH ROW
EXECUTE FUNCTION public.tg_staff_self_update_guard();

DROP POLICY IF EXISTS staff_update_self ON public.staff_profiles;
CREATE POLICY staff_update_self ON public.staff_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. performance_reviews: restrict self update to staff_comments only via trigger
CREATE OR REPLACE FUNCTION public.tg_perf_review_self_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.staff_id = auth.uid() THEN
    IF NEW.staff_id IS DISTINCT FROM OLD.staff_id
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
       OR NEW.review_period_start IS DISTINCT FROM OLD.review_period_start
       OR NEW.review_period_end IS DISTINCT FROM OLD.review_period_end
       OR NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.strengths_ar IS DISTINCT FROM OLD.strengths_ar
       OR NEW.strengths_en IS DISTINCT FROM OLD.strengths_en
       OR NEW.areas_for_improvement_ar IS DISTINCT FROM OLD.areas_for_improvement_ar
       OR NEW.areas_for_improvement_en IS DISTINCT FROM OLD.areas_for_improvement_en
       OR NEW.goals_ar IS DISTINCT FROM OLD.goals_ar
       OR NEW.goals_en IS DISTINCT FROM OLD.goals_en
       OR NEW.reviewer_comments IS DISTINCT FROM OLD.reviewer_comments
    THEN
      RAISE EXCEPTION 'Forbidden: staff may only update their own staff_comments on a performance review';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perf_review_self_guard ON public.performance_reviews;
CREATE TRIGGER perf_review_self_guard
BEFORE UPDATE ON public.performance_reviews
FOR EACH ROW
EXECUTE FUNCTION public.tg_perf_review_self_guard();

DROP POLICY IF EXISTS pr_self_comment ON public.performance_reviews;
CREATE POLICY pr_self_comment ON public.performance_reviews
  FOR UPDATE TO authenticated
  USING (staff_id = auth.uid())
  WITH CHECK (staff_id = auth.uid());

-- 3. stock_alerts: restrict INSERT/UPDATE to admin
DROP POLICY IF EXISTS alerts_insert ON public.stock_alerts;
CREATE POLICY alerts_insert ON public.stock_alerts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS alerts_update ON public.stock_alerts;
CREATE POLICY alerts_update ON public.stock_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. saved_reports: enforce ownership on insert
DROP POLICY IF EXISTS sr_insert ON public.saved_reports;
CREATE POLICY sr_insert ON public.saved_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 5. patient_docs storage policies: drop fragile substring matching, restrict to clinical roles
DROP POLICY IF EXISTS patient_docs_read ON storage.objects;
CREATE POLICY patient_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'doctor'::app_role)
      OR public.has_role(auth.uid(), 'staff'::app_role)
    )
  );

DROP POLICY IF EXISTS patient_docs_update ON storage.objects;
CREATE POLICY patient_docs_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR owner = auth.uid())
  );

DROP POLICY IF EXISTS patient_docs_delete ON storage.objects;
CREATE POLICY patient_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR owner = auth.uid())
  );