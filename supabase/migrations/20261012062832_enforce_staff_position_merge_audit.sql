-- ZMED-225: the merge succeeds but its audit INSERT targets a removed
-- `metadata` column and WHEN OTHERS silently discards the failure. Replace
-- only that reviewed block and make the sensitive operation fail closed.
do $migration$
declare
  v_regprocedure regprocedure := 'public.merge_staff_position(uuid,uuid)'::regprocedure;
  v_definition text;
  v_old text := E'  begin\n    insert into public.audit_logs (\n      user_id, branch_id, action, entity_type, entity_id, metadata\n    )\n    values (\n      _uid,\n      _source_branch,\n      ''merge'',\n      ''staff_position'',\n      source_id,\n      jsonb_build_object(\n        ''source_id'', source_id,\n        ''target_id'', target_id,\n        ''branch_id'', _source_branch,\n        ''reassigned_count'', _reassigned\n      )\n    );\n  exception when others then\n    null;\n  end;';
  v_new text := E'  insert into public.audit_logs (\n    user_id, branch_id, action, entity_type, entity_id, old_values, new_values\n  )\n  values (\n    _uid,\n    _source_branch,\n    ''merge'',\n    ''staff_position'',\n    source_id,\n    jsonb_build_object(\n      ''source_id'', source_id,\n      ''branch_id'', _source_branch\n    ),\n    jsonb_build_object(\n      ''target_id'', target_id,\n      ''branch_id'', _source_branch,\n      ''reassigned_count'', _reassigned\n    )\n  );';
begin
  select pg_get_functiondef(v_regprocedure) into v_definition;
  if md5(v_definition) <> 'c9d9cb493044a7272140063592e7d118' then
    raise exception 'merge_staff_position definition drifted; review before applying';
  end if;
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Expected one swallowed staff-position audit block';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

notify pgrst, 'reload schema';
