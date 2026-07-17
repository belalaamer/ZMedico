
DROP POLICY IF EXISTS aep_select_branch_access ON public.audit_export_presets;
CREATE POLICY aep_select_branch_access ON public.audit_export_presets
FOR SELECT TO authenticated
USING (
  user_has_branch_access(branch_id)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS patient_docs_insert ON storage.objects;
CREATE POLICY patient_docs_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'patient-docs'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      (
        has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'doctor'::app_role)
        OR has_role(auth.uid(), 'nurse'::app_role)
        OR has_role(auth.uid(), 'receptionist'::app_role)
      )
      AND storage_patient_docs_branch_allowed(name)
    )
  )
);
