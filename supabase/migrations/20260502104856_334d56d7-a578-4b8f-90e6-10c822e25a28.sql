-- Drop the overly broad public SELECT policy that allows listing files in the product-images bucket.
-- Public bucket files remain accessible via their public URLs without needing an RLS policy.
DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
DROP POLICY IF EXISTS "product-images public read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_public_select" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read on product-images" ON storage.objects;

-- Restrict listing/enumeration of objects in product-images to authenticated users only.
-- (Direct public URL access continues to work because the bucket is marked public.)
CREATE POLICY "product_images_authenticated_list"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'product-images');