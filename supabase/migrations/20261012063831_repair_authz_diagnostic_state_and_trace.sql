-- ZMED-226: repair two stale authorization-diagnostics contracts. These
-- routines observe/record shadow decisions only; they never grant access.
do $migration$
declare
  v_state regprocedure := 'public.authz_current_state()'::regprocedure;
  v_shadow regprocedure := 'public.authz_record_shadow_decision(text,text,boolean,boolean,text,text,jsonb)'::regprocedure;
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(v_state) into v_definition;
  if md5(v_definition) <> '14b4ad86c5c7756932f9c7b15af2436f' then
    raise exception 'authz_current_state definition drifted; review before applying';
  end if;
  v_old := 'count(*) FILTER (WHERE deprecated_at IS NOT NULL)';
  v_new := 'count(*) FILTER (WHERE deprecated IS TRUE)';
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Expected one stale permission deprecation expression';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  -- The following line assigns a semantic-version string (for example 1.2.0)
  -- directly to an integer immediately before the correct regexp parser. It
  -- raises 42804 whenever a real catalog version is present.
  v_old := 'v_cat_major := NULLIF((v_versions#>>''{permission_catalog,semver}''), '''');';
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Expected one invalid catalog major assignment';
  end if;
  v_definition := replace(v_definition, v_old, '-- catalog major is parsed by the regexp assignment below');
  execute v_definition;

  select pg_get_functiondef(v_shadow) into v_definition;
  if md5(v_definition) <> 'e5a3e23e255995228d6e9625511c0fdb' then
    raise exception 'authz_record_shadow_decision definition drifted; review before applying';
  end if;
  v_old := E'    WITH held AS (\n      SELECT unnest(_bundle_keys) AS bundle_key\n    ),\n    reach AS (\n      SELECT h.bundle_key AS root, h.bundle_key AS reached, ''direct''::text AS via\n        FROM held h\n      UNION\n      SELECT r.root, i.implied_bundle_key, ''implies''::text\n        FROM authz_bundle_implies i\n        JOIN (\n          SELECT h.bundle_key AS root, h.bundle_key AS reached FROM held h\n          UNION\n          SELECT r2.root, r2.reached FROM reach r2\n        ) r ON r.reached = i.bundle_key\n    ),';
  v_new := E'    WITH RECURSIVE held AS (\n      SELECT unnest(_bundle_keys) AS bundle_key\n    ),\n    reach(root, reached) AS (\n      -- transitive closure from each held parent bundle to its children\n      SELECT h.bundle_key, h.bundle_key\n        FROM held h\n      UNION\n      SELECT r.root, i.child_bundle_key\n        FROM reach r\n        JOIN public.authz_bundle_implies i\n          ON i.parent_bundle_key = r.reached\n    ),';
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Expected one stale authorization reachability block';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

notify pgrst, 'reload schema';
