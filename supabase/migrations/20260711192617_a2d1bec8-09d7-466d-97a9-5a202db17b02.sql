
-- Sprint 1 Hardening: defense-in-depth for cron secret helpers and authz version RPCs

-- 1. Cron secret helpers: explicit REVOKEs (idempotent; current grants are already service_role only)
REVOKE ALL ON FUNCTION public._get_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._get_cron_secret() FROM anon;
REVOKE ALL ON FUNCTION public._get_cron_secret() FROM authenticated;
GRANT EXECUTE ON FUNCTION public._get_cron_secret() TO service_role;

REVOKE ALL ON FUNCTION public._set_cron_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._set_cron_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public._set_cron_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._set_cron_secret(text) TO service_role;

-- 2. authz_current_versions: add auth.uid() null guard (convert SQL -> plpgsql, same signature)
CREATE OR REPLACE FUNCTION public.authz_current_versions()
 RETURNS TABLE(artifact_type text, semver text, checksum text, activated_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.artifact_type, v.semver, v.checksum, v.activated_at
    FROM public.authz_versions v
    WHERE v.status = 'active';
END;
$function$;

-- 3. authz_current_version(text): add auth.uid() null guard (convert SQL -> plpgsql)
CREATE OR REPLACE FUNCTION public.authz_current_version(_artifact_type text)
 RETURNS TABLE(id uuid, artifact_type text, semver text, checksum text, activated_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.id, v.artifact_type, v.semver, v.checksum, v.activated_at
    FROM public.authz_versions v
    WHERE v.artifact_type = _artifact_type
      AND v.status = 'active'
    LIMIT 1;
END;
$function$;

-- 4. authz_current_state: prepend auth.uid() null guard; body otherwise unchanged
CREATE OR REPLACE FUNCTION public.authz_current_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_versions              jsonb;
  v_active_type_count     int;
  v_catalog_count         int;
  v_catalog_deprecated    int;
  v_catalog_fingerprint   text;
  v_bundle_count          int;
  v_bundle_perm_count     int;
  v_bundle_implies_count  int;
  v_role_binding_count    int;
  v_effective_count       int;
  v_rpc_definer_count     int;
  v_completeness          boolean;
  v_compatibility_issues  jsonb := '[]'::jsonb;
  v_integrity             text  := 'ok';
  v_generated_at          timestamptz := now();
  v_state_id              uuid;
  v_fingerprint_input     text;
  v_fingerprint           text;
  v_expected_types constant text[] := ARRAY[
    'permission_catalog','bundle','role_binding',
    'authz_catalog','rpc_manifest','rls_inventory','golden_baseline'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_object_agg(artifact_type,
                          jsonb_build_object('semver', semver,
                                             'checksum', checksum,
                                             'activated_at', activated_at))
  INTO v_versions
  FROM public.authz_versions
  WHERE status = 'active';

  v_versions := COALESCE(v_versions, '{}'::jsonb);

  SELECT count(DISTINCT artifact_type)
  INTO v_active_type_count
  FROM public.authz_versions
  WHERE status = 'active'
    AND artifact_type = ANY(v_expected_types);

  v_completeness := v_active_type_count = array_length(v_expected_types, 1);

  IF NOT v_completeness THEN
    v_compatibility_issues := v_compatibility_issues
      || jsonb_build_object(
           'code', 'D-1',
           'severity', 'block',
           'message', 'Missing active version for one or more required artifact_types');
    v_integrity := 'fail';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE deprecated_at IS NOT NULL),
         md5(string_agg(key, ',' ORDER BY key))
    INTO v_catalog_count, v_catalog_deprecated, v_catalog_fingerprint
    FROM public.authz_permissions;

  SELECT count(*) INTO v_bundle_count         FROM public.authz_bundles;
  SELECT count(*) INTO v_bundle_perm_count    FROM public.authz_bundle_permissions;
  SELECT count(*) INTO v_bundle_implies_count FROM public.authz_bundle_implies;

  SELECT count(*) INTO v_role_binding_count FROM public.authz_role_bundles;
  SELECT count(*) INTO v_effective_count    FROM public.v_authz_effective_permissions;

  SELECT count(*)
    INTO v_rpc_definer_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef = true;

  DECLARE
    v_cat_major int;
    v_bun_major int;
    v_rb_major  int;
    v_agg_major int;
    v_rpc_semver text;
    v_cat_semver text;
    v_extract text := '^([0-9]+)\.';
  BEGIN
    v_cat_major := NULLIF((v_versions#>>'{permission_catalog,semver}'), '');
    v_cat_major := (regexp_match(COALESCE(v_versions#>>'{permission_catalog,semver}',''), v_extract))[1]::int;
    v_bun_major := (regexp_match(COALESCE(v_versions#>>'{bundle,semver}',''),             v_extract))[1]::int;
    v_rb_major  := (regexp_match(COALESCE(v_versions#>>'{role_binding,semver}',''),       v_extract))[1]::int;
    v_agg_major := (regexp_match(COALESCE(v_versions#>>'{authz_catalog,semver}',''),      v_extract))[1]::int;
    v_rpc_semver := COALESCE(v_versions#>>'{rpc_manifest,semver}', '');
    v_cat_semver := COALESCE(v_versions#>>'{permission_catalog,semver}', '');

    IF v_cat_major IS NOT NULL AND v_bun_major IS NOT NULL
       AND v_cat_major <> v_bun_major THEN
      v_compatibility_issues := v_compatibility_issues
        || jsonb_build_object('code','D-3','severity','block',
             'message','Bundle major differs from Catalog major');
      v_integrity := 'fail';
    END IF;

    IF v_bun_major IS NOT NULL AND v_rb_major IS NOT NULL
       AND v_bun_major <> v_rb_major THEN
      v_compatibility_issues := v_compatibility_issues
        || jsonb_build_object('code','D-4','severity','block',
             'message','Role Binding major differs from Bundle major');
      v_integrity := 'fail';
    END IF;

    IF v_agg_major IS NOT NULL AND v_cat_major IS NOT NULL
       AND v_agg_major < GREATEST(v_cat_major,
                                  COALESCE(v_bun_major,0),
                                  COALESCE(v_rb_major,0)) THEN
      v_compatibility_issues := v_compatibility_issues
        || jsonb_build_object('code','D-9','severity','block',
             'message','Aggregate authz_catalog major behind triad MAX');
      v_integrity := 'fail';
    END IF;

    IF v_rpc_semver <> '' AND v_cat_semver <> ''
       AND v_rpc_semver > v_cat_semver THEN
      v_compatibility_issues := v_compatibility_issues
        || jsonb_build_object('code','D-5','severity','warn',
             'message','RPC Manifest semver ahead of Catalog semver');
      IF v_integrity = 'ok' THEN v_integrity := 'warn'; END IF;
    END IF;
  END;

  v_fingerprint_input := coalesce(v_versions::text,'')
    || '|cat=' || v_catalog_count || ':' || v_catalog_deprecated
    || '|catfp=' || coalesce(v_catalog_fingerprint,'')
    || '|bun=' || v_bundle_count || ':' || v_bundle_perm_count
                 || ':' || v_bundle_implies_count
    || '|rb='  || v_role_binding_count
    || '|eff=' || v_effective_count
    || '|rpc=' || v_rpc_definer_count;
  v_fingerprint := md5(v_fingerprint_input);

  v_state_id := ('00000000-0000-0000-0000-' || substr(v_fingerprint,1,12))::uuid;

  RETURN jsonb_build_object(
    'authorization_state_id', v_state_id,
    'generated_at',           v_generated_at,
    'fingerprint',            v_fingerprint,
    'completeness',           v_completeness,
    'integrity_status',       v_integrity,
    'compatibility_status',   CASE
                                WHEN jsonb_array_length(v_compatibility_issues) = 0
                                THEN 'compatible'
                                ELSE 'issues_detected'
                              END,
    'compatibility_issues',   v_compatibility_issues,
    'active_versions',        v_versions,
    'counts', jsonb_build_object(
      'permission_catalog',        v_catalog_count,
      'permission_catalog_deprecated', v_catalog_deprecated,
      'bundles',                   v_bundle_count,
      'bundle_permissions',        v_bundle_perm_count,
      'bundle_implies',            v_bundle_implies_count,
      'role_bindings',             v_role_binding_count,
      'effective_permissions',     v_effective_count,
      'security_definer_rpcs',     v_rpc_definer_count
    )
  );
END;
$function$;
