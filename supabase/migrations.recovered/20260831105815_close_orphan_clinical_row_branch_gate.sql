-- RECOVERED FROM PRODUCTION supabase_migrations.schema_migrations
-- version: 20260831105815
-- name: close_orphan_clinical_row_branch_gate
-- source: statements column, verbatim; not authored here.
-- confidence: high for the SQL text (it is what ran), medium for its
--   position here, because the repo also carries 397 migrations with the
--   same content under different versions (see docs/t1/MIGRATION_INVENTORY.md).
-- Do not edit. Do not replay against Production.

-- Orphan clinical rows (medical_record_id IS NULL) previously fell outside the
-- branch-isolation gate: user_has_branch_access_via_medical_record(NULL) returns
-- true, and the permissive SELECT policies on these tables are role-only. That
-- made any orphan prescription/vital-signs row readable across tenants by every
-- clinical role. Both tables are empty today, so zero rows change visibility.

-- 1) prescriptions: orphan rows no longer pass the gate (read or write)
alter policy branch_isolation on public.prescriptions
  using (medical_record_id is not null
         and public.user_has_branch_access_via_medical_record(medical_record_id))
  with check (medical_record_id is not null
         and public.user_has_branch_access_via_medical_record(medical_record_id));

-- 2) vital_signs: same nullable column, same hardening
alter policy branch_isolation on public.vital_signs
  using (medical_record_id is not null
         and public.user_has_branch_access_via_medical_record(medical_record_id))
  with check (medical_record_id is not null
         and public.user_has_branch_access_via_medical_record(medical_record_id));

-- 3) prescription_items gate: strict EXISTS form — neither a NULL argument nor
-- an orphan/dangling parent prescription can collapse to true anymore.
create or replace function public.user_has_branch_access_via_prescription(_rx uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.prescriptions p
    join public.medical_records mr on mr.id = p.medical_record_id
    where p.id = _rx
      and public.user_has_branch_access(mr.branch_id)
  );
$$;
