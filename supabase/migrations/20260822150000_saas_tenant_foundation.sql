-- ZMedico SaaS foundation: one tenant (clinic/customer) owns one or more branches.
-- Existing tenant and branch data are linked before the NOT NULL constraint is added.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id
  FROM public.tenants
  ORDER BY created_at
  LIMIT 1;

  IF v_tenant_id IS NULL
     AND EXISTS (SELECT 1 FROM public.branches WHERE tenant_id IS NULL) THEN
    -- Historical seed data can contain branches before the tenant foundation
    -- migration. Bootstrap their single owner so the tenant invariant remains
    -- valid in both production upgrades and clean local test databases.
    INSERT INTO public.tenants (name, slug)
    VALUES ('Default Tenant', 'default-tenant')
    RETURNING id INTO v_tenant_id;
  END IF;

  IF v_tenant_id IS NOT NULL THEN
    UPDATE public.branches
    SET tenant_id = v_tenant_id
    WHERE tenant_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branches_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.branches
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS branches_tenant_id_idx
  ON public.branches(tenant_id, is_active);

-- Feature/module entitlements are tenant-scoped. The application keeps the
-- module catalog in code; this table stores each customer's enable/disable
-- choice and future per-module configuration.
CREATE TABLE IF NOT EXISTS public.tenant_module_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL CHECK (module_key ~ '^[a-z][a-z0-9_.-]{1,80}$'),
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key)
);

CREATE INDEX IF NOT EXISTS tenant_module_settings_tenant_idx
  ON public.tenant_module_settings(tenant_id, enabled);

-- A domain is provisioned only after ownership/certificate validation. The
-- hostname itself is not a credential; Cloudflare identifiers and statuses
-- make onboarding observable without exposing provider secrets.
CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  normalized_hostname text NOT NULL,
  default_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','disabled','failed')),
  validation_method text NOT NULL DEFAULT 'txt'
    CHECK (validation_method IN ('txt','http','email','prevalidation')),
  verification_token text,
  cloudflare_hostname_id text,
  hostname_status text,
  ssl_status text,
  is_enabled boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_hostname)
);

CREATE INDEX IF NOT EXISTS tenant_domains_tenant_idx
  ON public.tenant_domains(tenant_id, status);

-- Public host resolution returns only routing identifiers. It never returns
-- tenant names, billing data, credentials, or operational records.
CREATE OR REPLACE FUNCTION public.resolve_active_tenant_domain(_hostname text)
RETURNS TABLE(tenant_id uuid, default_branch_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.tenant_id, d.default_branch_id
  FROM public.tenant_domains d
  WHERE d.normalized_hostname = lower(trim(_hostname))
    AND d.status = 'active'
    AND d.is_enabled = true
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_active_tenant_domain(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_saas_tenant_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_module_settings_updated ON public.tenant_module_settings;
CREATE TRIGGER trg_tenant_module_settings_updated
  BEFORE UPDATE ON public.tenant_module_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_saas_tenant_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_domains_updated ON public.tenant_domains;
CREATE TRIGGER trg_tenant_domains_updated
  BEFORE UPDATE ON public.tenant_domains
  FOR EACH ROW EXECUTE FUNCTION public.tg_saas_tenant_updated_at();

ALTER TABLE public.tenant_module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_module_settings FROM anon;
REVOKE ALL ON TABLE public.tenant_domains FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_module_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_domains TO authenticated;
GRANT ALL ON TABLE public.tenant_module_settings TO service_role;
GRANT ALL ON TABLE public.tenant_domains TO service_role;

DROP POLICY IF EXISTS tenant_module_settings_read ON public.tenant_module_settings;
CREATE POLICY tenant_module_settings_read
  ON public.tenant_module_settings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.tenant_id = tenant_module_settings.tenant_id
        AND public.user_has_branch_access(b.id)
    )
  );

DROP POLICY IF EXISTS tenant_module_settings_write ON public.tenant_module_settings;
CREATE POLICY tenant_module_settings_write
  ON public.tenant_module_settings FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_permission(auth.uid(), 'settings.edit')
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.tenant_id = tenant_module_settings.tenant_id
          AND public.user_has_branch_access(b.id)
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_permission(auth.uid(), 'settings.edit')
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.tenant_id = tenant_module_settings.tenant_id
          AND public.user_has_branch_access(b.id)
      )
    )
  );

DROP POLICY IF EXISTS tenant_domains_read ON public.tenant_domains;
CREATE POLICY tenant_domains_read
  ON public.tenant_domains FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_owner'::public.app_role)
    OR (
      public.has_permission(auth.uid(), 'settings.edit')
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.tenant_id = tenant_domains.tenant_id
          AND public.user_has_branch_access(b.id)
      )
    )
  );

DROP POLICY IF EXISTS tenant_domains_write ON public.tenant_domains;
CREATE POLICY tenant_domains_write
  ON public.tenant_domains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'system_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'system_owner'::public.app_role));

-- Existing branches RLS policies are intentionally left unchanged. The new
-- tenant relationship is enforced by the feature policies above and by
-- server-side tenant-management operations.
