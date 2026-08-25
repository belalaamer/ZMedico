ALTER TABLE public.tenant_branding
  ADD COLUMN IF NOT EXISTS favicon_url text;

ALTER TABLE public.tenant_branding
  DROP CONSTRAINT IF EXISTS tenant_branding_favicon_url_length;

ALTER TABLE public.tenant_branding
  ADD CONSTRAINT tenant_branding_favicon_url_length
  CHECK (favicon_url IS NULL OR length(favicon_url) <= 2048);

DROP FUNCTION IF EXISTS public.get_public_tenant_branding(text);

CREATE FUNCTION public.get_public_tenant_branding(_hostname text)
RETURNS TABLE(
  tenant_id uuid,
  display_name text,
  logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  show_powered_by boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    t.id,
    COALESCE(NULLIF(b.display_name, ''), t.name),
    b.logo_url,
    b.favicon_url,
    COALESCE(b.primary_color, '#3a1a5e'),
    COALESCE(b.secondary_color, '#6d3bb3'),
    COALESCE(b.accent_color, '#d7b86e'),
    COALESCE(b.show_powered_by, true)
  FROM public.tenant_domains d
  JOIN public.tenants t ON t.id = d.tenant_id
  LEFT JOIN public.tenant_branding b ON b.tenant_id = t.id
  WHERE d.normalized_hostname = lower(trim(_hostname))
    AND d.status = 'active'
    AND d.is_enabled = true
    AND t.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_tenant_branding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_branding(text) TO anon, authenticated;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon'
]::text[]
WHERE id = 'tenant-branding';
