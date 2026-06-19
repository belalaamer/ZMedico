
-- 1) Remove HR bypass from branch access helpers
CREATE OR REPLACE FUNCTION public.user_has_branch_access(_branch uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _branch IS NULL
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.staff_branches WHERE user_id = auth.uid() AND branch_id = _branch);
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_invoice(_invoice uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _invoice IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.invoices WHERE id = _invoice));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_medical_record(_rec uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _rec IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.medical_records WHERE id = _rec));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_patient(_patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _patient IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.patients WHERE id = _patient));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_prescription(_rx uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _rx IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.user_has_branch_access_via_medical_record((SELECT medical_record_id FROM public.prescriptions WHERE id = _rx));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_treasury(_treasury uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _treasury IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.treasury WHERE id = _treasury));
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_treatment_plan(_plan uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _plan IS NULL
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.user_has_branch_access((SELECT branch_id FROM public.treatment_plans WHERE id = _plan));
$$;

-- 2) Add RESTRICTIVE branch_isolation to coupons & coupon_redemptions
DROP POLICY IF EXISTS branch_isolation ON public.coupons;
CREATE POLICY branch_isolation ON public.coupons AS RESTRICTIVE TO authenticated
  USING (public.user_has_branch_access(branch_id))
  WITH CHECK (public.user_has_branch_access(branch_id));

DROP POLICY IF EXISTS branch_isolation ON public.coupon_redemptions;
CREATE POLICY branch_isolation ON public.coupon_redemptions AS RESTRICTIVE TO authenticated
  USING (public.user_has_branch_access(branch_id))
  WITH CHECK (public.user_has_branch_access(branch_id));

-- 3) Tighten treasury_daily_closes SELECT — restrict branch-scoped access to financial roles
DROP POLICY IF EXISTS tdc_select_scoped ON public.treasury_daily_closes;
CREATE POLICY tdc_select_scoped ON public.treasury_daily_closes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR (
      branch_id = public.current_user_branch_id()
      AND (
        public.has_role(auth.uid(), 'accountant'::public.app_role)
        OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      )
    )
  );
