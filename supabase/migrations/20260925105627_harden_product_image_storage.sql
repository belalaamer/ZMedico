-- Harden product image uploads.
--
-- Product images are intentionally public so inventory screens can render them
-- without signed URLs. Uploads/deletes remain authenticated and tenant-scoped.
-- The bucket was previously public but had no INSERT policy, so browser uploads
-- failed entirely. Server-side size/MIME limits now mirror the UI validation.

UPDATE storage.buckets
SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
WHERE id = 'product-images';

DROP POLICY IF EXISTS product_images_insert_tenant_scoped ON storage.objects;
CREATE POLICY product_images_insert_tenant_scoped
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    public.has_permission((SELECT auth.uid()), 'inventory.create')
    OR public.has_permission((SELECT auth.uid()), 'inventory.edit')
  )
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.user_has_tenant_access((split_part(name, '/', 1))::uuid)
);

DROP POLICY IF EXISTS product_images_delete_tenant_scoped ON storage.objects;
CREATE POLICY product_images_delete_tenant_scoped
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    public.has_permission((SELECT auth.uid()), 'inventory.edit')
    OR public.has_permission((SELECT auth.uid()), 'inventory.delete')
  )
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.user_has_tenant_access((split_part(name, '/', 1))::uuid)
);
