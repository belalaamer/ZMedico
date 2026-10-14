-- ZMED-224: PL/pgSQL record variables `a`/`s` shadow table aliases with the
-- same names, so valid link creation/check-in aborts before business logic.
-- Change only the SQL aliases. Support both the current Production function
-- and the earlier unpublished idempotency wrapper's renamed implementation.
do $migration$
declare
  v_link regprocedure := 'public.create_self_checkin_link(uuid,integer)'::regprocedure;
  v_checkin regprocedure;
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(v_link) into v_definition;
  if md5(v_definition) <> '77e933132e78d93719f81ad92ad41e89' then
    raise exception 'create_self_checkin_link definition drifted; review before applying';
  end if;
  v_old := E'SELECT a.id, a.branch_id, a.status, a.scheduled_at, b.tenant_id\n    INTO a\n    FROM public.appointments a\n    LEFT JOIN public.branches b ON b.id = a.branch_id\n   WHERE a.id = p_appointment_id\n     AND a.deleted_at IS NULL;';
  v_new := E'SELECT appt.id, appt.branch_id, appt.status, appt.scheduled_at, b.tenant_id\n    INTO a\n    FROM public.appointments appt\n    LEFT JOIN public.branches b ON b.id = appt.branch_id\n   WHERE appt.id = p_appointment_id\n     AND appt.deleted_at IS NULL;';
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Expected one create-link appointment alias block';
  end if;
  execute replace(v_definition, v_old, v_new);

  if to_regprocedure('public.public_self_checkin_unserialized(text)') is not null then
    v_checkin := 'public.public_self_checkin_unserialized(text)'::regprocedure;
  else
    v_checkin := 'public.public_self_checkin(text)'::regprocedure;
  end if;
  select pg_get_functiondef(v_checkin) into v_definition;
  if md5(v_definition) not in (
    '4175f97c130e7e975ac9d8dae86c0efd',
    '1403b26a331f88175940999a67ee6222'
  ) then
    raise exception 'public_self_checkin implementation drifted; review before applying';
  end if;

  v_old := E'SELECT s.id, s.appointment_id\n    INTO s\n    FROM public.self_checkin_tokens s\n   WHERE s.token_hash = encode(extensions.digest(convert_to(lower(p_token), ''UTF8''), ''sha256''::text), ''hex'')\n     AND s.revoked_at IS NULL\n     AND s.expires_at > now_value\n   LIMIT 1;';
  v_new := E'SELECT tok.id, tok.appointment_id\n    INTO s\n    FROM public.self_checkin_tokens tok\n   WHERE tok.token_hash = encode(extensions.digest(convert_to(lower(p_token), ''UTF8''), ''sha256''::text), ''hex'')\n     AND tok.revoked_at IS NULL\n     AND tok.expires_at > now_value\n   LIMIT 1;';
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Expected one self-check-in token alias block';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := E'SELECT a.id, a.branch_id, a.status, a.checked_in_at, a.deleted_at, a.scheduled_at,\n         b.tenant_id, t.is_active AS tenant_is_active, t.subscription_status,\n         t.subscription_ends_at, t.trial_ends_at\n    INTO a\n    FROM public.appointments a\n    JOIN public.branches b ON b.id = a.branch_id\n    JOIN public.tenants t ON t.id = b.tenant_id\n   WHERE a.id = s.appointment_id\n   FOR UPDATE;';
  v_new := E'SELECT appt.id, appt.branch_id, appt.status, appt.checked_in_at, appt.deleted_at, appt.scheduled_at,\n         b.tenant_id, t.is_active AS tenant_is_active, t.subscription_status,\n         t.subscription_ends_at, t.trial_ends_at\n    INTO a\n    FROM public.appointments appt\n    JOIN public.branches b ON b.id = appt.branch_id\n    JOIN public.tenants t ON t.id = b.tenant_id\n   WHERE appt.id = s.appointment_id\n   FOR UPDATE;';
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Expected one self-check-in appointment alias block';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

notify pgrst, 'reload schema';
