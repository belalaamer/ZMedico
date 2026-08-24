-- Multi-clinic Meta Ads connections and spend facts.
-- Tokens are ciphertext only; the encryption key stays in an Edge Function secret.

CREATE TABLE IF NOT EXISTS public.meta_ads_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'meta_ads' CHECK (provider = 'meta_ads'),
  ad_account_id text NOT NULL,
  business_id text,
  currency text NOT NULL DEFAULT 'EGP',
  timezone text NOT NULL DEFAULT 'Africa/Cairo',
  api_version text NOT NULL DEFAULT 'v20.0',
  token_ciphertext text,
  token_iv text,
  token_key_version integer NOT NULL DEFAULT 1,
  token_fingerprint text,
  status text NOT NULL DEFAULT 'configured'
    CHECK (status IN ('configured','connected','needs_reauth','error','disconnected')),
  last_tested_at timestamptz,
  last_successful_sync_at timestamptz,
  last_attempted_sync_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, provider, ad_account_id)
);

CREATE TABLE IF NOT EXISTS public.lead_campaign_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'meta_ads',
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  source text NOT NULL DEFAULT 'facebook',
  report_date date NOT NULL,
  date_start date NOT NULL,
  date_stop date NOT NULL,
  currency text NOT NULL,
  spend numeric(18,6) NOT NULL CHECK (spend >= 0),
  impressions bigint CHECK (impressions IS NULL OR impressions >= 0),
  reach bigint CHECK (reach IS NULL OR reach >= 0),
  clicks bigint CHECK (clicks IS NULL OR clicks >= 0),
  link_clicks bigint CHECK (link_clicks IS NULL OR link_clicks >= 0),
  leads_reported bigint CHECK (leads_reported IS NULL OR leads_reported >= 0),
  actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  attribution_setting text,
  breakdowns jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_hash text NOT NULL,
  source_updated_at timestamptz,
  imported_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  sync_run_id uuid,
  is_estimated boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, ad_account_id, campaign_id, report_date, currency)
);

CREATE TABLE IF NOT EXISTS public.meta_ads_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.meta_ads_connections(id) ON DELETE CASCADE,
  requested_start date NOT NULL,
  requested_stop date NOT NULL,
  api_version text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','partial','failed','cancelled')),
  rows_received integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  rows_rejected integer NOT NULL DEFAULT 0,
  pages_read integer NOT NULL DEFAULT 0,
  total_spend numeric(18,6),
  currency_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS meta_ads_connections_branch_idx
  ON public.meta_ads_connections(branch_id, status);
CREATE INDEX IF NOT EXISTS lead_campaign_spend_branch_date_idx
  ON public.lead_campaign_spend(branch_id, report_date DESC);
CREATE INDEX IF NOT EXISTS lead_campaign_spend_campaign_date_idx
  ON public.lead_campaign_spend(campaign_id, report_date DESC);
CREATE INDEX IF NOT EXISTS meta_ads_sync_runs_connection_idx
  ON public.meta_ads_sync_runs(connection_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.meta_ads_admin_access(_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_branch_access(_branch_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'system_owner'::public.app_role)
    )
$$;

ALTER TABLE public.meta_ads_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_campaign_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_sync_runs ENABLE ROW LEVEL SECURITY;

-- Do not expose encrypted token columns to the browser. Edge Functions use service_role.
REVOKE ALL ON TABLE public.meta_ads_connections FROM anon, authenticated;
REVOKE ALL ON TABLE public.lead_campaign_spend FROM anon, authenticated;
REVOKE ALL ON TABLE public.meta_ads_sync_runs FROM anon, authenticated;
GRANT ALL ON TABLE public.meta_ads_connections TO service_role;
GRANT ALL ON TABLE public.lead_campaign_spend TO service_role;
GRANT ALL ON TABLE public.meta_ads_sync_runs TO service_role;
REVOKE ALL ON FUNCTION public.meta_ads_admin_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meta_ads_admin_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_meta_ads_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_meta_ads_connections_updated ON public.meta_ads_connections;
CREATE TRIGGER trg_meta_ads_connections_updated
  BEFORE UPDATE ON public.meta_ads_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_meta_ads_updated_at();
DROP TRIGGER IF EXISTS trg_lead_campaign_spend_updated ON public.lead_campaign_spend;
CREATE TRIGGER trg_lead_campaign_spend_updated
  BEFORE UPDATE ON public.lead_campaign_spend
  FOR EACH ROW EXECUTE FUNCTION public.tg_meta_ads_updated_at();

-- Safe status projection for authenticated admins; token material is never returned.
CREATE OR REPLACE FUNCTION public.get_meta_ads_connection_status(_branch_id uuid)
RETURNS TABLE (
  id uuid,
  branch_id uuid,
  provider text,
  ad_account_id text,
  business_id text,
  currency text,
  timezone text,
  api_version text,
  status text,
  token_configured boolean,
  last_tested_at timestamptz,
  last_successful_sync_at timestamptz,
  last_attempted_sync_at timestamptz,
  last_error_code text,
  last_error_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.branch_id, c.provider, c.ad_account_id, c.business_id,
    c.currency, c.timezone, c.api_version, c.status,
    (c.token_ciphertext IS NOT NULL AND c.token_iv IS NOT NULL) AS token_configured,
    c.last_tested_at, c.last_successful_sync_at, c.last_attempted_sync_at,
    c.last_error_code, c.last_error_message
  FROM public.meta_ads_connections c
  WHERE c.branch_id = _branch_id
    AND public.meta_ads_admin_access(_branch_id)
  ORDER BY c.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_meta_ads_connection_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meta_ads_connection_status(uuid) TO authenticated, service_role;
