ALTER TABLE public.tenant_branding
  ADD COLUMN IF NOT EXISTS display_name_source text NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS logo_source text NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS favicon_source text NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS colors_source text NOT NULL DEFAULT 'tenant';

ALTER TABLE public.tenant_branding
  DROP CONSTRAINT IF EXISTS tenant_branding_display_name_source_check,
  DROP CONSTRAINT IF EXISTS tenant_branding_logo_source_check,
  DROP CONSTRAINT IF EXISTS tenant_branding_favicon_source_check,
  DROP CONSTRAINT IF EXISTS tenant_branding_colors_source_check;

ALTER TABLE public.tenant_branding
  ADD CONSTRAINT tenant_branding_display_name_source_check
    CHECK (display_name_source IN ('zmedico', 'tenant')),
  ADD CONSTRAINT tenant_branding_logo_source_check
    CHECK (logo_source IN ('zmedico', 'tenant')),
  ADD CONSTRAINT tenant_branding_favicon_source_check
    CHECK (favicon_source IN ('zmedico', 'tenant')),
  ADD CONSTRAINT tenant_branding_colors_source_check
    CHECK (colors_source IN ('zmedico', 'tenant'));

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
  show_powered_by boolean,
  display_name_source text,
  logo_source text,
  favicon_source text,
  colors_source text
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
    COALESCE(b.show_powered_by, true),
    COALESCE(b.display_name_source, 'tenant'),
    COALESCE(b.logo_source, 'tenant'),
    COALESCE(b.favicon_source, 'tenant'),
    COALESCE(b.colors_source, 'tenant')
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
