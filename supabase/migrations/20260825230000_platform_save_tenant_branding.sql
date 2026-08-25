ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_branding_system_owner_all ON public.tenant_branding;
CREATE POLICY tenant_branding_system_owner_all ON public.tenant_branding
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));

CREATE OR REPLACE FUNCTION public.platform_save_tenant_branding(
  p_tenant_id uuid,
  p_display_name text,
  p_logo_url text,
  p_favicon_url text,
  p_primary_color text,
  p_secondary_color text,
  p_accent_color text,
  p_show_powered_by boolean,
  p_display_name_source text,
  p_logo_source text,
  p_favicon_source text,
  p_colors_source text
)
RETURNS public.tenant_branding
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.tenant_branding;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner access required' USING ERRCODE = '42501';
  END IF;

  IF p_display_name_source NOT IN ('zmedico', 'tenant')
    OR p_logo_source NOT IN ('zmedico', 'tenant')
    OR p_favicon_source NOT IN ('zmedico', 'tenant')
    OR p_colors_source NOT IN ('zmedico', 'tenant') THEN
    RAISE EXCEPTION 'Invalid branding source' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_branding (
    tenant_id,
    display_name,
    logo_url,
    favicon_url,
    primary_color,
    secondary_color,
    accent_color,
    show_powered_by,
    display_name_source,
    logo_source,
    favicon_source,
    colors_source
  ) VALUES (
    p_tenant_id,
    NULLIF(trim(p_display_name), ''),
    NULLIF(trim(p_logo_url), ''),
    NULLIF(trim(p_favicon_url), ''),
    p_primary_color,
    p_secondary_color,
    p_accent_color,
    p_show_powered_by,
    p_display_name_source,
    p_logo_source,
    p_favicon_source,
    p_colors_source
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    logo_url = EXCLUDED.logo_url,
    favicon_url = EXCLUDED.favicon_url,
    primary_color = EXCLUDED.primary_color,
    secondary_color = EXCLUDED.secondary_color,
    accent_color = EXCLUDED.accent_color,
    show_powered_by = EXCLUDED.show_powered_by,
    display_name_source = EXCLUDED.display_name_source,
    logo_source = EXCLUDED.logo_source,
    favicon_source = EXCLUDED.favicon_source,
    colors_source = EXCLUDED.colors_source,
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_save_tenant_branding(uuid, text, text, text, text, text, text, boolean, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_save_tenant_branding(uuid, text, text, text, text, text, text, boolean, text, text, text, text) TO authenticated;
