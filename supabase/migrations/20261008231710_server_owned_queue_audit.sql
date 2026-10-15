-- ZMED-180 proposal: the browser cannot append protected audit rows. Capture
-- actual writes in their own transaction, not client-asserted actor/diffs.
-- Review/apply before removing the unsupported browser logger.
create function public.tg_audit_queue_appointments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_action text;
  v_keys text[] := array['id','created_at','booking_source','public_booking_created_at',
    'patient_id','branch_id','status','doctor_id','room',
    'priority','is_walk_in','checked_in_at','started_at','deleted_at',
    'scheduled_at','duration_minutes','service_id','resource_id',
    'booking_request_status','booking_request_expires_at','booking_rejected_at',
    'booking_rejected_by','booking_confirmed_at','booking_confirmed_by',
    'self_checked_in_at','check_in_method','booking_expiry_alert_sent_at'];
begin
  if TG_OP <> 'INSERT' then
    select jsonb_object_agg(j.key,j.value) into v_old
    from jsonb_each(to_jsonb(OLD)) j where j.key = any(v_keys);
  end if;
  if TG_OP <> 'DELETE' then
    select jsonb_object_agg(j.key,j.value) into v_new
    from jsonb_each(to_jsonb(NEW)) j where j.key = any(v_keys);
  end if;
  if TG_OP = 'UPDATE' then
    -- Sensitive free-text and booking references are never copied. Indicate
    -- that they changed so the operation remains traceable without disclosure.
    if OLD.notes is distinct from NEW.notes then v_new := v_new || jsonb_build_object('notes_changed',true); end if;
    if OLD.procedure is distinct from NEW.procedure then v_new := v_new || jsonb_build_object('procedure_changed',true); end if;
    if OLD.public_booking_metadata is distinct from NEW.public_booking_metadata then v_new := v_new || jsonb_build_object('booking_metadata_changed',true); end if;
    if OLD.public_booking_reference is distinct from NEW.public_booking_reference then v_new := v_new || jsonb_build_object('booking_reference_changed',true); end if;
    if OLD.booking_rejection_reason is distinct from NEW.booking_rejection_reason then v_new := v_new || jsonb_build_object('booking_reason_changed',true); end if;
  end if;
  if TG_OP = 'DELETE' then
    perform public._audit_write('appointment',OLD.id,'appointment_deleted',v_old,null,OLD.branch_id,null);
    return OLD;
  end if;
  if TG_OP = 'UPDATE' and OLD.branch_id is distinct from NEW.branch_id then
    -- Audit readers are branch-scoped too. A recipient in the destination
    -- branch must not receive the old branch's patient/operational metadata.
    perform public._audit_write('appointment',OLD.id,'appointment_transferred',v_old,null,OLD.branch_id,null);
    perform public._audit_write('appointment',NEW.id,'appointment_transferred',null,v_new,NEW.branch_id,null);
    return NEW;
  end if;
  if TG_OP = 'INSERT' then
    v_action := case when NEW.is_walk_in then 'walk_in_created' else 'appointment_created' end;
  elsif v_old is not distinct from v_new then
    return NEW;
  else
    v_action := case
      when OLD.deleted_at is null and NEW.deleted_at is not null then 'appointment_deleted'
      when OLD.patient_id is distinct from NEW.patient_id then 'appointment_patient_changed'
      when OLD.status is distinct from NEW.status then 'status_change'
      when OLD.doctor_id is distinct from NEW.doctor_id then 'doctor_reassigned'
      when OLD.room is distinct from NEW.room then 'room_assigned'
      when OLD.priority is distinct from NEW.priority then 'priority_changed'
      when OLD.scheduled_at is distinct from NEW.scheduled_at
        or OLD.duration_minutes is distinct from NEW.duration_minutes then 'appointment_rescheduled'
      else 'appointment_updated' end;
  end if;
  -- The existing internal writer uses auth.uid(), never a supplied actor. NULL
  -- actor means trusted maintenance/background work; do not impersonate doctor.
  perform public._audit_write('appointment',NEW.id,v_action,v_old,v_new,NEW.branch_id,null);
  return NEW;
end;
$function$;
revoke all on function public.tg_audit_queue_appointments() from public,anon,authenticated;
grant execute on function public.tg_audit_queue_appointments() to service_role;

create trigger audit_queue_appointments_v3
after insert or update or delete on public.appointments
for each row execute function public.tg_audit_queue_appointments();
