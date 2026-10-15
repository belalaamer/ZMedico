-- ZMED-179 proposed only. Deploy together with its client after independent
-- review; no SECURITY DEFINER, RLS bypass, compensation or clinical deletion.
create function public.open_queue_consultation(
  _appointment_id uuid,
  _branch_id uuid,
  _expected_status public.appointment_status,
  _doctor_id uuid default null,
  _expected_snapshot jsonb default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_appointment public.appointments%rowtype;
  v_record public.medical_records%rowtype;
  v_user uuid := auth.uid();
  v_record_id uuid;
  v_constraint text;
begin
  if v_user is null or _branch_id is null
     or not (public.has_role(v_user, 'admin'::public.app_role)
             or public.has_role(v_user, 'doctor'::public.app_role))
     or not public.user_has_branch_access(_branch_id) then
    raise exception 'Clinical role and accessible branch required' using errcode = '42501';
  end if;

  -- Read and lock the actual appointment under caller RLS, never client patient
  -- identity. All callers of this handoff serialize on this one appointment.
  select a.* into v_appointment
  from public.appointments a
  where a.id = _appointment_id and a.branch_id = _branch_id and a.deleted_at is null
  for update;
  if not found then
    raise exception 'Appointment unavailable in caller scope' using errcode = '42501';
  end if;
  if v_appointment.status is distinct from _expected_status then
    -- This is a business snapshot conflict, not a retryable serialization error.
    raise exception 'Appointment changed; refresh queue' using errcode = 'PT409';
  end if;
  -- A same-status edit can change the patient or assigned doctor. Compare the
  -- exact API snapshot (including timestamp precision) before any clinical write.
  -- Caller values are preconditions only, never the identity used for INSERT.
  if _expected_snapshot is null or jsonb_typeof(_expected_snapshot) <> 'object'
     or not (_expected_snapshot ?& array['patient_id','doctor_id','updated_at']) then
    raise exception 'Appointment snapshot required; refresh queue' using errcode = 'PT409';
  end if;
  if v_appointment.patient_id is distinct from (_expected_snapshot->>'patient_id')::uuid
     or v_appointment.doctor_id is distinct from (_expected_snapshot->>'doctor_id')::uuid
     or v_appointment.updated_at is distinct from (_expected_snapshot->>'updated_at')::timestamptz then
    raise exception 'Appointment changed; refresh queue' using errcode = 'PT409';
  end if;
  if v_appointment.status in ('cancelled', 'no_show', 'departed') then
    raise exception 'Appointment is not available for consultation' using errcode = '22023';
  end if;

  select m.* into v_record
  from public.medical_records m
  where m.appointment_id = v_appointment.id and m.deleted_at is null
  order by m.created_at desc limit 1;
  if found then
    if v_record.patient_id is distinct from v_appointment.patient_id
       or v_record.branch_id is distinct from v_appointment.branch_id then
      raise exception 'Clinical relationship requires review' using errcode = '23503';
    end if;
    v_record_id := v_record.id;
  else
    -- The existing partial unique index protects against older/direct callers
    -- that do not acquire the appointment lock. Retry only its exact conflict.
    begin
      insert into public.medical_records(patient_id, appointment_id, branch_id, doctor_id, visit_type, status)
      values(v_appointment.patient_id, v_appointment.id, v_appointment.branch_id,
             coalesce(v_appointment.doctor_id, _doctor_id, v_user), 'consultation', 'draft')
      returning id into v_record_id;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'uq_medical_records_active_appointment' then raise; end if;
      select m.* into v_record from public.medical_records m
      where m.appointment_id = v_appointment.id and m.deleted_at is null
      order by m.created_at desc limit 1;
      if not found or v_record.patient_id is distinct from v_appointment.patient_id
         or v_record.branch_id is distinct from v_appointment.branch_id then
        raise;
      end if;
      v_record_id := v_record.id;
    end;
  end if;

  if v_appointment.status not in ('in_progress', 'completed') then
    update public.appointments
    set status = 'in_progress',
        checked_in_at = coalesce(v_appointment.checked_in_at, now()),
        started_at = coalesce(v_appointment.started_at, now())
    where id = v_appointment.id and branch_id = _branch_id
      and status = _expected_status and deleted_at is null;
    if not found then
      raise exception 'Appointment update unavailable' using errcode = '42501';
    end if;
  end if;
  return v_record_id;
end;
$function$;

revoke all on function public.open_queue_consultation(uuid,uuid,public.appointment_status,uuid,jsonb) from public, anon;
grant execute on function public.open_queue_consultation(uuid,uuid,public.appointment_status,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
