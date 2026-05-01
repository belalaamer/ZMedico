-- Enums
do $$ begin
  create type report_category as enum ('financial','operational','medical','hr','inventory');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_frequency as enum ('daily','weekly','monthly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_format as enum ('pdf','excel','both');
exception when duplicate_object then null; end $$;

-- report_templates
create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  category report_category not null,
  description_en text,
  description_ar text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.report_templates enable row level security;
create policy rt_select on public.report_templates for select to authenticated using (true);
create policy rt_admin on public.report_templates for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- saved_reports
create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.report_templates(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.saved_reports enable row level security;
create policy sr_select on public.saved_reports for select to authenticated using (true);
create policy sr_insert on public.saved_reports for insert to authenticated with check (true);
create policy sr_update on public.saved_reports for update to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy sr_delete on public.saved_reports for delete to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(),'admin'));

-- report_schedules
create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.report_templates(id) on delete cascade,
  name text not null,
  frequency report_frequency not null,
  recipients text[] not null default '{}',
  filters jsonb not null default '{}'::jsonb,
  format report_format not null default 'pdf',
  is_active boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.report_schedules enable row level security;
create policy rs_select on public.report_schedules for select to authenticated using (true);
create policy rs_admin on public.report_schedules for all to authenticated
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Seed system templates
insert into public.report_templates(name_en, name_ar, category, description_en, description_ar, is_system) values
('Revenue Report','تقرير الإيرادات','financial','Revenue by date, branch, doctor','الإيرادات حسب التاريخ والفرع والطبيب',true),
('Collection Report','تقرير التحصيل','financial','Payments by method','المدفوعات حسب الطريقة',true),
('Outstanding Report','تقرير المستحقات','financial','Unpaid invoices by age','الفواتير غير المدفوعة',true),
('Expense Report','تقرير المصروفات','financial','Expenses by category','المصروفات حسب الفئة',true),
('Profit & Loss','الأرباح والخسائر','financial','P&L statement','بيان الأرباح والخسائر',true),
('Appointments Report','تقرير المواعيد','operational','Appointments analysis','تحليل المواعيد',true),
('Doctor Performance','أداء الأطباء','operational','Doctor productivity','إنتاجية الأطباء',true),
('Branch Performance','أداء الفروع','operational','Branch comparison','مقارنة الفروع',true),
('Diagnoses Report','تقرير التشخيصات','medical','Top diagnoses','أكثر التشخيصات شيوعاً',true),
('Procedures Report','تقرير الإجراءات','medical','Procedures performed','الإجراءات المنفذة',true),
('Attendance Report','تقرير الحضور','hr','Staff attendance','حضور الموظفين',true),
('Payroll Report','تقرير الرواتب','hr','Monthly payroll','الرواتب الشهرية',true),
('Stock Value Report','تقرير قيمة المخزون','inventory','Inventory valuation','تقييم المخزون',true),
('Low Stock Report','تقرير المخزون المنخفض','inventory','Products below minimum','المنتجات تحت الحد الأدنى',true),
('Expiry Report','تقرير الصلاحية','inventory','Expiring products','المنتجات قاربت على الانتهاء',true);