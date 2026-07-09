
-- =========================================================================
-- Shadow log — forensic reproducibility (additive, non-behavioral).
-- Every recorded decision becomes self-describing: permission key, resolved
-- bundles, effective-permission trace, catalog row snapshot, authz model
-- version. No changes to caller signature.
-- =========================================================================

ALTER TABLE public.authz_shadow_decisions
  ADD COLUMN IF NOT EXISTS resolved_bundles       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS effective_permission   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS catalog_row_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.authz_shadow_decisions.resolved_bundles IS
  'JSON array of bundle_keys the user resolved to at record time (via user_roles ⋈ authz_role_bundles). Frozen — do not recompute.';
COMMENT ON COLUMN public.authz_shadow_decisions.effective_permission IS
  'Trace of how the new-model decision was reached: { key, allowed, granting_bundles:[{bundle_key, via:"direct"|"implies", implied_from?}], denied_reason? }. Frozen at record time.';
COMMENT ON COLUMN public.authz_shadow_decisions.catalog_row_snapshot IS
  'Frozen copy of authz_permissions row for the evaluated key at record time. Allows historical reconstruction even after catalog edits.';

------------------------------------------------------------------
-- Recorder v3 — auto-captures forensic snapshot.
-- Same public signature as v2; drop-in replacement.
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
  _bundles       jsonb;
  _bundle_keys   text[];
  _granting      jsonb;
  _catalog_row   jsonb;
  _effective     jsonb;
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

  -- Role snapshot
  SELECT COALESCE(
           jsonb_build_object(
             'roles',
             COALESCE(
               (SELECT jsonb_agg(DISTINCT ur.role::text ORDER BY ur.role::text)
                  FROM public.user_roles ur WHERE ur.user_id = _uid),
               '[]'::jsonb)
           ), '{}'::jsonb)
    INTO _roles;

  -- Resolved bundles (frozen at record time)
  SELECT COALESCE(array_agg(DISTINCT rb.bundle_key ORDER BY rb.bundle_key), ARRAY[]::text[])
    INTO _bundle_keys
    FROM public.user_roles ur
    JOIN public.authz_role_bundles rb ON rb.role = ur.role
   WHERE ur.user_id = _uid;

  _bundles := to_jsonb(_bundle_keys);

  -- Frozen catalog row for this key
  SELECT to_jsonb(p.*) INTO _catalog_row
    FROM public.authz_permissions p
   WHERE p.key = _permission_key
   LIMIT 1;
  _catalog_row := COALESCE(_catalog_row, '{}'::jsonb);

  -- Effective-permission trace: which held bundle grants _permission_key
  -- either directly or transitively via authz_bundle_implies.
  BEGIN
    WITH held AS (
      SELECT unnest(_bundle_keys) AS bundle_key
    ),
    reach AS (
      -- transitive closure of implications from held bundles
      SELECT h.bundle_key AS root, h.bundle_key AS reached, 'direct'::text AS via
        FROM held h
      UNION
      SELECT r.root, i.implied_bundle_key, 'implies'::text
        FROM authz_bundle_implies i
        JOIN (
          SELECT h.bundle_key AS root, h.bundle_key AS reached FROM held h
          UNION
          SELECT r2.root, r2.reached FROM reach r2
        ) r ON r.reached = i.bundle_key
    ),
    grants AS (
      SELECT DISTINCT r.root AS bundle_key,
             CASE WHEN r.root = r.reached THEN 'direct' ELSE 'implies' END AS via,
             NULLIF(r.reached, r.root) AS implied_from
        FROM reach r
        JOIN public.authz_bundle_permissions bp
          ON bp.bundle_key = r.reached
       WHERE bp.permission_key = _permission_key
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'bundle_key',   g.bundle_key,
               'via',          g.via,
               'implied_from', g.implied_from
             ) ORDER BY g.bundle_key
           )
      INTO _granting
      FROM grants g;
  EXCEPTION WHEN OTHERS THEN
    _granting := NULL;
  END;

  _effective := jsonb_build_object(
    'key',               _permission_key,
    'allowed',           _decision_new,
    'granting_bundles',  COALESCE(_granting, '[]'::jsonb),
    'resolver',          'has_permission',
    'model_fingerprint', _fingerprint
  );

  INSERT INTO public.authz_shadow_decisions (
    slice, permission_key, user_id,
    decision_legacy, decision_new,
    context,
    authz_fingerprint, catalog_version, bundle_version,
    role_snapshot, app_version, request_source,
    resolved_bundles, effective_permission, catalog_row_snapshot
  ) VALUES (
    _slice, _permission_key, _uid,
    _decision_legacy, _decision_new,
    COALESCE(_context, '{}'::jsonb),
    _fingerprint, _cat_version, _bun_version,
    _roles, _app_version, _src,
    _bundles, _effective, _catalog_row
  );
END;
$$;

REVOKE ALL ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,text,text,jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.authz_record_shadow_decision(text,text,boolean,boolean,text,text,jsonb) IS
  'Records one shadow-mode decision with forensic reproducibility: authz fingerprint, catalog/bundle version, role snapshot, resolved bundles, effective-permission trace (direct + implied grants), and frozen catalog row. Never affects access.';
