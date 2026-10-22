-- ZMED-286 : make lead_campaign_spend rows belong to the branch that synced them.
--
-- 20260822133000_meta_ads_multitenant_connections.sql:62 declared
--   UNIQUE (provider, ad_account_id, campaign_id, report_date, currency)
-- on lead_campaign_spend, while :28 allowed one Meta ad account to be connected from two
-- branches (meta_ads_connections is UNIQUE (branch_id, provider, ad_account_id)).
-- functions/meta-ads-sync/index.ts:179 (published main 904037c718e4) upserts with exactly the
-- first key as its conflict target and writes branch_id in the payload, so when two clinics
-- share an act_ id the second DO UPDATEs the first branch's row - including overwriting
-- branch_id. Spend then silently belongs to the wrong tenant.
--
-- This file only re-scopes that key. It revokes nothing, disables no RLS, grants no new
-- privilege, and rewrites no stored row: Production currently holds 0 lead_campaign_spend
-- rows and 0 meta_ads_sync_runs (measured 2026-10-22), so there is no mis-attributed history
-- to correct and no data change of any kind is needed here.

---------------------------------------------------------------------------
-- 1. Refuse to touch anything unless the live key is the one this file replaces.
---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.lead_campaign_spend'::regclass
     AND c.contype  = 'u'
     AND c.conname <> 'lead_campaign_spend_pkey';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'no unique constraint found on lead_campaign_spend; refusing to assume its shape';
  END IF;

  IF v_def <> 'UNIQUE (provider, ad_account_id, campaign_id, report_date, currency)' THEN
    RAISE EXCEPTION 'lead_campaign_spend unique key is %, not the reviewed (provider, ad_account_id, campaign_id, report_date, currency); review manually', v_def;
  END IF;
END
$$;

---------------------------------------------------------------------------
-- 2. Add the branch-scoped key before dropping the old one.
--    The new key is a strict superset of the old column list, so any pair of rows that
--    collides under the new key already collided under the old one: this CREATE can never
--    fail on data the old constraint accepted, and the table is protected at every instant.
---------------------------------------------------------------------------
DO $$
DECLARE
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT branch_id, provider, ad_account_id, campaign_id, report_date, currency
      FROM public.lead_campaign_spend
     GROUP BY 1,2,3,4,5,6
    HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION '% group(s) already violate the branch-scoped key; resolve before applying', v_dupes;
  END IF;
END
$$;

ALTER TABLE public.lead_campaign_spend
  ADD CONSTRAINT lead_campaign_spend_branch_scope_uniq
  UNIQUE (branch_id, provider, ad_account_id, campaign_id, report_date, currency);

ALTER TABLE public.lead_campaign_spend
  DROP CONSTRAINT lead_campaign_spend_provider_ad_account_id_campaign_id_repo_key;

---------------------------------------------------------------------------
-- 3. Post-condition: the intended key is the only non-primary unique key left.
---------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_others integer;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.lead_campaign_spend'::regclass
     AND c.conname  = 'lead_campaign_spend_branch_scope_uniq';

  IF v_def IS DISTINCT FROM 'UNIQUE (branch_id, provider, ad_account_id, campaign_id, report_date, currency)' THEN
    RAISE EXCEPTION 'expected the branch-scoped key, found %', v_def;
  END IF;

  SELECT count(*) INTO v_others
    FROM pg_constraint c
   WHERE c.conrelid = 'public.lead_campaign_spend'::regclass
     AND c.contype  = 'u'
     AND c.conname <> 'lead_campaign_spend_pkey'
     AND c.conname <> 'lead_campaign_spend_branch_scope_uniq';

  IF v_others <> 0 THEN
    RAISE EXCEPTION '% unexpected unique constraint(s) remain on lead_campaign_spend', v_others;
  END IF;
END
$$;

---------------------------------------------------------------------------
-- 4. Close the URL-path shape at the database, not only in the writer.
--    meta-ads-connection validates them from this revision on, but the column is plain text
--    and a row written before it, by hand, or through any future producer would still be
--    concatenated into a call made with the tenant's own access token. Enforcing the shape
--    here means no writer can reintroduce the gap - the same posture as the ZMED-279 consent
--    trigger. Existing rows are checked first and the migration refuses rather than editing
--    anyone's stored configuration.
---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_account integer;
  v_bad_version integer;
BEGIN
  SELECT count(*) INTO v_bad_account FROM public.meta_ads_connections
   WHERE ad_account_id !~ '^act_[0-9]+$';
  SELECT count(*) INTO v_bad_version FROM public.meta_ads_connections
   WHERE api_version !~ '^v[0-9]+(\.[0-9]+)?$';

  IF v_bad_account > 0 OR v_bad_version > 0 THEN
    RAISE EXCEPTION 'meta_ads_connections holds % row(s) with a non-numeric Ad Account ID and % with a non-bare API version; correct them (with authorisation) before applying',
      v_bad_account, v_bad_version;
  END IF;
END
$$;

ALTER TABLE public.meta_ads_connections
  DROP CONSTRAINT IF EXISTS meta_ads_connections_ad_account_id_shape;
ALTER TABLE public.meta_ads_connections
  ADD CONSTRAINT meta_ads_connections_ad_account_id_shape
  CHECK (ad_account_id ~ '^act_[0-9]+$');

ALTER TABLE public.meta_ads_connections
  DROP CONSTRAINT IF EXISTS meta_ads_connections_api_version_shape;
ALTER TABLE public.meta_ads_connections
  ADD CONSTRAINT meta_ads_connections_api_version_shape
  CHECK (api_version ~ '^v[0-9]+(\.[0-9]+)?$');

---------------------------------------------------------------------------
-- 5. Posture checks: the invariants exist, and nothing was loosened while adding them.
---------------------------------------------------------------------------
DO $$
DECLARE
  v_rls boolean;
  v_shapes integer;
BEGIN
  SELECT count(*) INTO v_shapes FROM pg_constraint
   WHERE conrelid = 'public.meta_ads_connections'::regclass
     AND conname IN ('meta_ads_connections_ad_account_id_shape', 'meta_ads_connections_api_version_shape');
  IF v_shapes <> 2 THEN
    RAISE EXCEPTION 'expected 2 shape constraints on meta_ads_connections, found %', v_shapes;
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.meta_ads_connections'::regclass;
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'meta_ads_connections RLS was expected to stay enabled, found %', v_rls;
  END IF;
END
$$;
