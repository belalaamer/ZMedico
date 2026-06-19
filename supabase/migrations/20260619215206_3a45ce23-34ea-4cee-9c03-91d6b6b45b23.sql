-- Explicit public SELECT policy for product-images bucket (intentional: product images are public marketing assets)
DROP POLICY IF EXISTS "Public can read product images" ON storage.objects;
CREATE POLICY "Public can read product images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

-- Restrict writes to authenticated users only
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
CREATE POLICY "Authenticated can upload product images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated can update product images" ON storage.objects;
CREATE POLICY "Authenticated can update product images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images')
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated can delete product images" ON storage.objects;
CREATE POLICY "Authenticated can delete product images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');