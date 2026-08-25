CREATE TABLE IF NOT EXISTS public.tenant_branding (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#3a1a5e',
  secondary_color text NOT NULL DEFAULT '#6d3bb3',
  accent_color text NOT NULL DEFAULT '#d7b86e',
  show_powered_by boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_branding_display_name_length CHECK (display_name IS NULL OR length(display_name) <= 160),
  CONSTRAINT tenant_branding_logo_url_length CHECK (logo_url IS NULL OR length(logo_url) <= 2048),
  CONSTRAINT tenant_branding_primary_color_check CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT tenant_branding_secondary_color_check CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT tenant_branding_accent_color_check CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$')
);

DROP TRIGGER IF EXISTS trg_tenant_branding_updated ON public.tenant_branding;
CREATE TRIGGER trg_tenant_branding_updated
  BEFORE UPDATE ON public.tenant_branding
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_branding_system_owner_all ON public.tenant_branding;
CREATE POLICY tenant_branding_system_owner_all ON public.tenant_branding
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));

CREATE OR REPLACE FUNCTION public.get_public_tenant_branding(_hostname text)
RETURNS TABLE(
  tenant_id uuid,
  display_name text,
  logo_url text,
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

INSERT INTO public.tenant_branding (tenant_id, display_name, show_powered_by)
VALUES ('3d056e5f-1f82-45ba-8cf5-0750c949a9c9', 'Blitz Physio', false)
ON CONFLICT (tenant_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    show_powered_by = EXCLUDED.show_powered_by,
    updated_at = now();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-branding',
  'tenant-branding',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[];

DROP POLICY IF EXISTS tenant_branding_assets_public_read ON storage.objects;
CREATE POLICY tenant_branding_assets_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'tenant-branding');

DROP POLICY IF EXISTS tenant_branding_assets_system_owner_insert ON storage.objects;
CREATE POLICY tenant_branding_assets_system_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-branding' AND public.has_role(auth.uid(), 'system_owner'::public.app_role));

DROP POLICY IF EXISTS tenant_branding_assets_system_owner_update ON storage.objects;
CREATE POLICY tenant_branding_assets_system_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-branding' AND public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (bucket_id = 'tenant-branding' AND public.has_role(auth.uid(), 'system_owner'::public.app_role));
