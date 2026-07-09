-- =========================================================================
-- Settings shadow — positive/negative verification matrices.
-- Additive: new diagnostic view + strengthened gate view (aggregate-only).
-- =========================================================================

------------------------------------------------------------------
-- 1. Diagnostic view: per-cell (role × permission) matrix.
------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_authz_shadow_matrix_settings;

CREATE VIEW public.v_authz_shadow_matrix_settings
WITH (security_invoker = true) AS
WITH
  gate AS (
    SELECT required_keys,
           (required_write_roles || required_denied_roles) AS all_roles
      FROM public.authz_shadow_slice_gate
     WHERE slice = 'settings'
  ),
  cells AS (
    SELECT r::text AS role, k AS permission_key
      FROM gate g,
           unnest(g.all_roles)     AS r,
           unnest(g.required_keys) AS k
  ),
  expected AS (
    -- All settings.* keys resolve to (module='settings', action='edit')
    -- in the legacy model. Effective legacy source = role_permissions.
    SELECT c.role,
           c.permission_key,
           COALESCE(
             (SELECT 'edit' = ANY(rp.actions)
                FROM public.role_permissions rp
               WHERE rp.role = c.role AND rp.module = 'settings'
               LIMIT 1),
             false
           ) AS expected_decision
      FROM cells c
  ),
  observed AS (
    SELECT ur.role::text          AS role,
           d.permission_key,
           count(*)               AS observations,
           count(*) FILTER (WHERE d.decision_legacy AND NOT d.decision_new)      AS regressions,
           count(*) FILTER (WHERE NOT d.decision_legacy AND d.decision_new
                              AND NOT EXISTS (
                                SELECT 1 FROM public.authz_shadow_expected_expansions e
                                 WHERE e.slice = d.slice
                                   AND e.permission_key = d.permission_key
                              ))                                                 AS unexpected_expansions,
           bool_and(d.decision_new) AS all_allow,
           bool_or(d.decision_new)  AS any_allow,
           max(d.created_at)        AS last_seen
      FROM public.authz_shadow_decisions d
      JOIN public.user_roles ur ON ur.user_id = d.user_id
     WHERE d.slice = 'settings'
     GROUP BY ur.role, d.permission_key
  )
SELECT
  e.role,
  e.permission_key,
  e.expected_decision,
  CASE
    WHEN o.observations IS NULL                   THEN NULL
    WHEN o.all_allow = o.any_allow                THEN o.all_allow
    ELSE NULL
  END                                             AS observed_decision,
  COALESCE(o.observations, 0)                     AS observations,
  COALESCE(o.regressions, 0)                      AS regressions,
  COALESCE(o.unexpected_expansions, 0)            AS unexpected_expansions,
  CASE
    WHEN o.observations IS NULL                                  THEN 'missing'
    WHEN COALESCE(o.regressions, 0) > 0                          THEN 'red_regression'
    WHEN COALESCE(o.unexpected_expansions, 0) > 0                THEN 'red_expansion'
    WHEN o.all_allow IS DISTINCT FROM o.any_allow                THEN 'red_regression'
    WHEN o.all_allow = e.expected_decision                       THEN 'green'
    ELSE 'red_regression'
  END                                             AS status,
  o.last_seen
FROM expected e
LEFT JOIN observed o
  ON o.role = e.role AND o.permission_key = e.permission_key;

GRANT SELECT ON public.v_authz_shadow_matrix_settings TO authenticated, service_role;

COMMENT ON VIEW public.v_authz_shadow_matrix_settings IS
  'Diagnostic per-cell matrix for the Settings shadow slice. status ∈ {green, red_regression, red_expansion, missing}. Consumed for investigation when the exit-criteria gate is red — not a deployment decision surface.';

------------------------------------------------------------------
-- 2. Gate view: aggregate-only readiness. Drop first (column set changes).
------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_authz_shadow_exit_criteria;

CREATE VIEW public.v_authz_shadow_exit_criteria
WITH (security_invoker = true) AS
WITH
  gate AS (SELECT * FROM public.authz_shadow_slice_gate),
  observed_keys AS (
    SELECT slice, array_agg(DISTINCT permission_key) AS keys
      FROM public.authz_shadow_decisions GROUP BY slice
  ),
  observed_granting_bundles AS (
    SELECT d.slice, array_agg(DISTINCT rb.bundle_key) AS bundles
      FROM public.authz_shadow_decisions d
      JOIN public.user_roles ur         ON ur.user_id = d.user_id
      JOIN public.authz_role_bundles rb ON rb.role    = ur.role
     WHERE d.decision_new = true
     GROUP BY d.slice
  ),
  observed_denying_bundles AS (
    SELECT d.slice, array_agg(DISTINCT rb.bundle_key) AS bundles
      FROM public.authz_shadow_decisions d
      JOIN public.user_roles ur         ON ur.user_id = d.user_id
      JOIN public.authz_role_bundles rb ON rb.role    = ur.role
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
  parity AS (SELECT * FROM public.v_authz_shadow_parity_report),
  matrix_settings AS (
    SELECT
      count(*) FILTER (WHERE expected_decision = true  AND status = 'missing')                          AS pos_missing,
      count(*) FILTER (WHERE expected_decision = true  AND status IN ('red_regression','red_expansion')) AS pos_red,
      count(*) FILTER (WHERE expected_decision = false AND status = 'missing')                          AS neg_missing,
      count(*) FILTER (WHERE expected_decision = false AND status IN ('red_regression','red_expansion')) AS neg_red
    FROM public.v_authz_shadow_matrix_settings
  )
SELECT
  g.slice,
  -- Coverage
  (COALESCE(ok.keys, ARRAY[]::text[])                     @> g.required_keys)              AS every_key_exercised,
  (COALESCE(ogb.bundles, ARRAY[]::text[])                 @> g.required_granting_bundles)  AS every_granting_bundle_exercised,
  (COALESCE(odb.bundles, ARRAY[]::text[])                 @> g.required_denying_bundles)   AS every_denying_bundle_exercised,
  (COALESCE(owr.roles, ARRAY[]::public.app_role[])        @> g.required_write_roles)       AS every_write_role_exercised,
  (COALESCE(odr.roles, ARRAY[]::public.app_role[])        @> g.required_denied_roles)      AS at_least_one_denied_role_exercised,
  -- Parity
  COALESCE(p.parity_green, false)                         AS parity_green,
  -- Positive/negative matrix (settings today; other slices default true until onboarded)
  CASE WHEN g.slice = 'settings'
       THEN COALESCE((SELECT pos_missing FROM matrix_settings), 0) = 0 ELSE true END
                                                          AS positive_matrix_complete,
  CASE WHEN g.slice = 'settings'
       THEN COALESCE((SELECT pos_red     FROM matrix_settings), 0) = 0 ELSE true END
                                                          AS positive_matrix_green,
  CASE WHEN g.slice = 'settings'
       THEN COALESCE((SELECT neg_missing FROM matrix_settings), 0) = 0 ELSE true END
                                                          AS negative_matrix_complete,
  CASE WHEN g.slice = 'settings'
       THEN COALESCE((SELECT neg_red     FROM matrix_settings), 0) = 0 ELSE true END
                                                          AS negative_matrix_green,
  -- Verdict
  (
        (COALESCE(ok.keys,  ARRAY[]::text[])              @> g.required_keys)
    AND (COALESCE(ogb.bundles, ARRAY[]::text[])           @> g.required_granting_bundles)
    AND (COALESCE(odb.bundles, ARRAY[]::text[])           @> g.required_denying_bundles)
    AND (COALESCE(owr.roles, ARRAY[]::public.app_role[])  @> g.required_write_roles)
    AND (COALESCE(odr.roles, ARRAY[]::public.app_role[])  @> g.required_denied_roles)
    AND COALESCE(p.parity_green, false) = true
    AND (
      g.slice <> 'settings'
      OR (
            COALESCE((SELECT pos_missing FROM matrix_settings), 0) = 0
        AND COALESCE((SELECT pos_red     FROM matrix_settings), 0) = 0
        AND COALESCE((SELECT neg_missing FROM matrix_settings), 0) = 0
        AND COALESCE((SELECT neg_red     FROM matrix_settings), 0) = 0
      )
    )
  )                                                       AS ready_for_cutover
FROM gate g
LEFT JOIN observed_keys              ok  ON ok.slice  = g.slice
LEFT JOIN observed_granting_bundles  ogb ON ogb.slice = g.slice
LEFT JOIN observed_denying_bundles   odb ON odb.slice = g.slice
LEFT JOIN observed_write_roles       owr ON owr.slice = g.slice
LEFT JOIN observed_denied_roles      odr ON odr.slice = g.slice
LEFT JOIN parity                     p   ON p.slice   = g.slice;

GRANT SELECT ON public.v_authz_shadow_exit_criteria TO authenticated, service_role;

COMMENT ON VIEW public.v_authz_shadow_exit_criteria IS
  'Deployment gate. Aggregate-only booleans: coverage, parity_green, positive/negative matrix completeness and greenness. ready_for_cutover is the AND of every criterion. Per-cell diagnostics live in v_authz_shadow_matrix_<slice>.';