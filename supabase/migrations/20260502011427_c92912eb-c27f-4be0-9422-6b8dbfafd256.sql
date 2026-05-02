-- ============== ENUMS ==============
do $$ begin
  create type public.subscription_status as enum ('trial','active','past_due','cancelled','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.billing_cycle as enum ('monthly','yearly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.saas_payment_status as enum ('pending','completed','failed','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.saas_payment_method as enum ('card','bank_transfer','cash');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.saas_payment_provider as enum ('stripe','paymob','fawry','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.saas_invoice_status as enum ('draft','sent','paid','void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.addon_status as enum ('active','cancelled');
exception when duplicate_object then null; end $$;

-- ============== PLANS ==============
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  price_monthly numeric(12,2) not null default 0,
  price_yearly numeric(12,2) not null default 0,
  currency text not null default 'EGP',
  max_branches integer not null default 1,
  max_staff integer not null default 5,
  max_patients integer not null default 1000,
  max_invoices_monthly integer not null default 500,
  features jsonb not null default '{}'::jsonb,
  is_popular boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============== TENANTS ==============
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid references public.profiles(id) on delete set null,
  plan_id uuid references public.subscription_plans(id),
  subscription_status public.subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  subscription_ends_at timestamptz,
  billing_email text,
  billing_phone text,
  billing_address text,
  billing_city text,
  billing_country text default 'Egypt',
  tax_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tenants_updated before update on public.tenants
  for each row execute function public.tg_set_updated_at();

-- ============== SUBSCRIPTIONS ==============
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status public.subscription_status not null default 'trial',
  billing_cycle public.billing_cycle not null default 'monthly',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '14 days',
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  paymob_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- ============== SAAS PAYMENTS ==============
create table if not exists public.saas_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  amount numeric(12,2) not null,
  currency text not null default 'EGP',
  status public.saas_payment_status not null default 'pending',
  payment_method public.saas_payment_method not null default 'card',
  payment_provider public.saas_payment_provider not null default 'manual',
  provider_transaction_id text,
  invoice_url text,
  receipt_url text,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

-- ============== SAAS INVOICES ==============
create table if not exists public.saas_invoice_counters (
  year int primary key,
  last_value int not null default 0
);

create or replace function public.generate_saas_invoice_number()
returns text language plpgsql security definer set search_path = public as $$
declare y int := extract(year from current_date)::int; n int;
begin
  insert into public.saas_invoice_counters(year, last_value) values (y, 1)
    on conflict (year) do update set last_value = public.saas_invoice_counters.last_value + 1
    returning last_value into n;
  return 'SAAS-' || y::text || '-' || lpad(n::text, 5, '0');
end; $$;

create table if not exists public.saas_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  invoice_number text not null unique,
  amount numeric(12,2) not null,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  currency text not null default 'EGP',
  status public.saas_invoice_status not null default 'draft',
  due_date date,
  paid_at timestamptz,
  invoice_pdf text,
  created_at timestamptz not null default now()
);

create or replace function public.tg_saas_invoice_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := public.generate_saas_invoice_number();
  end if;
  new.total := coalesce(new.amount,0) + coalesce(new.tax,0);
  return new;
end; $$;
create trigger trg_saas_invoice_bi before insert on public.saas_invoices
  for each row execute function public.tg_saas_invoice_before_insert();

-- ============== USAGE ==============
create table if not exists public.tenant_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  branches_count integer not null default 0,
  staff_count integer not null default 0,
  patients_count integer not null default 0,
  invoices_count integer not null default 0,
  storage_used_mb numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_tenant_usage_tenant on public.tenant_usage(tenant_id, period_start);

-- ============== ADDONS ==============
create table if not exists public.subscription_addons (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  price_monthly numeric(12,2) not null default 0,
  price_yearly numeric(12,2) not null default 0,
  feature_key text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_addons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  addon_id uuid not null references public.subscription_addons(id),
  status public.addon_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, addon_id)
);

-- ============== RLS ==============
alter table public.subscription_plans enable row level security;
alter table public.tenants enable row level security;
alter table public.subscriptions enable row level security;
alter table public.saas_payments enable row level security;
alter table public.saas_invoices enable row level security;
alter table public.tenant_usage enable row level security;
alter table public.subscription_addons enable row level security;
alter table public.tenant_addons enable row level security;

-- Plans + addons: public readable (pricing page), admin-only write
create policy "plans_public_read" on public.subscription_plans
  for select using (is_active = true or public.has_role(auth.uid(),'admin'));
create policy "plans_admin_write" on public.subscription_plans
  for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "addons_public_read" on public.subscription_addons
  for select using (is_active = true or public.has_role(auth.uid(),'admin'));
create policy "addons_admin_write" on public.subscription_addons
  for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- Tenants: owner or admin
create policy "tenants_owner_read" on public.tenants
  for select using (owner_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "tenants_owner_update" on public.tenants
  for update using (owner_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "tenants_admin_all" on public.tenants
  for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "tenants_authenticated_insert" on public.tenants
  for insert with check (auth.uid() is not null and (owner_id = auth.uid() or public.has_role(auth.uid(),'admin')));

-- Helper: is auth user the owner of given tenant?
create or replace function public.is_tenant_owner(_tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.tenants where id = _tenant_id and owner_id = auth.uid())
$$;

create policy "subs_owner_read" on public.subscriptions
  for select using (public.is_tenant_owner(tenant_id) or public.has_role(auth.uid(),'admin'));
create policy "subs_admin_write" on public.subscriptions
  for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "saas_pay_owner_read" on public.saas_payments
  for select using (public.is_tenant_owner(tenant_id) or public.has_role(auth.uid(),'admin'));
create policy "saas_pay_admin_write" on public.saas_payments
  for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "saas_inv_owner_read" on public.saas_invoices
  for select using (public.is_tenant_owner(tenant_id) or public.has_role(auth.uid(),'admin'));
create policy "saas_inv_admin_write" on public.saas_invoices
  for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "usage_owner_read" on public.tenant_usage
  for select using (public.is_tenant_owner(tenant_id) or public.has_role(auth.uid(),'admin'));
create policy "usage_admin_write" on public.tenant_usage
  for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "tenant_addons_owner_read" on public.tenant_addons
  for select using (public.is_tenant_owner(tenant_id) or public.has_role(auth.uid(),'admin'));
create policy "tenant_addons_admin_write" on public.tenant_addons
  for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ============== SEED PLANS ==============
insert into public.subscription_plans (name_ar, name_en, description_ar, description_en, price_monthly, price_yearly, max_branches, max_staff, max_patients, max_invoices_monthly, features, is_popular, display_order)
values
  ('الأساسية','Basic','للعيادات الصغيرة والبدايات','For small clinics and starters', 299, 2990, 1, 5, 500, 200,
    '{"dashboard":true,"patients":true,"appointments":true,"invoices":true,"inventory":false,"hr":false,"reports":false,"whatsapp":false,"api":false,"priority_support":false}'::jsonb,
    false, 1),
  ('الاحترافية','Professional','للعيادات المتوسطة متعددة الفروع','For multi-branch growing clinics', 599, 5990, 3, 15, 2000, 1000,
    '{"dashboard":true,"patients":true,"appointments":true,"invoices":true,"inventory":true,"hr":true,"reports":true,"whatsapp":false,"api":false,"priority_support":false}'::jsonb,
    true, 2),
  ('المؤسسية','Enterprise','للمستشفيات والمجموعات الكبيرة','For hospitals and large groups', 1199, 11990, 999, 999, 999999, 999999,
    '{"dashboard":true,"patients":true,"appointments":true,"invoices":true,"inventory":true,"hr":true,"reports":true,"whatsapp":true,"api":true,"priority_support":true}'::jsonb,
    false, 3)
on conflict do nothing;

-- ============== SEED DEFAULT TENANT (migrate existing admin) ==============
do $$
declare
  admin_uid uuid;
  basic_plan uuid;
  new_tenant uuid;
begin
  select user_id into admin_uid from public.user_roles where role = 'admin' order by id limit 1;
  select id into basic_plan from public.subscription_plans where name_en = 'Professional' limit 1;

  if admin_uid is not null and not exists (select 1 from public.tenants) then
    insert into public.tenants (name, slug, owner_id, plan_id, subscription_status, trial_ends_at, billing_email)
    select 'ZMedico Default Clinic', 'default', admin_uid, basic_plan, 'active', null,
           (select email from public.profiles where id = admin_uid)
    returning id into new_tenant;

    insert into public.subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
    values (new_tenant, basic_plan, 'active', 'monthly', now(), now() + interval '30 days');
  end if;
end $$;