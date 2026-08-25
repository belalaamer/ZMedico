-- Provider-owned subdomains use the same tenant_domains table as customer domains.
-- The original operation constraint omitted create_subdomain, causing the Edge
-- Function insert to fail with the generic "Unable to save" message.
ALTER TABLE public.tenant_domains
  DROP CONSTRAINT IF EXISTS tenant_domains_operation_check;

ALTER TABLE public.tenant_domains
  ADD CONSTRAINT tenant_domains_operation_check
  CHECK (operation IS NULL OR operation IN ('create', 'create_subdomain', 'status', 'disable', 'remove'));
