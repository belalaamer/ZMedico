-- 1) clinic_profile: restrict direct SELECT to admin/manager
DROP POLICY IF EXISTS cp_select ON public.clinic_profile;
CREATE POLICY cp_select_admin_manager ON public.clinic_profile
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

-- Helper so any signed-in user can still fetch the clinic logo (used on invoices)
CREATE OR REPLACE FUNCTION public.get_clinic_logo(_branch_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT logo_url
  FROM public.clinic_profile
  WHERE (_branch_id IS NULL OR branch_id = _branch_id)
  ORDER BY (branch_id = _branch_id) DESC NULLS LAST, created_at ASC
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_clinic_logo(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_clinic_logo(uuid) TO authenticated, service_role;

-- 2) branches: scope SELECT to assigned branches (admin/hr keep global via has_role inside user_has_branch_access)
DROP POLICY IF EXISTS branches_select_auth ON public.branches;
CREATE POLICY branches_select_scoped ON public.branches
  FOR SELECT TO authenticated
  USING (public.user_has_branch_access(id));

-- 3) patient-docs storage: require branch access on the patient that owns the path
CREATE OR REPLACE FUNCTION public.storage_patient_docs_branch_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_seg text;
  pid uuid;
BEGIN
  IF _name IS NULL OR length(_name) = 0 THEN RETURN false; END IF;
  first_seg := split_part(_name, '/', 1);
  BEGIN
    pid := first_seg::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN public.user_has_branch_access_via_patient(pid);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.storage_patient_docs_branch_allowed(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.storage_patient_docs_branch_allowed(text) TO authenticated, service_role;

DROP POLICY IF EXISTS patient_docs_read   ON storage.objects;
DROP POLICY IF EXISTS patient_docs_update ON storage.objects;
DROP POLICY IF EXISTS patient_docs_delete ON storage.objects;
DROP POLICY IF EXISTS patient_docs_insert ON storage.objects;

CREATE POLICY patient_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (public.has_role(auth.uid(),'admin'::public.app_role)
         OR ((public.has_role(auth.uid(),'doctor'::public.app_role)
              OR public.has_role(auth.uid(),'staff'::public.app_role))
             AND public.storage_patient_docs_branch_allowed(name)))
  );

CREATE POLICY patient_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-docs'
    AND (public.has_role(auth.uid(),'admin'::public.app_role)
         OR public.storage_patient_docs_branch_allowed(name))
  );

CREATE POLICY patient_docs_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (public.has_role(auth.uid(),'admin'::public.app_role)
         OR (owner = auth.uid() AND public.storage_patient_docs_branch_allowed(name)))
  );

CREATE POLICY patient_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'patient-docs'
    AND (public.has_role(auth.uid(),'admin'::public.app_role)
         OR (owner = auth.uid() AND public.storage_patient_docs_branch_allowed(name)))
  );

-- 4) allowed_signup_emails: explicit service-role-only SELECT (signup validation runs via SECURITY DEFINER which bypasses RLS).
DROP POLICY IF EXISTS allowed_signup_emails_select_none ON public.allowed_signup_emails;
CREATE POLICY allowed_signup_emails_select_none ON public.allowed_signup_emails
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));