
-- =========================================================================
-- Settings vertical slice — Shadow instrumentation (additive only).
-- =========================================================================

-- 1) Batch permission checker (read-only). Answers the "new" decision for
--    each requested key using has_permission(). No side effects.
CREATE OR REPLACE FUNCTION public.authz_has_permissions(_keys text[])
RETURNS TABLE(permission_key text, allowed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k, public.has_permission(auth.uid(), k)
  FROM unnest(COALESCE(_keys, ARRAY[]::text[])) AS k
$$;

REVOKE ALL ON FUNCTION public.authz_has_permissions(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.authz_has_permissions(text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.authz_has_permissions(text[]) IS
  'Batch resolver for the NEW authorization model. Returns (key, allowed) for the current user. Never mutates. Consumed by shadow-mode probes and by post-cutover UI.';

-- 2) Enforce append-only on the shadow log. Direct INSERT/UPDATE/DELETE from
--    signed-in users must be impossible; only the SECURITY DEFINER recorder
--    from Migration 1 may write.
REVOKE INSERT, UPDATE, DELETE ON public.authz_shadow_decisions FROM authenticated, anon;

-- Belt-and-braces: block any UPDATE/DELETE attempt at policy layer too.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='authz_shadow_decisions' AND policyname='shadow log: no direct writes') THEN
    CREATE POLICY "shadow log: no direct writes"
      ON public.authz_shadow_decisions
      FOR ALL
      TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- 3) Admin-visible parity report view.
CREATE OR REPLACE VIEW public.v_authz_shadow_parity_report
WITH (security_invoker = true) AS
WITH totals AS (
  SELECT
    slice,
    count(*)                                              AS total_decisions,
    count(*) FILTER (WHERE match = false)                 AS mismatches,
    count(DISTINCT permission_key)                        AS unique_keys,
    count(DISTINCT user_id)                               AS unique_users,
    count(*) FILTER (WHERE decision_legacy)               AS legacy_allow,
    count(*) FILTER (WHERE NOT decision_legacy)           AS legacy_deny,
    count(*) FILTER (WHERE decision_new)                  AS new_allow,
    count(*) FILTER (WHERE NOT decision_new)              AS new_deny,
    min(created_at)                                       AS first_seen_at,
    max(created_at)                                       AS last_seen_at
  FROM public.authz_shadow_decisions
  GROUP BY slice
)
SELECT
  slice,
  total_decisions,
  mismatches,
  unique_keys,
  unique_users,
  legacy_allow,
  legacy_deny,
  new_allow,
  new_deny,
  first_seen_at,
  last_seen_at,
  (mismatches = 0)                                        AS ready_for_cutover
FROM totals;

GRANT SELECT ON public.v_authz_shadow_parity_report TO authenticated, service_role;

COMMENT ON VIEW public.v_authz_shadow_parity_report IS
  'Per-slice shadow-parity summary. Cutover requires mismatches = 0 AND coverage thresholds met (verified separately per slice).';

-- 4) Per-key coverage view — proves every catalog key was exercised.
CREATE OR REPLACE VIEW public.v_authz_shadow_key_coverage
WITH (security_invoker = true) AS
SELECT
  slice,
  permission_key,
  count(*)                                          AS decisions,
  count(*) FILTER (WHERE match = false)             AS mismatches,
  count(DISTINCT user_id)                           AS unique_users,
  min(created_at)                                   AS first_seen_at,
  max(created_at)                                   AS last_seen_at
FROM public.authz_shadow_decisions
GROUP BY slice, permission_key;

GRANT SELECT ON public.v_authz_shadow_key_coverage TO authenticated, service_role;
