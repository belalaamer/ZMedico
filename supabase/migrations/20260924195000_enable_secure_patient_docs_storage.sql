-- Enable the previously unusable patient-docs browser flow with server-side limits.

-- Secure the private patient-docs bucket for browser upload/download.
-- Object names use: <patient_uuid>/<timestamp>-<safe_filename>
UPDATE storage.buckets
SET public = false,
    file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf','application/dicom'
    ]::text[]
WHERE id = 'patient-docs';

DROP POLICY IF EXISTS patient_docs_storage_select ON storage.objects;
DROP POLICY IF EXISTS patient_docs_storage_insert ON storage.objects;
DROP POLICY IF EXISTS patient_docs_storage_update ON storage.objects;
DROP POLICY IF EXISTS patient_docs_storage_delete ON storage.objects;

CREATE POLICY patient_docs_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-docs'
  AND (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'medical_records.view')
  )
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = CASE
      WHEN split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN split_part(storage.objects.name, '/', 1)::uuid
      ELSE NULL
    END
      AND p.deleted_at IS NULL
      AND (
        public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
        OR public.user_has_branch_access(p.branch_id)
      )
  )
);

CREATE POLICY patient_docs_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'patient-docs'
  AND (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'medical_records.create')
  )
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = CASE
      WHEN split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN split_part(storage.objects.name, '/', 1)::uuid
      ELSE NULL
    END
      AND p.deleted_at IS NULL
      AND (
        public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
        OR public.user_has_branch_access(p.branch_id)
      )
  )
);

CREATE POLICY patient_docs_storage_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'patient-docs'
  AND (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
  )
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = CASE
      WHEN split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN split_part(storage.objects.name, '/', 1)::uuid
      ELSE NULL
    END
      AND p.deleted_at IS NULL
      AND (
        public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
        OR public.user_has_branch_access(p.branch_id)
      )
  )
)
WITH CHECK (
  bucket_id = 'patient-docs'
  AND (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'medical_records.edit')
  )
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = CASE
      WHEN split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN split_part(storage.objects.name, '/', 1)::uuid
      ELSE NULL
    END
      AND p.deleted_at IS NULL
      AND (
        public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
        OR public.user_has_branch_access(p.branch_id)
      )
  )
);

CREATE POLICY patient_docs_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'patient-docs'
  AND (
    public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
    OR public.has_permission((SELECT auth.uid()), 'medical_records.delete')
  )
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = CASE
      WHEN split_part(storage.objects.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN split_part(storage.objects.name, '/', 1)::uuid
      ELSE NULL
    END
      AND p.deleted_at IS NULL
      AND (
        public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
        OR public.user_has_branch_access(p.branch_id)
      )
  )
);
