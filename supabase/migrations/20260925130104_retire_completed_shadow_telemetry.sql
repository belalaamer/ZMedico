-- Retire runtime shadow telemetry for authorization slices whose cutover is complete.
--
-- Historical authz_shadow_decisions remain untouched so exit/parity evidence is
-- preserved. This gate only prevents new redundant rows and avoids doing the
-- expensive snapshot/bundle-resolution work for completed slices.

ALTER TABLE public.authz_shadow_slice_gate
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.authz_shadow_slice_gate
SET is_active = false,
    updated_at = now()
WHERE slice IN ('settings','patients','medical_records','hr','invoices');

CREATE OR REPLACE FUNCTION public.authz_record_shadow_decision(
  _slice text,
  _permission_key text,
  _decision_legacy boolean,
  _decision_new boolean,
  _app_version text,
  _request_source text,
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- A row marked inactive means the slice completed canonical cutover.
  -- Missing rows remain eligible so future experimental slices can still
  -- collect shadow data before they are formally registered.
  IF EXISTS (
    SELECT 1
    FROM public.authz_shadow_slice_gate g
    WHERE g.slice = _slice
      AND g.is_active = false
  ) THEN
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
           ), '{}'::jsonb)
    INTO _roles;

  SELECT COALESCE(array_agg(DISTINCT rb.bundle_key ORDER BY rb.bundle_key), ARRAY[]::text[])
    INTO _bundle_keys
    FROM public.user_roles ur
    JOIN public.authz_role_bundles rb ON rb.role = ur.role
   WHERE ur.user_id = _uid;

  _bundles := to_jsonb(_bundle_keys);

  SELECT to_jsonb(p.*) INTO _catalog_row
    FROM public.authz_permissions p
   WHERE p.key = _permission_key
   LIMIT 1;
  _catalog_row := COALESCE(_catalog_row, '{}'::jsonb);

  BEGIN
    WITH held AS (
      SELECT unnest(_bundle_keys) AS bundle_key
    ),
    reach AS (
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
$function$;
