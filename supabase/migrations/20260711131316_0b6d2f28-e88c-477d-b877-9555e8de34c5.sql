CREATE OR REPLACE VIEW public.v_authz_shadow_matrix_settings AS
WITH gate AS (
  SELECT authz_shadow_slice_gate.required_keys,
         authz_shadow_slice_gate.required_write_roles || authz_shadow_slice_gate.required_denied_roles AS all_roles
  FROM authz_shadow_slice_gate
  WHERE authz_shadow_slice_gate.slice = 'settings'::text
),
cells AS (
  SELECT r.r::text AS role, k.k AS permission_key
  FROM gate g,
       LATERAL unnest(g.all_roles) r(r),
       LATERAL unnest(g.required_keys) k(k)
),
expected AS (
  SELECT c.role,
         c.permission_key,
         (
           COALESCE((
             SELECT 'edit'::text = ANY (rp.actions)
             FROM role_permissions rp
             WHERE rp.role = c.role AND rp.module = 'settings'::text
             LIMIT 1
           ), false)
           OR EXISTS (
             SELECT 1
             FROM authz_shadow_expected_expansions e
             WHERE e.slice = 'settings'::text
               AND e.permission_key = c.permission_key
               AND e.actor_role::text = c.role
           )
         ) AS expected_decision
  FROM cells c
),
observed AS (
  SELECT ur.role::text AS role,
         d.permission_key,
         count(*) AS observations,
         count(*) FILTER (WHERE d.decision_legacy AND NOT d.decision_new) AS regressions,
         count(*) FILTER (
           WHERE NOT d.decision_legacy AND d.decision_new
             AND NOT EXISTS (
               SELECT 1 FROM authz_shadow_expected_expansions e_1
               WHERE e_1.slice = d.slice AND e_1.permission_key = d.permission_key
             )
         ) AS unexpected_expansions,
         bool_and(d.decision_new) AS all_allow,
         bool_or(d.decision_new)  AS any_allow,
         max(d.created_at) AS last_seen
  FROM authz_shadow_decisions d
  JOIN user_roles ur ON ur.user_id = d.user_id
  WHERE d.slice = 'settings'::text
  GROUP BY ur.role, d.permission_key
)
SELECT e.role,
       e.permission_key,
       e.expected_decision,
       CASE
         WHEN o.observations IS NULL THEN NULL::boolean
         WHEN o.all_allow = o.any_allow THEN o.all_allow
         ELSE NULL::boolean
       END AS observed_decision,
       COALESCE(o.observations, 0::bigint) AS observations,
       COALESCE(o.regressions, 0::bigint) AS regressions,
       COALESCE(o.unexpected_expansions, 0::bigint) AS unexpected_expansions,
       CASE
         WHEN o.observations IS NULL THEN 'missing'::text
         WHEN COALESCE(o.regressions, 0::bigint) > 0 THEN 'red_regression'::text
         WHEN COALESCE(o.unexpected_expansions, 0::bigint) > 0 THEN 'red_expansion'::text
         WHEN o.all_allow IS DISTINCT FROM o.any_allow THEN 'red_regression'::text
         WHEN o.all_allow = e.expected_decision THEN 'green'::text
         ELSE 'red_regression'::text
       END AS status,
       o.last_seen
FROM expected e
LEFT JOIN observed o
  ON o.role = e.role AND o.permission_key = e.permission_key;