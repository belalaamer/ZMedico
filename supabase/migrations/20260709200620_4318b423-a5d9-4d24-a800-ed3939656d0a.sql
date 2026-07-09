
-- =========================================================================
-- Settings vertical slice — Shadow refinements (additive, non-behavioral).
-- Adds:
--   (1) Reproducibility metadata on every shadow decision.
--   (2) Explicit expected-expansions registry.
--   (3) Per-slice objective exit criteria.
-- No existing behavior changes. No RLS collapse. No frontend cutover.
-- =========================================================================

------------------------------------------------------------------
-- 1. Extend shadow-decision log with reproducibility metadata.
------------------------------------------------------------------
ALTER TABLE public.authz_shadow_decisions
  ADD COLUMN IF NOT EXISTS authz_fingerprint text,
  ADD COLUMN IF NOT EXISTS catalog_version   text,
  ADD COLUMN IF NOT EXISTS bundle_version    text,
  ADD COLUMN IF NOT EXISTS role_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS app_version       text,
  ADD COLUMN IF NOT EXISTS request_source    text
    CHECK (request_source IS NULL OR request_source IN ('UI','RPC','BACKGROUND'));

CREATE INDEX IF NOT EXISTS authz_shadow_decisions_fingerprint_idx
  ON public.authz_shadow_decisions (slice, authz_fingerprint);

COMMENT ON COLUMN public.authz_shadow_decisions.authz_fingerprint IS
  'Fingerprint from authz_current_state() at record time. Rows with different fingerprints refer to different authorization models and must not be aggregated across the boundary.';
COMMENT ON COLUMN public.authz_shadow_decisions.role_snapshot IS
  'JSON snapshot of the acting user''s roles at decision time. Bundle set can be reconstructed by joining with authz_role_bundles at bundle_version.';

------------------------------------------------------------------
-- 2. Expected-expansions registry.
--    Any (slice, permission_key [, actor_role]) listed here is a
--    specification-approved expansion (legacy=false, new=true).
--    Everything not listed and not a match is UNEXPECTED and blocks cutover.
------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.authz_shadow_expected_expansions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slice          text NOT NULL,
  permission_key text NOT NULL,
  actor_role     public.app_role,  -- NULL = any role
  reason         text NOT NULL,
  spec_reference text,             -- e.g. 'FINAL_PERMISSION_SPECIFICATION §31'
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  UNIQUE (slice, permission_key, actor_role)
);

GRANT SELECT ON public.authz_shadow_expected_expansions TO authenticated;
GRANT ALL    ON public.authz_shadow_expected_expansions TO service_role;

ALTER TABLE public.authz_shadow_expected_expansions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expected expansions: admins read" ON public.authz_shadow_expected_expansions;
CREATE POLICY "expected expansions: admins read"
  ON public.authz_shadow_expected_expansions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "expected expansions: admins write" ON public.authz_shadow_expected_expansions;
CREATE POLICY "expected expansions: admins write"
  ON public.authz_shadow_expected_expansions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

COMMENT ON TABLE public.authz_shadow_expected_expansions IS
  'Every legacy=false / new=true pair must either be absent from real traffic or explicitly listed here. Unlisted expansions block the cutover gate.';

------------------------------------------------------------------
-- 3. Per-slice objective exit-criteria configuration.
------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.authz_shadow_slice_gate (
  slice                       text PRIMARY KEY,
  required_keys               text[]              NOT NULL DEFAULT ARRAY[]::text[],
  required_granting_bundles   text[]              NOT NULL DEFAULT ARRAY[]::text[],
  required_denying_bundles    text[]              NOT NULL DEFAULT ARRAY[]::text[],
  required_write_roles        public.app_role[]   NOT NULL DEFAULT ARRAY[]::public.app_role[],
  required_denied_roles       public.app_role[]   NOT NULL DEFAULT ARRAY[]::public.app_role[],
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.authz_shadow_slice_gate TO authenticated;
GRANT ALL    ON public.authz_shadow_slice_gate TO service_role;

ALTER TABLE public.authz_shadow_slice_gate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slice gate: admins read" ON public.authz_shadow_slice_gate;
CREATE POLICY "slice gate: admins read"
  ON public.authz_shadow_slice_gate
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "slice gate: admins write" ON public.authz_shadow_slice_gate;
CREATE POLICY "slice gate: admins write"
  ON public.authz_shadow_slice_gate
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- Seed Settings-slice requirements (matches Migration 1's five keys
-- and the bundle/role mapping declared there).
INSERT INTO public.authz_shadow_slice_gate (
  slice, required_keys,
  required_granting_bundles, required_denying_bundles,
  required_write_roles, required_denied_roles, notes
) VALUES (
  'settings',
  ARRAY[
    'settings.org.update',
    'settings.branch.update',
    'settings.pricing.update',
    'settings.catalog.update',
    'settings.integrations.manage'
  ],
  ARRAY['admin','manager','accountant'],
  ARRAY['staff'],
  ARRAY['admin'::public.app_role,'manager'::public.app_role,'accountant'::public.app_role],
  ARRAY['staff'::public.app_role],
  'Frozen from FINAL_PERMISSION_SPECIFICATION §31; every key must be exercised, every listed bundle observed as granting or denying, at least one denied role captured.'
)
ON CONFLICT (slice) DO UPDATE SET
  required_keys             = EXCLUDED.required_keys,
  required_granting_bundles = EXCLUDED.required_granting_bundles,
  required_denying_bundles  = EXCLUDED.required_denying_bundles,
  required_write_roles      = EXCLUDED.required_write_roles,
  required_denied_roles     = EXCLUDED.required_denied_roles,
  notes                     = EXCLUDED.notes,
  updated_at                = now();

------------------------------------------------------------------
-- 4. Recorder v2 — auto-captures reproducibility metadata.
--    Legacy signature kept as a wrapper for zero-caller-change.
------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.authz_record_shadow_decision(
  _slice          text,
  _permission_key text,
  _decision_legacy boolean,
  _decision_new   boolean,
  _app_version    text,
  _request_source text,
  _context        jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid           uuid := auth.uid();
  _state         jsonb;
  _fingerprint   text;
  _cat_version   text;
  _bun_version   text;
  _roles         jsonb;
  _src           text;
BEGIN
  IF _uid IS NULL OR _slice IS NULL OR _permission_key IS NULL THEN
    RETURN;
  END IF;

  _src := upper(COALESCE(_request_source, 'UI'));
  IF _src NOT IN ('UI','RPC','BACKGROUND') THEN _src := 'UI'; END IF;

  BEGIN
    _state := public.authz_current_state();
  EXCEPTION WHEN OTHERS THEN
    _state := '{}'::jsonb;
  END;

  _fingerprint := _state->>'fingerprint';
  _cat_version := _state #>> '{active_versions,permission_catalog,semver}';
  _bun_version := _state #>> '{active_versions,bundle,semver}';

  SELECT COALESCE(
           jsonb_build_object(
             'roles',
             COALESCE(
               (SELECT jsonb_agg(DISTINCT ur.role::text ORDER BY ur.role::text)
                  FROM public.user_roles ur WHERE ur.user_id = _uid),
               '[]'::jsonb)
           ),
           '{}'::jsonb)
    INTO _roles;

  INSERT INTO public.authz_shadow_decisions (
    slice, permission_key, user_id,
    decision_legacy, decision_new,
    context,
    authz_fingerprint, catalog_version, bundle_version,
    role_snapshot, app_version, request_source
  ) VALUES (
    _slice, _permission_key, _uid,
    _decision_legacy, _decision_new,
    COALESCE(_context, '{}'::jsonb),
    _fingerprint, _cat_version, _bun_version,
    _roles, _app_version, _src
  );
END;
$$;

REVOKE ALL ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,text,text,jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,text,text,jsonb) IS
  'Records one shadow-mode authorization decision with reproducibility metadata (authz fingerprint, catalog/bundle version, role snapshot, app version, request source). Never affects access.';

-- Backwards-compatible legacy signature — delegates to v2.
CREATE OR REPLACE FUNCTION public.authz_record_shadow_decision(
  _slice          text,
  _permission_key text,
  _decision_legacy boolean,
  _decision_new   boolean,
  _context        jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.authz_record_shadow_decision(
    _slice, _permission_key, _decision_legacy, _decision_new,
    NULLIF(_context->>'app_version',''),
    NULLIF(_context->>'request_source',''),
    _context
  );
$$;

REVOKE ALL ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,jsonb)
  TO authenticated, service_role;

------------------------------------------------------------------
-- 5. Parity report — regressions vs. expected vs. unexpected expansions.
------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_authz_shadow_parity_report;

CREATE VIEW public.v_authz_shadow_parity_report
WITH (security_invoker = true) AS
WITH classified AS (
  SELECT
    d.slice,
    d.permission_key,
    d.user_id,
    d.decision_legacy,
    d.decision_new,
    d.created_at,
    CASE
      WHEN d.decision_legacy AND NOT d.decision_new                     THEN 'regression'
      WHEN NOT d.decision_legacy AND d.decision_new AND EXISTS (
        SELECT 1 FROM public.authz_shadow_expected_expansions e
         WHERE e.slice = d.slice
           AND e.permission_key = d.permission_key
      )                                                                  THEN 'expected_expansion'
      WHEN NOT d.decision_legacy AND d.decision_new                     THEN 'unexpected_expansion'
      ELSE 'match'
    END AS classification
  FROM public.authz_shadow_decisions d
)
SELECT
  slice,
  count(*)                                                                     AS total_decisions,
  count(*) FILTER (WHERE classification = 'regression')                        AS regressions,
  count(*) FILTER (WHERE classification = 'unexpected_expansion')              AS unexpected_expansions,
  count(*) FILTER (WHERE classification = 'expected_expansion')                AS expected_expansions,
  count(*) FILTER (WHERE classification = 'match')                             AS matches,
  count(DISTINCT permission_key)                                               AS unique_keys,
  count(DISTINCT user_id)                                                      AS unique_users,
  count(*) FILTER (WHERE decision_legacy)                                      AS legacy_allow,
  count(*) FILTER (WHERE NOT decision_legacy)                                  AS legacy_deny,
  count(*) FILTER (WHERE decision_new)                                         AS new_allow,
  count(*) FILTER (WHERE NOT decision_new)                                     AS new_deny,
  min(created_at)                                                              AS first_seen_at,
  max(created_at)                                                              AS last_seen_at,
  (count(*) FILTER (WHERE classification IN ('regression','unexpected_expansion')) = 0)
                                                                               AS parity_green
FROM classified
GROUP BY slice;

GRANT SELECT ON public.v_authz_shadow_parity_report TO authenticated, service_role;

COMMENT ON VIEW public.v_authz_shadow_parity_report IS
  'Per-slice parity summary. parity_green requires zero regressions AND zero unexpected expansions. Expected expansions must be declared in authz_shadow_expected_expansions.';

------------------------------------------------------------------
-- 6. Objective exit criteria — one row per slice, all-booleans + verdict.
------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_authz_shadow_exit_criteria
WITH (security_invoker = true) AS
WITH
  gate AS (SELECT * FROM public.authz_shadow_slice_gate),
  observed_keys AS (
    SELECT slice, array_agg(DISTINCT permission_key) AS keys
    FROM public.authz_shadow_decisions GROUP BY slice
  ),
  -- Which bundles were seen granting a key (new=true) in the slice
  observed_granting_bundles AS (
    SELECT d.slice, array_agg(DISTINCT rb.bundle_key) AS bundles
    FROM public.authz_shadow_decisions d
    JOIN public.user_roles ur ON ur.user_id = d.user_id
    JOIN public.authz_role_bundles rb ON rb.role = ur.role
    WHERE d.decision_new = true
    GROUP BY d.slice
  ),
  observed_denying_bundles AS (
    SELECT d.slice, array_agg(DISTINCT rb.bundle_key) AS bundles
    FROM public.authz_shadow_decisions d
    JOIN public.user_roles ur ON ur.user_id = d.user_id
    JOIN public.authz_role_bundles rb ON rb.role = ur.role
    WHERE d.decision_new = false
    GROUP BY d.slice
  ),
  observed_write_roles AS (
    SELECT d.slice, array_agg(DISTINCT ur.role) AS roles
    FROM public.authz_shadow_decisions d
    JOIN public.user_roles ur ON ur.user_id = d.user_id
    WHERE d.decision_new = true
    GROUP BY d.slice
  ),
  observed_denied_roles AS (
    SELECT d.slice, array_agg(DISTINCT ur.role) AS roles
    FROM public.authz_shadow_decisions d
    JOIN public.user_roles ur ON ur.user_id = d.user_id
    WHERE d.decision_new = false
    GROUP BY d.slice
  ),
  parity AS (SELECT * FROM public.v_authz_shadow_parity_report)
SELECT
  g.slice,
  -- Coverage booleans
  (COALESCE(ok.keys, ARRAY[]::text[])       @> g.required_keys)
    AS every_key_exercised,
  (COALESCE(ogb.bundles, ARRAY[]::text[])   @> g.required_granting_bundles)
    AS every_granting_bundle_exercised,
  (COALESCE(odb.bundles, ARRAY[]::text[])   @> g.required_denying_bundles)
    AS every_denying_bundle_exercised,
  (COALESCE(owr.roles, ARRAY[]::public.app_role[])
                                            @> g.required_write_roles)
    AS every_write_role_exercised,
  (COALESCE(odr.roles, ARRAY[]::public.app_role[])
                                            @> g.required_denied_roles)
    AS at_least_one_denied_role_exercised,
  -- Parity booleans
  COALESCE(p.regressions, 0)                AS regressions,
  COALESCE(p.unexpected_expansions, 0)      AS unexpected_expansions,
  COALESCE(p.expected_expansions, 0)        AS expected_expansions,
  COALESCE(p.parity_green, false)           AS parity_green,
  -- Diagnostics
  g.required_keys,
  COALESCE(ok.keys, ARRAY[]::text[])                            AS observed_keys,
  (SELECT array_agg(k) FROM unnest(g.required_keys) k
     WHERE NOT (k = ANY(COALESCE(ok.keys, ARRAY[]::text[]))))   AS missing_keys,
  g.required_granting_bundles,
  COALESCE(ogb.bundles, ARRAY[]::text[])                        AS observed_granting_bundles,
  g.required_denying_bundles,
  COALESCE(odb.bundles, ARRAY[]::text[])                        AS observed_denying_bundles,
  g.required_write_roles,
  COALESCE(owr.roles,  ARRAY[]::public.app_role[])              AS observed_write_roles,
  g.required_denied_roles,
  COALESCE(odr.roles,  ARRAY[]::public.app_role[])              AS observed_denied_roles,
  -- Final verdict
  (
        (COALESCE(ok.keys,  ARRAY[]::text[])              @> g.required_keys)
    AND (COALESCE(ogb.bundles, ARRAY[]::text[])           @> g.required_granting_bundles)
    AND (COALESCE(odb.bundles, ARRAY[]::text[])           @> g.required_denying_bundles)
    AND (COALESCE(owr.roles, ARRAY[]::public.app_role[])  @> g.required_write_roles)
    AND (COALESCE(odr.roles, ARRAY[]::public.app_role[])  @> g.required_denied_roles)
    AND COALESCE(p.regressions, 0) = 0
    AND COALESCE(p.unexpected_expansions, 0) = 0
    AND COALESCE(p.parity_green, false) = true
  ) AS ready_for_cutover
FROM gate g
LEFT JOIN observed_keys              ok  ON ok.slice  = g.slice
LEFT JOIN observed_granting_bundles  ogb ON ogb.slice = g.slice
LEFT JOIN observed_denying_bundles   odb ON odb.slice = g.slice
LEFT JOIN observed_write_roles       owr ON owr.slice = g.slice
LEFT JOIN observed_denied_roles      odr ON odr.slice = g.slice
LEFT JOIN parity                     p   ON p.slice   = g.slice;

GRANT SELECT ON public.v_authz_shadow_exit_criteria TO authenticated, service_role;

COMMENT ON VIEW public.v_authz_shadow_exit_criteria IS
  'Objective, per-slice cutover gate. ready_for_cutover is true only when every measurable threshold holds: full key coverage, every granting and denying bundle exercised, every write-capable role exercised, at least one denied role exercised, zero regressions, zero unexpected expansions, and parity_green. Golden Baseline and regression suite are enforced by CI, not by this view.';
