-- ============ ENUMS ============
create type contract_type as enum ('full_time','part_time','contract','freelance');
create type staff_status as enum ('active','on_leave','terminated','suspended');
create type attendance_method as enum ('manual','fingerprint','face_recognition','qr_code');
create type attendance_status as enum ('present','absent','late','early_leave','half_day','on_leave');
create type leave_request_status as enum ('pending','approved','rejected','cancelled');
create type payroll_status as enum ('draft','approved','paid');
create type salary_adjustment_type as enum ('bonus','deduction','allowance','penalty');

-- ============ DEPARTMENTS ============
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  description text,
  branch_id uuid references public.branches(id) on delete set null,
  manager_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.departments enable row level security;
create policy dept_select on public.departments for select to authenticated using (true);
create policy dept_admin on public.departments for all to authenticated using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create trigger dept_updated_at before update on public.departments for each row execute function public.tg_set_updated_at();

-- ============ POSITIONS ============
create table public.staff_positions (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  title_en text not null,
  department_id uuid references public.departments(id) on delete set null,
  description_ar text,
  description_en text,
  salary_range_min numeric(14,2),
  salary_range_max numeric(14,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff_positions enable row level security;
create policy pos_select on public.staff_positions for select to authenticated using (true);
create policy pos_admin on public.staff_positions for all to authenticated using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

-- ============ EMPLOYEE ID COUNTER ============
create table public.employee_id_counter (
  id int primary key default 1,
  last_value int not null default 0
);
insert into public.employee_id_counter(id, last_value) values (1, 0);
alter table public.employee_id_counter enable row level security;
create policy emp_counter_select on public.employee_id_counter for select to authenticated using (true);

create or replace function public.generate_employee_id()
returns text language plpgsql security definer set search_path=public as $$
declare n int;
begin
  update public.employee_id_counter set last_value = last_value + 1 where id = 1 returning last_value into n;
  return 'EMP-' || lpad(n::text, 4, '0');
end; $$;

-- ============ STAFF PROFILES ============
create table public.staff_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  employee_id text not null unique,
  position_id uuid references public.staff_positions(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  hire_date date not null default current_date,
  contract_type contract_type not null default 'full_time',
  contract_end_date date,
  salary numeric(14,2) not null default 0,
  salary_currency text not null default 'EGP',
  bank_name text,
  bank_account text,
  working_hours_per_week int not null default 40,
  annual_leave_balance numeric(6,2) not null default 21,
  sick_leave_balance numeric(6,2) not null default 10,
  emergency_contact_name text,
  emergency_contact_phone text,
  national_id text,
  date_of_birth date,
  address text,
  profile_image_url text,
  status staff_status not null default 'active',
  termination_date date,
  termination_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_profiles enable row level security;
create policy staff_select on public.staff_profiles for select to authenticated using (true);
create policy staff_admin on public.staff_profiles for all to authenticated using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create policy staff_update_self on public.staff_profiles for update to authenticated using (id = auth.uid());
create trigger staff_updated_at before update on public.staff_profiles for each row execute function public.tg_set_updated_at();

create or replace function public.tg_staff_before_insert()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.employee_id is null or new.employee_id = '' then new.employee_id := public.generate_employee_id(); end if;
  return new;
end; $$;
create trigger staff_before_insert before insert on public.staff_profiles for each row execute function public.tg_staff_before_insert();

-- ============ WORK SCHEDULES ============
create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_working_day boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, branch_id, day_of_week)
);
alter table public.work_schedules enable row level security;
create policy ws_select on public.work_schedules for select to authenticated using (true);
create policy ws_admin on public.work_schedules for all to authenticated using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create trigger ws_updated_at before update on public.work_schedules for each row execute function public.tg_set_updated_at();

-- ============ ATTENDANCE ============
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  date date not null default current_date,
  check_in_time time,
  check_out_time time,
  check_in_method attendance_method,
  check_out_method attendance_method,
  working_hours numeric(5,2) generated always as (
    case when check_in_time is not null and check_out_time is not null
      then round(extract(epoch from (check_out_time - check_in_time))/3600.0, 2)::numeric
      else 0 end
  ) stored,
  overtime_hours numeric(5,2) not null default 0,
  status attendance_status not null default 'present',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);
alter table public.attendance enable row level security;
create policy att_select on public.attendance for select to authenticated using (true);
create policy att_insert on public.attendance for insert to authenticated with check (true);
create policy att_update on public.attendance for update to authenticated using (has_role(auth.uid(),'admin') or staff_id = auth.uid());
create policy att_delete on public.attendance for delete to authenticated using (has_role(auth.uid(),'admin'));

-- ============ LEAVE TYPES ============
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  code text not null unique,
  default_days numeric(6,2) not null default 0,
  is_paid boolean not null default true,
  requires_approval boolean not null default true,
  max_consecutive_days int,
  description_ar text,
  description_en text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.leave_types enable row level security;
create policy lt_select on public.leave_types for select to authenticated using (true);
create policy lt_admin on public.leave_types for all to authenticated using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

insert into public.leave_types(name_en, name_ar, code, default_days, is_paid, max_consecutive_days) values
('Annual Leave','إجازة سنوية','ANNUAL', 21, true, 30),
('Sick Leave','إجازة مرضية','SICK', 10, true, 14),
('Maternity Leave','إجازة أمومة','MATERNITY', 90, true, 120),
('Paternity Leave','إجازة أبوة','PATERNITY', 5, true, 7),
('Unpaid Leave','إجازة بدون راتب','UNPAID', 0, false, null);

-- ============ LEAVE REQUESTS ============
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  start_date date not null,
  end_date date not null,
  total_days numeric(6,2) not null default 0,
  reason_ar text,
  reason_en text,
  status leave_request_status not null default 'pending',
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leave_requests enable row level security;
create policy lr_select on public.leave_requests for select to authenticated using (true);
create policy lr_insert on public.leave_requests for insert to authenticated with check (true);
create policy lr_update on public.leave_requests for update to authenticated using (has_role(auth.uid(),'admin') or staff_id = auth.uid());
create policy lr_delete on public.leave_requests for delete to authenticated using (has_role(auth.uid(),'admin'));
create trigger lr_updated_at before update on public.leave_requests for each row execute function public.tg_set_updated_at();

-- ============ PAYROLL ============
create table public.payroll (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  base_salary numeric(14,2) not null default 0,
  working_days numeric(6,2) not null default 0,
  actual_working_days numeric(6,2) not null default 0,
  overtime_hours numeric(6,2) not null default 0,
  overtime_amount numeric(14,2) not null default 0,
  bonuses numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  leave_deductions numeric(14,2) not null default 0,
  net_salary numeric(14,2) not null default 0,
  status payroll_status not null default 'draft',
  paid_at timestamptz,
  paid_by uuid,
  payment_reference text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, period_month, period_year)
);
alter table public.payroll enable row level security;
create policy pay_select on public.payroll for select to authenticated using (true);
create policy pay_admin on public.payroll for all to authenticated using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create trigger payroll_updated_at before update on public.payroll for each row execute function public.tg_set_updated_at();

-- ============ SALARY ADJUSTMENTS ============
create table public.salary_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_id uuid not null references public.payroll(id) on delete cascade,
  type salary_adjustment_type not null,
  amount numeric(14,2) not null default 0,
  reason_ar text,
  reason_en text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.salary_adjustments enable row level security;
create policy sa_select on public.salary_adjustments for select to authenticated using (true);
create policy sa_admin on public.salary_adjustments for all to authenticated using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

-- ============ PERFORMANCE REVIEWS ============
create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  reviewer_id uuid,
  review_period_start date not null,
  review_period_end date not null,
  rating int check (rating between 1 and 5),
  strengths_ar text,
  strengths_en text,
  areas_for_improvement_ar text,
  areas_for_improvement_en text,
  goals_ar text,
  goals_en text,
  reviewer_comments text,
  staff_comments text,
  created_at timestamptz not null default now()
);
alter table public.performance_reviews enable row level security;
create policy pr_select on public.performance_reviews for select to authenticated using (true);
create policy pr_admin on public.performance_reviews for all to authenticated using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create policy pr_self_comment on public.performance_reviews for update to authenticated using (staff_id = auth.uid());

-- ============ INDEXES ============
create index idx_staff_branch on public.staff_profiles(branch_id);
create index idx_staff_dept on public.staff_profiles(department_id);
create index idx_attendance_date on public.attendance(date);
create index idx_attendance_staff on public.attendance(staff_id);
create index idx_leave_status on public.leave_requests(status);
create index idx_payroll_period on public.payroll(period_year, period_month);