
-- ============ ENUMS ============
do $$ begin
  if not exists (select 1 from pg_type where typname = 'visit_type') then
    create type visit_type as enum ('consultation','follow_up','procedure','emergency');
  end if;
  if not exists (select 1 from pg_type where typname = 'medical_record_status') then
    create type medical_record_status as enum ('draft','completed','reviewed');
  end if;
  if not exists (select 1 from pg_type where typname = 'prescription_status') then
    create type prescription_status as enum ('active','completed','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'document_type') then
    create type document_type as enum ('lab_result','xray','mri','ct_scan','prescription','report','other');
  end if;
  if not exists (select 1 from pg_type where typname = 'tooth_status') then
    create type tooth_status as enum ('healthy','caries','filled','crown','implant','extracted','root_canal','bridge');
  end if;
end $$;

-- ============ CATALOGS ============
create table if not exists public.medical_specialties (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  description text,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_ar text not null,
  category text,
  description_en text,
  description_ar text,
  created_at timestamptz not null default now()
);
create index if not exists idx_diagnoses_code on public.diagnoses(code);
create index if not exists idx_diagnoses_category on public.diagnoses(category);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  generic_name text,
  dosage_form text not null,
  strength text,
  unit text not null default 'piece',
  instructions_en text,
  instructions_ar text,
  product_id uuid references public.products(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_medications_name on public.medications(name_en);

create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  specialty_id uuid references public.medical_specialties(id) on delete set null,
  code text,
  name_en text not null,
  name_ar text not null,
  description_en text,
  description_ar text,
  default_duration int,
  default_price numeric(14,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_procedures_specialty on public.procedures(specialty_id);

-- ============ MEDICAL RECORDS ============
create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  doctor_id uuid references public.profiles(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  specialty_id uuid references public.medical_specialties(id) on delete set null,
  visit_date date not null default current_date,
  visit_type visit_type not null default 'consultation',
  chief_complaint_ar text,
  chief_complaint_en text,
  present_illness_ar text,
  present_illness_en text,
  notes_ar text,
  notes_en text,
  status medical_record_status not null default 'draft',
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_records_patient on public.medical_records(patient_id);
create index if not exists idx_records_date on public.medical_records(visit_date desc);
create index if not exists idx_records_status on public.medical_records(status);
create trigger trg_records_updated before update on public.medical_records
  for each row execute function public.tg_set_updated_at();

create table if not exists public.vital_signs (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid references public.medical_records(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  blood_pressure_systolic int,
  blood_pressure_diastolic int,
  heart_rate int,
  temperature numeric(4,1),
  weight numeric(5,2),
  height numeric(5,2),
  bmi numeric(5,2) generated always as (
    case when weight is not null and height is not null and height > 0
      then round((weight / ((height/100.0) * (height/100.0)))::numeric, 2)
      else null end
  ) stored,
  blood_oxygen int,
  respiratory_rate int,
  blood_sugar numeric(5,1),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_vitals_patient on public.vital_signs(patient_id, recorded_at desc);
create index if not exists idx_vitals_record on public.vital_signs(medical_record_id);

create table if not exists public.record_diagnoses (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  diagnosis_id uuid not null references public.diagnoses(id) on delete restrict,
  is_primary boolean not null default false,
  notes_en text,
  notes_ar text,
  created_at timestamptz not null default now()
);
create index if not exists idx_rdx_record on public.record_diagnoses(medical_record_id);

create table if not exists public.record_procedures (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id) on delete restrict,
  tooth_number text,
  quantity numeric(10,2) not null default 1,
  notes_en text,
  notes_ar text,
  performed_by uuid references public.profiles(id) on delete set null,
  duration_minutes int,
  created_at timestamptz not null default now()
);
create index if not exists idx_rproc_record on public.record_procedures(medical_record_id);

-- ============ PRESCRIPTIONS ============
create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  medical_record_id uuid references public.medical_records(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid references public.profiles(id) on delete set null,
  prescription_date date not null default current_date,
  notes_en text,
  notes_ar text,
  status prescription_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rx_patient on public.prescriptions(patient_id, prescription_date desc);
create trigger trg_rx_updated before update on public.prescriptions
  for each row execute function public.tg_set_updated_at();

create table if not exists public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete restrict,
  dosage text,
  frequency text,
  duration text,
  quantity numeric(10,2) not null default 1,
  instructions_en text,
  instructions_ar text,
  created_at timestamptz not null default now()
);
create index if not exists idx_rxi_rx on public.prescription_items(prescription_id);

-- ============ DENTAL CHART ============
create table if not exists public.dental_chart (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  tooth_number text not null,
  tooth_name_en text,
  tooth_name_ar text,
  status tooth_status not null default 'healthy',
  notes text,
  last_updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, tooth_number)
);
create index if not exists idx_dental_patient on public.dental_chart(patient_id);
create trigger trg_dental_updated before update on public.dental_chart
  for each row execute function public.tg_set_updated_at();

-- ============ MEDICAL HISTORY ============
create table if not exists public.medical_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references public.patients(id) on delete cascade,
  has_diabetes boolean not null default false,
  has_hypertension boolean not null default false,
  has_heart_disease boolean not null default false,
  has_allergies boolean not null default false,
  allergies_en text,
  allergies_ar text,
  has_bleeding_disorder boolean not null default false,
  is_pregnant boolean not null default false,
  pregnancy_due_date date,
  current_medications_en text,
  current_medications_ar text,
  previous_surgeries_en text,
  previous_surgeries_ar text,
  family_history_en text,
  family_history_ar text,
  notes_en text,
  notes_ar text,
  last_updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_history_updated before update on public.medical_history
  for each row execute function public.tg_set_updated_at();

-- ============ DOCUMENTS ============
create table if not exists public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medical_record_id uuid references public.medical_records(id) on delete set null,
  document_type document_type not null default 'other',
  title_en text,
  title_ar text not null,
  description text,
  file_url text not null,
  file_name text not null,
  file_size bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  tags text[],
  created_at timestamptz not null default now()
);
create index if not exists idx_docs_patient on public.patient_documents(patient_id, created_at desc);
create index if not exists idx_docs_record on public.patient_documents(medical_record_id);

-- ============ STORAGE BUCKET ============
insert into storage.buckets (id, name, public)
values ('patient-docs', 'patient-docs', false)
on conflict (id) do nothing;

create policy "patient_docs_auth_read"
on storage.objects for select to authenticated
using (bucket_id = 'patient-docs');

create policy "patient_docs_auth_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'patient-docs');

create policy "patient_docs_auth_update"
on storage.objects for update to authenticated
using (bucket_id = 'patient-docs');

create policy "patient_docs_auth_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'patient-docs');

-- ============ RLS ============
alter table public.medical_specialties enable row level security;
alter table public.diagnoses enable row level security;
alter table public.medications enable row level security;
alter table public.procedures enable row level security;
alter table public.medical_records enable row level security;
alter table public.vital_signs enable row level security;
alter table public.record_diagnoses enable row level security;
alter table public.record_procedures enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.dental_chart enable row level security;
alter table public.medical_history enable row level security;
alter table public.patient_documents enable row level security;

-- Catalogs: read for all auth, write/admin
do $$ begin
  -- specialties
  create policy spec_select on public.medical_specialties for select to authenticated using (true);
  create policy spec_admin on public.medical_specialties for all to authenticated
    using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dx_select on public.diagnoses for select to authenticated using (true);
  create policy dx_admin on public.diagnoses for all to authenticated
    using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy med_select on public.medications for select to authenticated using (true);
  create policy med_admin on public.medications for all to authenticated
    using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy proc_select on public.procedures for select to authenticated using (true);
  create policy proc_admin on public.procedures for all to authenticated
    using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

-- Records: any auth can read/write; admin delete
do $$ begin
  create policy rec_select on public.medical_records for select to authenticated using (true);
  create policy rec_insert on public.medical_records for insert to authenticated with check (true);
  create policy rec_update on public.medical_records for update to authenticated using (true);
  create policy rec_delete on public.medical_records for delete to authenticated using (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy vit_select on public.vital_signs for select to authenticated using (true);
  create policy vit_insert on public.vital_signs for insert to authenticated with check (true);
  create policy vit_update on public.vital_signs for update to authenticated using (true);
  create policy vit_delete on public.vital_signs for delete to authenticated using (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy rdx_all on public.record_diagnoses for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy rproc_all on public.record_procedures for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy rx_select on public.prescriptions for select to authenticated using (true);
  create policy rx_insert on public.prescriptions for insert to authenticated with check (true);
  create policy rx_update on public.prescriptions for update to authenticated using (true);
  create policy rx_delete on public.prescriptions for delete to authenticated using (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy rxi_all on public.prescription_items for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dent_select on public.dental_chart for select to authenticated using (true);
  create policy dent_insert on public.dental_chart for insert to authenticated with check (true);
  create policy dent_update on public.dental_chart for update to authenticated using (true);
  create policy dent_delete on public.dental_chart for delete to authenticated using (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy hist_select on public.medical_history for select to authenticated using (true);
  create policy hist_insert on public.medical_history for insert to authenticated with check (true);
  create policy hist_update on public.medical_history for update to authenticated using (true);
  create policy hist_delete on public.medical_history for delete to authenticated using (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy doc_select on public.patient_documents for select to authenticated using (true);
  create policy doc_insert on public.patient_documents for insert to authenticated with check (true);
  create policy doc_update on public.patient_documents for update to authenticated using (true);
  create policy doc_delete on public.patient_documents for delete to authenticated using (has_role(auth.uid(),'admin'));
exception when duplicate_object then null; end $$;

-- Seed common specialties
insert into public.medical_specialties (name_en, name_ar, icon) values
  ('General Medicine','طب عام','🩺'),
  ('Dental','أسنان','🦷'),
  ('Dermatology','جلدية','✨'),
  ('Pediatrics','أطفال','👶'),
  ('Ophthalmology','عيون','👁️'),
  ('ENT','أنف وأذن وحنجرة','👂'),
  ('Orthopedics','عظام','🦴'),
  ('Gynecology','نساء وتوليد','🤰'),
  ('Cardiology','قلب','❤️'),
  ('Aesthetic Medicine','طب تجميلي','💉')
on conflict do nothing;
