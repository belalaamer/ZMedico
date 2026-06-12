
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access(uuid)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_patient(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_invoice(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_medical_record(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_treatment_plan(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_prescription(uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access_via_treasury(uuid)       FROM PUBLIC, anon;
