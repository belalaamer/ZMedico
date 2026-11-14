-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260925124740
-- name: product_image_legacy_owner_compat
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Transitional compatibility for the currently deployed product-image uploader.
--
-- main still uploads root-level names (<uuid>.<ext>). The new frontend writes
-- tenant-prefixed paths. Keep the legacy form owner-scoped so current production
-- works without opening tenant-wide delete/list access.

DROP POLICY IF EXISTS product_images_insert_legacy_owner ON storage.objects;
CREATE POLICY product_images_insert_legacy_owner
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND position('/' in name) = 0
  AND owner_id = (SELECT auth.uid()::text)
  AND (
    public.has_permission((SELECT auth.uid()), 'inventory.create')
    OR public.has_permission((SELECT auth.uid()), 'inventory.edit')
  )
);

DROP POLICY IF EXISTS product_images_delete_legacy_owner ON storage.objects;
CREATE POLICY product_images_delete_legacy_owner
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND position('/' in name) = 0
  AND owner_id = (SELECT auth.uid()::text)
  AND (
    public.has_permission((SELECT auth.uid()), 'inventory.edit')
    OR public.has_permission((SELECT auth.uid()), 'inventory.delete')
  )
);

