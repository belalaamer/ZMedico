-- ZMED-294: close the tenant-branding stored-XSS surface and the cross-tenant listing gap
-- (ZMED-280 P-5 and S-3, the two top-priority items of that report).
--
-- Live Production state that this file changes, read 2026-10-22:
--   storage.buckets tenant-branding: public=true, file_size_limit=2097152,
--     allowed_mime_types = image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon
--   storage.objects policies for that bucket:
--     tenant_branding_assets_public_read            FOR SELECT TO anon, authenticated
--                                                    USING (bucket_id = 'tenant-branding')
--     tenant_branding_assets_system_owner_insert    WITH CHECK (bucket_id = ... AND has_role(...,'system_owner'))
--     tenant_branding_assets_system_owner_update    USING + WITH CHECK (same)
--   objects present: <tenant_uuid>/favicon-…png and <tenant_uuid>/logo-…png — BOTH image/png, single tenant
-- The 2-object mime measurement is the reason this file is safe to apply: no existing object is an SVG, so
-- removing image/svg+xml from the allowlist strands nothing and breaks no current render.
--
-- Why SVG on this bucket is the finding: an <svg> carrying <script>, served from
-- /storage/v1/object/public/tenant-branding/…, executes in the browser of anyone who opens that URL. The
-- bucket is public (so no policy is consulted on the serving path) and, before this file, anon-listable (so
-- an attacker only has to learn the bucket name to find the object key). Removing the anon read policy
-- removes the enumeration half; removing the mime removes the payload half. Applying only one of the two
-- leaves the other reachable.

-- 1. Re-declare the bucket with the mime set this product actually supports.
--    Same shape as 20260825200000_tenant_whitelabel_branding.sql (insert ... on conflict (id) do update),
--    with image/svg+xml dropped and image/x-icon + image/vnd.microsoft.icon added — the ICO entries are
--    already live in Production and only exist as dashboard state today, which is exactly the drift
--    ZMED-280 S-1 warned about. Everything else is written back as measured, so this statement changes one
--    value and version-controls the rest.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-branding',
  'tenant-branding',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']::text[];

-- 2. Take anon off the Storage-API read path for this bucket and scope the remaining read to the role that
--    already owns its write path.
--
--    Nothing in the product needs the anon policy. Branding reaches an unauthenticated visitor only through
--    get_public_tenant_branding(_hostname), which returns tenant_branding.logo_url / favicon_url — absolute
--    public-bucket URLs the browser fetches over /storage/v1/object/public/…, a path that is authorised by
--    buckets.public and never by a policy. A grep of src/ for this bucket shows upload() + getPublicUrl()
--    only (pages/platform/TenantBrandingDialog.tsx:106,110,133,137) and the RPC call
--    (contexts/TenantBrandingContext.tsx:64): no list(), no createdSignedUrl(), no authenticated download.
--    So dropping anon narrows the attack surface without touching a working code path.
--
--    Keeping SELECT for system_owner mirrors the insert/update pair above: the same role that may write a
--    tenant's branding may read it, and no other authenticated role may enumerate another tenant's objects.
DROP POLICY IF EXISTS tenant_branding_assets_public_read ON storage.objects;
DROP POLICY IF EXISTS tenant_branding_assets_owner_read ON storage.objects;
CREATE POLICY tenant_branding_assets_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND public.has_role(auth.uid(), 'system_owner'::public.app_role)
  );

-- 3. Post-write assertions, so a partial apply fails loudly instead of leaving the bucket public with no
--    policy review, or the old policy in place next to the new one.
DO $assertion$
DECLARE
  v_mimes text[];
  v_count integer;
BEGIN
  SELECT allowed_mime_types INTO v_mimes FROM storage.buckets WHERE id = 'tenant-branding';
  IF v_mimes IS NULL THEN
    RAISE EXCEPTION 'branding_bucket_missing';
  END IF;
  IF 'image/svg+xml' = ANY (v_mimes) THEN
    RAISE EXCEPTION 'branding_svg_still_allowed';
  END IF;
  IF NOT ('image/vnd.microsoft.icon' = ANY (v_mimes)) THEN
    RAISE EXCEPTION 'branding_ico_support_lost';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_policy
   WHERE polrelid = 'storage.objects'::regclass
     AND polname = 'tenant_branding_assets_public_read';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'branding_anon_read_policy_still_present';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_policy
   WHERE polrelid = 'storage.objects'::regclass
     AND polname = 'tenant_branding_assets_owner_read'
     AND polroles @> ARRAY[to_regrole('authenticated')::oid]
     AND NOT polroles @> ARRAY[to_regrole('anon')::oid]
     AND polpermissive;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'branding_owner_read_policy_missing';
  END IF;

  -- The public serving path must stay intact: this is what the tenant-branded booking page renders.
  IF NOT (SELECT public FROM storage.buckets WHERE id = 'tenant-branding') THEN
    RAISE EXCEPTION 'branding_bucket_no_longer_public';
  END IF;
END;
$assertion$;
