-- Custom domains hardening: replay-safe create operations and bounded request metadata.
ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

ALTER TABLE public.tenant_domains
  DROP CONSTRAINT IF EXISTS tenant_domains_idempotency_key_length_check;
ALTER TABLE public.tenant_domains
  ADD CONSTRAINT tenant_domains_idempotency_key_length_check
  CHECK (idempotency_key IS NULL OR (char_length(idempotency_key) BETWEEN 1 AND 128));

ALTER TABLE public.tenant_domains
  DROP CONSTRAINT IF EXISTS tenant_domains_request_fingerprint_length_check;
ALTER TABLE public.tenant_domains
  ADD CONSTRAINT tenant_domains_request_fingerprint_length_check
  CHECK (request_fingerprint IS NULL OR char_length(request_fingerprint) <= 253);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_tenant_idempotency_key_uidx
  ON public.tenant_domains (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_domains_tenant_fingerprint_idx
  ON public.tenant_domains (tenant_id, request_fingerprint)
  WHERE request_fingerprint IS NOT NULL;

COMMENT ON COLUMN public.tenant_domains.idempotency_key IS
  'Client-generated replay key for create operations; never returned to clients.';
COMMENT ON COLUMN public.tenant_domains.request_fingerprint IS
  'Normalized hostname used to detect replay-key conflicts; contains no credentials.';
