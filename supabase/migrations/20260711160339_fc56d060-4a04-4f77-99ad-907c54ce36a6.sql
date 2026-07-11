-- Invoices / Finance vertical slice — Migration 1 (shadow).
INSERT INTO public.authz_shadow_slice_gate (
  slice, required_keys, required_write_roles, required_denied_roles,
  required_granting_bundles, required_denying_bundles, notes
) VALUES (
  'invoices',
  ARRAY['invoices.view','invoices.create','invoices.edit','invoices.delete','invoices.export']::text[],
  ARRAY['admin','accountant','receptionist']::app_role[],
  ARRAY['staff']::app_role[],
  ARRAY['bundle.role.admin','bundle.role.accountant','bundle.role.receptionist']::text[],
  ARRAY['bundle.role.staff']::text[],
  'Invoices / Finance vertical slice — Migration 1 shadow. Legacy invoices module actions map 1:1 to canonical keys; no intentional expansions.'
)
ON CONFLICT (slice) DO UPDATE SET
  required_keys              = EXCLUDED.required_keys,
  required_write_roles       = EXCLUDED.required_write_roles,
  required_denied_roles      = EXCLUDED.required_denied_roles,
  required_granting_bundles  = EXCLUDED.required_granting_bundles,
  required_denying_bundles   = EXCLUDED.required_denying_bundles,
  notes                      = EXCLUDED.notes,
  updated_at                 = now();

CREATE OR REPLACE VIEW public.v_authz_shadow_matrix_invoices AS
WITH gate AS (
  SELECT g.required_keys,
         g.required_write_roles || g.required_denied_roles AS all_roles
  FROM public.authz_shadow_slice_gate g
  WHERE g.slice = 'invoices'
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
             SELECT split_part(c.permission_key, '.', 2) = ANY (rp.actions)
             FROM public.role_permissions rp
             WHERE rp.role = c.role AND rp.module = 'invoices'
             LIMIT 1
           ), false)
           OR EXISTS (
             SELECT 1
             FROM public.authz_shadow_expected_expansions e
             WHERE e.slice = 'invoices'
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
               SELECT 1 FROM public.authz_shadow_expected_expansions e_1
               WHERE e_1.slice = d.slice AND e_1.permission_key = d.permission_key
             )
         ) AS unexpected_expansions,
         bool_and(d.decision_new) AS all_allow,
         bool_or(d.decision_new)  AS any_allow,
         max(d.created_at) AS last_seen
  FROM public.authz_shadow_decisions d
  JOIN public.user_roles ur ON ur.user_id = d.user_id
  WHERE d.slice = 'invoices'
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

GRANT SELECT ON public.v_authz_shadow_matrix_invoices TO authenticated;
GRANT ALL    ON public.v_authz_shadow_matrix_invoices TO service_role;

CREATE OR REPLACE VIEW public.v_authz_shadow_exit_criteria AS
WITH gate AS (
  SELECT g.slice, g.required_keys, g.required_granting_bundles, g.required_denying_bundles,
         g.required_write_roles, g.required_denied_roles, g.notes, g.created_at, g.updated_at
  FROM public.authz_shadow_slice_gate g
),
observed_keys AS (
  SELECT d.slice, array_agg(DISTINCT d.permission_key) AS keys
  FROM public.authz_shadow_decisions d GROUP BY d.slice
),
observed_granting_bundles AS (
  SELECT d.slice, array_agg(DISTINCT rb.bundle_key) AS bundles
  FROM public.authz_shadow_decisions d
  JOIN public.user_roles ur ON ur.user_id = d.user_id
  JOIN public.authz_role_bundles rb ON rb.role = ur.role
  WHERE d.decision_new = true GROUP BY d.slice
),
observed_denying_bundles AS (
  SELECT d.slice, array_agg(DISTINCT rb.bundle_key) AS bundles
  FROM public.authz_shadow_decisions d
  JOIN public.user_roles ur ON ur.user_id = d.user_id
  JOIN public.authz_role_bundles rb ON rb.role = ur.role
  WHERE d.decision_new = false GROUP BY d.slice
),
observed_write_roles AS (
  SELECT d.slice, array_agg(DISTINCT ur.role) AS roles
  FROM public.authz_shadow_decisions d
  JOIN public.user_roles ur ON ur.user_id = d.user_id
  WHERE d.decision_new = true GROUP BY d.slice
),
observed_denied_roles AS (
  SELECT d.slice, array_agg(DISTINCT ur.role) AS roles
  FROM public.authz_shadow_decisions d
  JOIN public.user_roles ur ON ur.user_id = d.user_id
  WHERE d.decision_new = false GROUP BY d.slice
),
parity AS (
  SELECT p.slice, p.total_decisions, p.regressions, p.unexpected_expansions,
         p.expected_expansions, p.matches, p.unique_keys, p.unique_users,
         p.legacy_allow, p.legacy_deny, p.new_allow, p.new_deny,
         p.first_seen_at, p.last_seen_at, p.parity_green
  FROM public.v_authz_shadow_parity_report p
),
matrix_settings AS (
  SELECT
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = 'missing')                                          AS pos_missing,
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS pos_red,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = 'missing')                                          AS neg_missing,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS neg_red
  FROM public.v_authz_shadow_matrix_settings m
),
matrix_patients AS (
  SELECT
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = 'missing')                                          AS pos_missing,
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS pos_red,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = 'missing')                                          AS neg_missing,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS neg_red
  FROM public.v_authz_shadow_matrix_patients m
),
matrix_medical_records AS (
  SELECT
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = 'missing')                                          AS pos_missing,
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS pos_red,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = 'missing')                                          AS neg_missing,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS neg_red
  FROM public.v_authz_shadow_matrix_medical_records m
),
matrix_hr AS (
  SELECT
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = 'missing')                                          AS pos_missing,
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS pos_red,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = 'missing')                                          AS neg_missing,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS neg_red
  FROM public.v_authz_shadow_matrix_hr m
),
matrix_invoices AS (
  SELECT
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = 'missing')                                          AS pos_missing,
    count(*) FILTER (WHERE m.expected_decision = true  AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS pos_red,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = 'missing')                                          AS neg_missing,
    count(*) FILTER (WHERE m.expected_decision = false AND m.status = ANY (ARRAY['red_regression','red_expansion']))      AS neg_red
  FROM public.v_authz_shadow_matrix_invoices m
)
SELECT g.slice,
       (COALESCE(ok.keys, ARRAY[]::text[]) @> g.required_keys) AS every_key_exercised,
       (COALESCE(ogb.bundles, ARRAY[]::text[]) @> g.required_granting_bundles) AS every_granting_bundle_exercised,
       (COALESCE(odb.bundles, ARRAY[]::text[]) @> g.required_denying_bundles)  AS every_denying_bundle_exercised,
       (COALESCE(owr.roles, ARRAY[]::app_role[]) @> g.required_write_roles)    AS every_write_role_exercised,
       (COALESCE(odr.roles, ARRAY[]::app_role[]) @> g.required_denied_roles)   AS at_least_one_denied_role_exercised,
       COALESCE(p.parity_green, false) AS parity_green,
       CASE
         WHEN g.slice = 'settings'        THEN (COALESCE((SELECT pos_missing FROM matrix_settings), 0::bigint) = 0)
         WHEN g.slice = 'patients'        THEN (COALESCE((SELECT pos_missing FROM matrix_patients), 0::bigint) = 0)
         WHEN g.slice = 'medical_records' THEN (COALESCE((SELECT pos_missing FROM matrix_medical_records), 0::bigint) = 0)
         WHEN g.slice = 'hr'              THEN (COALESCE((SELECT pos_missing FROM matrix_hr), 0::bigint) = 0)
         WHEN g.slice = 'invoices'        THEN (COALESCE((SELECT pos_missing FROM matrix_invoices), 0::bigint) = 0)
         ELSE true
       END AS positive_matrix_complete,
       CASE
         WHEN g.slice = 'settings'        THEN (COALESCE((SELECT pos_red FROM matrix_settings), 0::bigint) = 0)
         WHEN g.slice = 'patients'        THEN (COALESCE((SELECT pos_red FROM matrix_patients), 0::bigint) = 0)
         WHEN g.slice = 'medical_records' THEN (COALESCE((SELECT pos_red FROM matrix_medical_records), 0::bigint) = 0)
         WHEN g.slice = 'hr'              THEN (COALESCE((SELECT pos_red FROM matrix_hr), 0::bigint) = 0)
         WHEN g.slice = 'invoices'        THEN (COALESCE((SELECT pos_red FROM matrix_invoices), 0::bigint) = 0)
         ELSE true
       END AS positive_matrix_green,
       CASE
         WHEN g.slice = 'settings'        THEN (COALESCE((SELECT neg_missing FROM matrix_settings), 0::bigint) = 0)
         WHEN g.slice = 'patients'        THEN (COALESCE((SELECT neg_missing FROM matrix_patients), 0::bigint) = 0)
         WHEN g.slice = 'medical_records' THEN (COALESCE((SELECT neg_missing FROM matrix_medical_records), 0::bigint) = 0)
         WHEN g.slice = 'hr'              THEN (COALESCE((SELECT neg_missing FROM matrix_hr), 0::bigint) = 0)
         WHEN g.slice = 'invoices'        THEN (COALESCE((SELECT neg_missing FROM matrix_invoices), 0::bigint) = 0)
         ELSE true
       END AS negative_matrix_complete,
       CASE
         WHEN g.slice = 'settings'        THEN (COALESCE((SELECT neg_red FROM matrix_settings), 0::bigint) = 0)
         WHEN g.slice = 'patients'        THEN (COALESCE((SELECT neg_red FROM matrix_patients), 0::bigint) = 0)
         WHEN g.slice = 'medical_records' THEN (COALESCE((SELECT neg_red FROM matrix_medical_records), 0::bigint) = 0)
         WHEN g.slice = 'hr'              THEN (COALESCE((SELECT neg_red FROM matrix_hr), 0::bigint) = 0)
         WHEN g.slice = 'invoices'        THEN (COALESCE((SELECT neg_red FROM matrix_invoices), 0::bigint) = 0)
         ELSE true
       END AS negative_matrix_green,
       (
         (COALESCE(ok.keys, ARRAY[]::text[]) @> g.required_keys)
         AND (COALESCE(ogb.bundles, ARRAY[]::text[]) @> g.required_granting_bundles)
         AND (COALESCE(odb.bundles, ARRAY[]::text[]) @> g.required_denying_bundles)
         AND (COALESCE(owr.roles, ARRAY[]::app_role[]) @> g.required_write_roles)
         AND (COALESCE(odr.roles, ARRAY[]::app_role[]) @> g.required_denied_roles)
         AND COALESCE(p.parity_green, false)
         AND CASE
           WHEN g.slice = 'settings'        THEN (COALESCE((SELECT pos_missing FROM matrix_settings), 0::bigint) = 0 AND COALESCE((SELECT pos_red FROM matrix_settings), 0::bigint) = 0 AND COALESCE((SELECT neg_missing FROM matrix_settings), 0::bigint) = 0 AND COALESCE((SELECT neg_red FROM matrix_settings), 0::bigint) = 0)
           WHEN g.slice = 'patients'        THEN (COALESCE((SELECT pos_missing FROM matrix_patients), 0::bigint) = 0 AND COALESCE((SELECT pos_red FROM matrix_patients), 0::bigint) = 0 AND COALESCE((SELECT neg_missing FROM matrix_patients), 0::bigint) = 0 AND COALESCE((SELECT neg_red FROM matrix_patients), 0::bigint) = 0)
           WHEN g.slice = 'medical_records' THEN (COALESCE((SELECT pos_missing FROM matrix_medical_records), 0::bigint) = 0 AND COALESCE((SELECT pos_red FROM matrix_medical_records), 0::bigint) = 0 AND COALESCE((SELECT neg_missing FROM matrix_medical_records), 0::bigint) = 0 AND COALESCE((SELECT neg_red FROM matrix_medical_records), 0::bigint) = 0)
           WHEN g.slice = 'hr'              THEN (COALESCE((SELECT pos_missing FROM matrix_hr), 0::bigint) = 0 AND COALESCE((SELECT pos_red FROM matrix_hr), 0::bigint) = 0 AND COALESCE((SELECT neg_missing FROM matrix_hr), 0::bigint) = 0 AND COALESCE((SELECT neg_red FROM matrix_hr), 0::bigint) = 0)
           WHEN g.slice = 'invoices'        THEN (COALESCE((SELECT pos_missing FROM matrix_invoices), 0::bigint) = 0 AND COALESCE((SELECT pos_red FROM matrix_invoices), 0::bigint) = 0 AND COALESCE((SELECT neg_missing FROM matrix_invoices), 0::bigint) = 0 AND COALESCE((SELECT neg_red FROM matrix_invoices), 0::bigint) = 0)
           ELSE true
         END
       ) AS ready_for_cutover,
       g.notes, g.updated_at
FROM gate g
LEFT JOIN observed_keys ok            ON ok.slice  = g.slice
LEFT JOIN observed_granting_bundles ogb ON ogb.slice = g.slice
LEFT JOIN observed_denying_bundles  odb ON odb.slice = g.slice
LEFT JOIN observed_write_roles      owr ON owr.slice = g.slice
LEFT JOIN observed_denied_roles     odr ON odr.slice = g.slice
LEFT JOIN parity                    p   ON p.slice   = g.slice;

GRANT SELECT ON public.v_authz_shadow_exit_criteria TO authenticated;
GRANT ALL    ON public.v_authz_shadow_exit_criteria TO service_role;