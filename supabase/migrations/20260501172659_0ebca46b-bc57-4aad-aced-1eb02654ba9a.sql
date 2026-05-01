
-- Enums
create type public.app_role as enum ('admin', 'doctor', 'receptionist', 'staff');
create type public.appointment_status as enum ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'departed');
create type public.gender as enum ('male', 'female');

-- Branches
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  address text,
  phone text,
  created_at timestamptz not null default now()
);
alter table public.branches enable row level security;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  default_branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- Has role function
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Patients
create sequence public.patient_code_seq start 538;
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_code int not null unique default nextval('public.patient_code_seq'),
  first_name_en text not null,
  last_name_en text,
  first_name_ar text,
  last_name_ar text,
  email text,
  phone text,
  gender gender,
  dob date,
  nationality text,
  city text,
  address text,
  referral_source text,
  notes text,
  branch_id uuid references public.branches(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.patients enable row level security;

-- Appointments
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid references auth.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  room text,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 30,
  status appointment_status not null default 'scheduled',
  procedure text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.appointments enable row level security;

-- updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated before update on public.profiles for each row execute function public.tg_set_updated_at();
create trigger trg_patients_updated before update on public.patients for each row execute function public.tg_set_updated_at();
create trigger trg_appointments_updated before update on public.appointments for each row execute function public.tg_set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  -- First user becomes admin, others staff
  if (select count(*) from public.user_roles) = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'staff');
  end if;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS POLICIES
-- branches
create policy "branches_select_auth" on public.branches for select to authenticated using (true);
create policy "branches_admin_all" on public.branches for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- profiles
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_select_all_auth" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);

-- user_roles
create policy "roles_select_auth" on public.user_roles for select to authenticated using (true);
create policy "roles_admin_manage" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- patients
create policy "patients_select_auth" on public.patients for select to authenticated using (true);
create policy "patients_insert_auth" on public.patients for insert to authenticated with check (true);
create policy "patients_update_auth" on public.patients for update to authenticated using (true);
create policy "patients_delete_admin" on public.patients for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- appointments
create policy "appts_select_auth" on public.appointments for select to authenticated using (true);
create policy "appts_insert_auth" on public.appointments for insert to authenticated with check (true);
create policy "appts_update_auth" on public.appointments for update to authenticated using (true);
create policy "appts_delete_admin" on public.appointments for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Seed branches
insert into public.branches (name_en, name_ar, address, phone) values
  ('New Cairo', 'القاهرة الجديدة', '5th Settlement, Cairo', '+20 100 000 0001'),
  ('Maadi', 'المعادي', 'Maadi, Cairo', '+20 100 000 0002'),
  ('Alexandria', 'الإسكندرية', 'Smouha, Alexandria', '+20 100 000 0003');
