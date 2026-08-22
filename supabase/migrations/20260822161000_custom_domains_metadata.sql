-- Safe metadata required by the Platform Custom Domains screen.
ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS validation_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cname_target text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_error_code text,
  ADD COLUMN IF NOT EXISTS operation text;

ALTER TABLE public.tenant_domains
  DROP CONSTRAINT IF EXISTS tenant_domains_validation_records_array;
ALTER TABLE public.tenant_domains
  ADD CONSTRAINT tenant_domains_validation_records_array
  CHECK (jsonb_typeof(validation_records) = 'array');

ALTER TABLE public.tenant_domains
  DROP CONSTRAINT IF EXISTS tenant_domains_operation_check;
ALTER TABLE public.tenant_domains
  ADD CONSTRAINT tenant_domains_operation_check
  CHECK (operation IS NULL OR operation IN ('create', 'status', 'disable', 'remove'));

CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant_status
  ON public.tenant_domains (tenant_id, status, is_enabled);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_cloudflare_hostname_id
  ON public.tenant_domains (cloudflare_hostname_id)
  WHERE cloudflare_hostname_id IS NOT NULL;
