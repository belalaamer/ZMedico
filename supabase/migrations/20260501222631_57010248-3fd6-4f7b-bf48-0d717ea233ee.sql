
-- =========================================================
-- ENUMS
-- =========================================================
do $$ begin
  create type public.setting_value_type as enum ('string','number','boolean','json');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_channel as enum ('email','sms','whatsapp','push');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method_type as enum ('cash','card','bank_transfer','wallet','insurance','other');
exception when duplicate_object then null; end $$;

-- =========================================================
-- 1. clinic_settings
-- =========================================================
create table if not exists public.clinic_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  setting_key text not null,
  setting_value text,
  setting_type public.setting_value_type not null default 'string',
  description_ar text,
  description_en text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, setting_key)
);
create index if not exists idx_clinic_settings_branch on public.clinic_settings(branch_id);

alter table public.clinic_settings enable row level security;
create policy cs_select on public.clinic_settings for select to authenticated using (true);
create policy cs_admin on public.clinic_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create trigger trg_cs_updated before update on public.clinic_settings
  for each row execute function public.tg_set_updated_at();

-- =========================================================
-- 2. clinic_profile
-- =========================================================
create table if not exists public.clinic_profile (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid unique references public.branches(id) on delete cascade,
  clinic_name_ar text not null default '',
  clinic_name_en text not null default '',
  logo_url text,
  favicon_url text,
  tagline_ar text,
  tagline_en text,
  description_ar text,
  description_en text,
  phone text,
  phone_secondary text,
  email text,
  website text,
  address_ar text,
  address_en text,
  city text,
  country text default 'Egypt',
  postal_code text,
  google_maps_url text,
  working_hours_start time not null default '09:00',
  working_hours_end time not null default '21:00',
  working_days integer[] not null default '{0,1,2,3,4,5,6}',
  social_facebook text,
  social_instagram text,
  social_twitter text,
  social_whatsapp text,
  social_youtube text,
  tax_registration_number text,
  commercial_registration_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clinic_profile enable row level security;
create policy cp_select on public.clinic_profile for select to authenticated using (true);
create policy cp_admin on public.clinic_profile for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_cp_updated before update on public.clinic_profile
  for each row execute function public.tg_set_updated_at();

-- =========================================================
-- 3. appointment_settings
-- =========================================================
create table if not exists public.appointment_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid unique references public.branches(id) on delete cascade,
  slot_duration_minutes integer not null default 30,
  buffer_minutes integer not null default 0,
  max_appointments_per_slot integer not null default 1,
  allow_online_booking boolean not null default true,
  require_confirmation boolean not null default false,
  auto_confirm_after_minutes integer,
  cancellation_deadline_hours integer not null default 24,
  reminder_hours_before integer[] not null default '{24,2}',
  max_future_booking_days integer not null default 30,
  min_advance_booking_hours integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.appointment_settings enable row level security;
create policy as_select on public.appointment_settings for select to authenticated using (true);
create policy as_admin on public.appointment_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_as_updated before update on public.appointment_settings
  for each row execute function public.tg_set_updated_at();

-- =========================================================
-- 4. invoice_settings
-- =========================================================
create table if not exists public.invoice_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid unique references public.branches(id) on delete cascade,
  invoice_prefix text not null default 'INV',
  invoice_suffix text,
  invoice_start_number integer not null default 1,
  reset_number_yearly boolean not null default true,
  default_tax_rate numeric(5,2) not null default 0,
  default_payment_terms_days integer not null default 0,
  show_logo_on_invoice boolean not null default true,
  show_tax_id boolean not null default true,
  show_payment_qr boolean not null default false,
  invoice_notes_ar text,
  invoice_notes_en text,
  invoice_footer_ar text,
  invoice_footer_en text,
  terms_conditions_ar text,
  terms_conditions_en text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invoice_settings enable row level security;
create policy is_select on public.invoice_settings for select to authenticated using (true);
create policy is_admin on public.invoice_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_is_updated before update on public.invoice_settings
  for each row execute function public.tg_set_updated_at();

-- =========================================================
-- 5. notification_settings
-- =========================================================
create table if not exists public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid unique references public.branches(id) on delete cascade,
  send_appointment_reminders boolean not null default true,
  reminder_channel public.notification_channel not null default 'email',
  send_appointment_confirmation boolean not null default true,
  send_appointment_cancellation boolean not null default true,
  send_invoice_notification boolean not null default true,
  send_payment_receipt boolean not null default true,
  send_birthday_greeting boolean not null default false,
  birthday_discount_percentage numeric(5,2) not null default 0,
  send_follow_up_reminder boolean not null default true,
  follow_up_days_after integer not null default 7,
  email_sender_name text,
  email_sender_address text,
  sms_sender_id text,
  whatsapp_business_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy ns_select on public.notification_settings for select to authenticated using (true);
create policy ns_admin on public.notification_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_ns_updated before update on public.notification_settings
  for each row execute function public.tg_set_updated_at();

-- =========================================================
-- 6. payment_methods
-- =========================================================
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  code text not null unique,
  type public.payment_method_type not null default 'cash',
  is_active boolean not null default true,
  requires_reference boolean not null default false,
  processing_fee_percentage numeric(5,2) not null default 0,
  processing_fee_fixed numeric(10,2) not null default 0,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
create policy pm_select on public.payment_methods for select to authenticated using (true);
create policy pm_admin on public.payment_methods for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 7. service_categories
-- =========================================================
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  icon text,
  color text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.service_categories enable row level security;
create policy sc_select on public.service_categories for select to authenticated using (true);
create policy sc_admin on public.service_categories for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 8. services
-- =========================================================
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories(id) on delete set null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  code text,
  default_duration_minutes integer not null default 30,
  default_price numeric(10,2) not null default 0,
  cost_price numeric(10,2),
  is_active boolean not null default true,
  requires_appointment boolean not null default true,
  available_online boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_services_cat on public.services(category_id);
alter table public.services enable row level security;
create policy sv_select on public.services for select to authenticated using (true);
create policy sv_admin on public.services for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 9. system_languages
-- =========================================================
create table if not exists public.system_languages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  is_rtl boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.system_languages enable row level security;
create policy lng_select on public.system_languages for select to authenticated using (true);
create policy lng_admin on public.system_languages for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 10/11/12. templates
-- =========================================================
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name_ar text not null,
  name_en text not null,
  subject_ar text not null default '',
  subject_en text not null default '',
  body_ar text not null default '',
  body_en text not null default '',
  variables text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_templates enable row level security;
create policy et_select on public.email_templates for select to authenticated using (true);
create policy et_admin on public.email_templates for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_et_updated before update on public.email_templates
  for each row execute function public.tg_set_updated_at();

create table if not exists public.sms_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name_ar text not null,
  name_en text not null,
  body_ar text not null default '',
  body_en text not null default '',
  variables text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sms_templates enable row level security;
create policy st_select on public.sms_templates for select to authenticated using (true);
create policy st_admin on public.sms_templates for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name_ar text not null,
  name_en text not null,
  body_ar text not null default '',
  body_en text not null default '',
  variables text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_templates enable row level security;
create policy wt_select on public.whatsapp_templates for select to authenticated using (true);
create policy wt_admin on public.whatsapp_templates for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 13. audit_logs
-- =========================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_user on public.audit_logs(user_id);
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);
alter table public.audit_logs enable row level security;
create policy al_select_admin on public.audit_logs for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy al_insert on public.audit_logs for insert to authenticated with check (true);

-- =========================================================
-- 14. user_activity_logs
-- =========================================================
create table if not exists public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  activity_type text not null,
  entity_type text,
  entity_id uuid,
  description_ar text,
  description_en text,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ual_user on public.user_activity_logs(user_id);
create index if not exists idx_ual_created on public.user_activity_logs(created_at desc);
alter table public.user_activity_logs enable row level security;
create policy ual_select_admin on public.user_activity_logs for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy ual_insert on public.user_activity_logs for insert to authenticated with check (true);

-- =========================================================
-- SEED DATA
-- =========================================================
insert into public.payment_methods (name_ar, name_en, code, type, display_order) values
  ('نقدي','Cash','cash','cash',1),
  ('بطاقة ائتمان','Credit Card','card','card',2),
  ('تحويل بنكي','Bank Transfer','bank_transfer','bank_transfer',3),
  ('تأمين','Insurance','insurance','insurance',4)
on conflict (code) do nothing;

insert into public.service_categories (name_ar, name_en, icon, color, display_order) values
  ('كشف','Consultation','stethoscope','#7c3aed',1),
  ('علاج','Treatment','pill','#0ea5e9',2),
  ('إجراء','Procedure','syringe','#10b981',3),
  ('جراحة','Surgery','scissors','#ef4444',4),
  ('تحاليل','Lab Tests','flask','#f59e0b',5),
  ('أشعة','Radiology','scan','#6366f1',6)
on conflict do nothing;

insert into public.system_languages (code, name_ar, name_en, is_active, is_default, is_rtl) values
  ('ar','العربية','Arabic',true,true,true),
  ('en','الإنجليزية','English',true,false,false)
on conflict (code) do nothing;

insert into public.email_templates (template_key, name_ar, name_en, subject_ar, subject_en, body_ar, body_en, variables) values
  ('appointment_confirmation','تأكيد الموعد','Appointment Confirmation','تأكيد موعدك','Your appointment is confirmed','عزيزي {{patient_name}}، تم تأكيد موعدك في {{appointment_date}}.','Dear {{patient_name}}, your appointment on {{appointment_date}} is confirmed.', array['patient_name','appointment_date']),
  ('appointment_reminder','تذكير بالموعد','Appointment Reminder','تذكير بموعدك','Appointment Reminder','عزيزي {{patient_name}}، نذكرك بموعدك في {{appointment_date}}.','Dear {{patient_name}}, this is a reminder of your appointment on {{appointment_date}}.', array['patient_name','appointment_date']),
  ('appointment_cancellation','إلغاء الموعد','Appointment Cancellation','إلغاء موعدك','Appointment Cancelled','عزيزي {{patient_name}}، تم إلغاء موعدك في {{appointment_date}}.','Dear {{patient_name}}, your appointment on {{appointment_date}} has been cancelled.', array['patient_name','appointment_date']),
  ('invoice_sent','إرسال الفاتورة','Invoice Sent','فاتورتك','Your Invoice','مرفق فاتورتك رقم {{invoice_number}} بمبلغ {{amount}}.','Please find attached invoice {{invoice_number}} for {{amount}}.', array['invoice_number','amount']),
  ('payment_receipt','إيصال الدفع','Payment Receipt','إيصال الدفع','Payment Receipt','شكراً لك. تم استلام دفعة بقيمة {{amount}}.','Thank you. We received your payment of {{amount}}.', array['amount']),
  ('birthday_greeting','تهنئة عيد الميلاد','Birthday Greeting','عيد ميلاد سعيد','Happy Birthday','عيد ميلاد سعيد {{patient_name}}!','Happy Birthday {{patient_name}}!', array['patient_name']),
  ('follow_up_reminder','تذكير المتابعة','Follow-up Reminder','تذكير المتابعة','Follow-up Reminder','عزيزي {{patient_name}}، نذكرك بزيارة المتابعة.','Dear {{patient_name}}, this is a reminder for your follow-up visit.', array['patient_name'])
on conflict (template_key) do nothing;

insert into public.sms_templates (template_key, name_ar, name_en, body_ar, body_en, variables) values
  ('appointment_reminder','تذكير بالموعد','Appointment Reminder','تذكير: موعدك في {{appointment_date}}','Reminder: appointment on {{appointment_date}}', array['appointment_date']),
  ('appointment_confirmation','تأكيد الموعد','Appointment Confirmation','تم تأكيد موعدك في {{appointment_date}}','Appointment confirmed on {{appointment_date}}', array['appointment_date'])
on conflict (template_key) do nothing;

insert into public.whatsapp_templates (template_key, name_ar, name_en, body_ar, body_en, variables) values
  ('appointment_reminder','تذكير بالموعد','Appointment Reminder','مرحباً {{patient_name}}، تذكير بموعدك في {{appointment_date}}','Hello {{patient_name}}, reminder of your appointment on {{appointment_date}}', array['patient_name','appointment_date'])
on conflict (template_key) do nothing;
