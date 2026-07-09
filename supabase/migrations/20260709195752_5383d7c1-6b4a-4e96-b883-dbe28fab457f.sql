
-- Refine parity report: split regressions vs. intentional expansions.
DROP VIEW IF EXISTS public.v_authz_shadow_parity_report;

CREATE VIEW public.v_authz_shadow_parity_report
WITH (security_invoker = true) AS
SELECT
  slice,
  count(*)                                                             AS total_decisions,
  count(*) FILTER (WHERE decision_legacy AND NOT decision_new)         AS regressions,
  count(*) FILTER (WHERE NOT decision_legacy AND decision_new)         AS expansions,
  count(*) FILTER (WHERE match = false)                                AS total_mismatches,
  count(DISTINCT permission_key)                                       AS unique_keys,
  count(DISTINCT user_id)                                              AS unique_users,
  count(*) FILTER (WHERE decision_legacy)                              AS legacy_allow,
  count(*) FILTER (WHERE NOT decision_legacy)                          AS legacy_deny,
  count(*) FILTER (WHERE decision_new)                                 AS new_allow,
  count(*) FILTER (WHERE NOT decision_new)                             AS new_deny,
  min(created_at)                                                      AS first_seen_at,
  max(created_at)                                                      AS last_seen_at,
  (count(*) FILTER (WHERE decision_legacy AND NOT decision_new) = 0)   AS no_regressions
FROM public.authz_shadow_decisions
GROUP BY slice;

GRANT SELECT ON public.v_authz_shadow_parity_report TO authenticated, service_role;

COMMENT ON VIEW public.v_authz_shadow_parity_report IS
  'Per-slice shadow parity summary. Cutover requires: no_regressions=true, unique_keys covers the slice catalog, and per-role coverage verified separately. Expansions are expected where the frozen spec widens access.';
