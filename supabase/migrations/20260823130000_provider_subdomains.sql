-- Provider-owned subdomains are a temporary SaaS fallback when SSL for SaaS
-- custom-hostname quota is not available. They remain tenant-scoped and use
-- the same public resolver/RLS contract as customer-owned domains.
ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS provisioning_mode text NOT NULL DEFAULT 'custom_hostname';

ALTER TABLE public.tenant_domains
  DROP CONSTRAINT IF EXISTS tenant_domains_provisioning_mode_check;
ALTER TABLE public.tenant_domains
  ADD CONSTRAINT tenant_domains_provisioning_mode_check
  CHECK (provisioning_mode IN ('custom_hostname', 'provider_subdomain'));

CREATE INDEX IF NOT EXISTS tenant_domains_provisioning_mode_idx
  ON public.tenant_domains (provisioning_mode, status);

COMMENT ON COLUMN public.tenant_domains.provisioning_mode IS
  'custom_hostname for customer-owned domains; provider_subdomain for ZMedico-owned temporary subdomains.';

-- The public resolver intentionally returns only routing identifiers. The
-- provisioning mode is not needed by anonymous visitors and is not exposed.
REVOKE ALL ON FUNCTION public.resolve_active_tenant_domain(text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_active_tenant_domain(text) TO anon, authenticated;
