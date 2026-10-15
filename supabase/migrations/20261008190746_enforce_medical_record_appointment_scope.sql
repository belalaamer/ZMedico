-- ZMED-177 proposal. Review lock/index impact and apply individually only after
-- approval. Do not guess or repair historical clinical associations.
do $preflight$
begin
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.medical_records'::regclass
      and c.conname = 'medical_records_appointment_id_fkey'
      and c.contype = 'f'
      and c.confrelid = 'public.appointments'::regclass
      and array_length(c.conkey, 1) = 1
      and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'appointment_id' and not attisdropped)]
      and c.confkey = array[(select attnum from pg_attribute where attrelid = c.confrelid and attname = 'id' and not attisdropped)]
      and c.confdeltype = 'n'
      and c.confupdtype = 'a'
  ) then
    raise exception 'Original appointment relationship changed; review before replacing';
  end if;
  if exists (
    select 1
    from public.medical_records m
    join public.appointments a on a.id = m.appointment_id
    where m.patient_id is distinct from a.patient_id
       or m.branch_id is distinct from a.branch_id
  ) then
    raise exception 'Medical record appointment scope mismatch exists; clinical review required before applying';
  end if;
end;
$preflight$;

-- An ordinary, non-partial parent key is required for a composite FK. The
-- existing appointment PK already guarantees uniqueness of its id component.
alter table public.appointments
  add constraint appointments_id_patient_branch_key unique (id, patient_id, branch_id);

-- MATCH SIMPLE preserves records without an appointment. Both patient_id and
-- branch_id are already NOT NULL on medical_records. Validate the stronger
-- relationship before replacing the simple one within the migration transaction.
alter table public.medical_records
  add constraint medical_records_appointment_scope_fkey
  foreign key (appointment_id, patient_id, branch_id)
  references public.appointments (id, patient_id, branch_id)
  on update no action
  on delete set null (appointment_id)
  not valid;

alter table public.medical_records
  validate constraint medical_records_appointment_scope_fkey;

-- Preserve the known relationship hint and avoid two ambiguous REST embeds.
-- Appointment deletion still detaches only appointment_id, not clinical identity.
alter table public.medical_records
  drop constraint medical_records_appointment_id_fkey;
alter table public.medical_records
  rename constraint medical_records_appointment_scope_fkey to medical_records_appointment_id_fkey;
