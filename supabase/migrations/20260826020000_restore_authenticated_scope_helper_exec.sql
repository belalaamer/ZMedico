-- Restore EXECUTE for scope helpers that are called by authenticated RLS
-- policies. Keep the canonical branch helper as the only authorization source:
-- System Owner is global; clinic users require explicit branch membership.

CREATE OR REPLACE FUNCTION public.is_tenant_owner(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.tenants
      WHERE id = _tenant_id
        AND owner_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_invoice(_invoice uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _invoice IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id FROM public.invoices WHERE id = _invoice)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_medical_record(_rec uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _rec IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id FROM public.medical_records WHERE id = _rec)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_patient(_patient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _patient IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id FROM public.patients WHERE id = _patient)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_physio_case(_case uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _case IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id FROM public.physio_cases WHERE id = _case)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_prescription(_rx uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _rx IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id
       FROM public.medical_records mr
       JOIN public.prescriptions p ON p.medical_record_id = mr.id
       WHERE p.id = _rx)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_purchase_order(_po uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _po IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id FROM public.purchase_orders WHERE id = _po)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_treasury(_treasury uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _treasury IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id FROM public.treasury WHERE id = _treasury)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_branch_access_via_treatment_plan(_plan uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _plan IS NULL
    OR public.user_has_branch_access(
      (SELECT branch_id FROM public.treatment_plans WHERE id = _plan)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_tenant_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_medical_record(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_patient(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_physio_case(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_prescription(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_purchase_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_treasury(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_treatment_plan(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_medical_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_patient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_physio_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_prescription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_treasury(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_branch_access_via_treatment_plan(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_tenant_owner(uuid)
IS 'Tenant ownership scope helper; System Owner is global and tenant owners are limited to their own tenant.';
