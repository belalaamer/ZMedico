-- Provide an English label for the existing default booking service.
-- The guarded update avoids changing clinics or services created by customers.
UPDATE public.services
SET name_en = 'Initial Assessment'
WHERE name_en = 'كشف'
  AND name_ar = 'كشف'
  AND tenant_id = (SELECT id FROM public.tenants WHERE slug = 'default' LIMIT 1);
