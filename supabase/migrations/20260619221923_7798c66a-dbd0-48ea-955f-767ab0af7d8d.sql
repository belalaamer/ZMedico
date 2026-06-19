
-- 1) product-images: remove broad public listing + broad write policies.
-- Public reads continue to work via the /storage/v1/object/public/... URL
-- which bypasses RLS for public buckets. Listing/enumeration via the
-- Data API is now restricted to admins.
DROP POLICY IF EXISTS "Public can read product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete product images" ON storage.objects;

-- 2) patient_docs_read: include nurse/receptionist/manager to match the
-- table-level doc_select_scoped policy.
DROP POLICY IF EXISTS patient_docs_read ON storage.objects;
CREATE POLICY patient_docs_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-docs'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      (
        has_role(auth.uid(), 'doctor'::app_role)
        OR has_role(auth.uid(), 'staff'::app_role)
        OR has_role(auth.uid(), 'nurse'::app_role)
        OR has_role(auth.uid(), 'receptionist'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
      )
      AND storage_patient_docs_branch_allowed(name)
    )
  )
);

-- 3) realtime_topic_branch_allowed: switch to allowlist; deny unknown prefixes.
CREATE OR REPLACE FUNCTION public.realtime_topic_branch_allowed(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  parts text[];
  prefix text;
  maybe_branch text;
  branch uuid;
BEGIN
  IF _topic IS NULL OR length(_topic) = 0 THEN
    RETURN false;
  END IF;

  parts := string_to_array(_topic, ':');
  prefix := parts[1];

  -- Allowlist: only these prefixes are recognized. Anything else is denied
  -- so future Realtime topics cannot bypass branch isolation by accident.
  IF prefix NOT IN ('queue_alerts', 'queue_alerts_queue', 'audit_probe') THEN
    RETURN false;
  END IF;

  maybe_branch := parts[2];
  IF maybe_branch IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    branch := maybe_branch::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN public.user_has_branch_access(branch);
END;
$function$;
