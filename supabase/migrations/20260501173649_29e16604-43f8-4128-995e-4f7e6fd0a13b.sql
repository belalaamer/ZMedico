
-- Enums
create type public.invoice_status as enum ('draft','pending','paid','partial','cancelled');
create type public.invoice_item_type as enum ('service','product','procedure');
create type public.payment_method as enum ('cash','card','bank_transfer','insurance','wallet');
create type public.treasury_tx_type as enum ('income','expense','transfer');
create type public.expense_method as enum ('cash','card','bank_transfer');

-- Sequence per year for invoice numbers (use 1 sequence; year reset handled in func)
create table public.invoice_counters (
  year int primary key,
  last_value int not null default 0
);
alter table public.invoice_counters enable row level security;

-- Invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  patient_id uuid not null references public.patients(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  status invoice_status not null default 'draft',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
create index idx_invoices_patient on public.invoices(patient_id);
create index idx_invoices_branch on public.invoices(branch_id);
create index idx_invoices_date on public.invoices(invoice_date desc);

-- Invoice items
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description_en text not null,
  description_ar text,
  quantity numeric(14,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  item_type invoice_item_type not null default 'service',
  created_at timestamptz not null default now()
);
alter table public.invoice_items enable row level security;
create index idx_invoice_items_invoice on public.invoice_items(invoice_id);

-- Treasury
create table public.treasury (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name_en text not null,
  name_ar text not null,
  current_balance numeric(14,2) not null default 0,
  currency text not null default 'EGP',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.treasury enable row level security;
create index idx_treasury_branch on public.treasury(branch_id);

-- Treasury transactions
create table public.treasury_transactions (
  id uuid primary key default gen_random_uuid(),
  treasury_id uuid not null references public.treasury(id) on delete cascade,
  transaction_type treasury_tx_type not null,
  amount numeric(14,2) not null check (amount > 0),
  balance_after numeric(14,2) not null,
  reference_type text,
  reference_id uuid,
  description_en text not null,
  description_ar text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.treasury_transactions enable row level security;
create index idx_tx_treasury on public.treasury_transactions(treasury_id, created_at desc);

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete set null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  treasury_id uuid references public.treasury(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method payment_method not null default 'cash',
  payment_date date not null default current_date,
  reference_number text,
  notes text,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create index idx_payments_invoice on public.payments(invoice_id);
create index idx_payments_patient on public.payments(patient_id);

-- Expense categories
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  branch_id uuid references public.branches(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.expense_categories enable row level security;

-- Expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category_id uuid references public.expense_categories(id) on delete set null,
  treasury_id uuid references public.treasury(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  description_en text not null,
  description_ar text,
  expense_date date not null default current_date,
  payment_method expense_method not null default 'cash',
  receipt_image text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
create index idx_expenses_branch on public.expenses(branch_id, expense_date desc);

-- updated_at triggers
create trigger trg_invoices_updated before update on public.invoices for each row execute function public.tg_set_updated_at();
create trigger trg_treasury_updated before update on public.treasury for each row execute function public.tg_set_updated_at();

-- ============ Functions ============

-- Generate invoice number INV-YYYY-NNNN
create or replace function public.generate_invoice_number()
returns text language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from current_date)::int;
  n int;
begin
  insert into public.invoice_counters (year, last_value) values (y, 1)
  on conflict (year) do update set last_value = public.invoice_counters.last_value + 1
  returning last_value into n;
  return 'INV-' || y::text || '-' || lpad(n::text, 4, '0');
end; $$;

-- Trigger: assign number + compute totals
create or replace function public.tg_invoice_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := public.generate_invoice_number();
  end if;
  new.total := coalesce(new.subtotal,0) - coalesce(new.discount,0) + coalesce(new.tax,0);
  return new;
end; $$;
create trigger trg_invoice_bi before insert on public.invoices
  for each row execute function public.tg_invoice_before_insert();

create or replace function public.tg_invoice_before_update()
returns trigger language plpgsql as $$
begin
  new.total := coalesce(new.subtotal,0) - coalesce(new.discount,0) + coalesce(new.tax,0);
  return new;
end; $$;
create trigger trg_invoice_bu before update on public.invoices
  for each row execute function public.tg_invoice_before_update();

-- Recalculate invoice subtotal from items
create or replace function public.recalc_invoice_subtotal(_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s numeric(14,2);
begin
  select coalesce(sum(total),0) into s from public.invoice_items where invoice_id = _invoice_id;
  update public.invoices set subtotal = s where id = _invoice_id;
end; $$;

create or replace function public.tg_invoice_item_aiud()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_invoice_subtotal(old.invoice_id);
    return old;
  else
    new.total := coalesce(new.quantity,0) * coalesce(new.unit_price,0);
    perform public.recalc_invoice_subtotal(new.invoice_id);
    return new;
  end if;
end; $$;
create trigger trg_invoice_item_bi before insert on public.invoice_items
  for each row execute function public.tg_invoice_item_aiud();
create trigger trg_invoice_item_bu before update on public.invoice_items
  for each row execute function public.tg_invoice_item_aiud();
create trigger trg_invoice_item_ad after delete on public.invoice_items
  for each row execute function public.tg_invoice_item_aiud();

-- Update invoice paid_amount / status from payments
create or replace function public.recalc_invoice_payments(_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  paid numeric(14,2);
  inv record;
begin
  if _invoice_id is null then return; end if;
  select coalesce(sum(amount),0) into paid from public.payments where invoice_id = _invoice_id;
  select * into inv from public.invoices where id = _invoice_id;
  if inv.id is null then return; end if;
  update public.invoices
    set paid_amount = paid,
        status = case
          when status = 'cancelled' then 'cancelled'
          when paid <= 0 then case when status = 'draft' then 'draft' else 'pending' end
          when paid >= inv.total then 'paid'
          else 'partial'
        end
    where id = _invoice_id;
end; $$;

-- Treasury helpers
create or replace function public.add_treasury_tx(
  _treasury_id uuid, _type treasury_tx_type, _amount numeric,
  _ref_type text, _ref_id uuid, _desc_en text, _desc_ar text, _by uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cur numeric(14,2);
  new_balance numeric(14,2);
  delta numeric(14,2);
  new_id uuid;
begin
  select current_balance into cur from public.treasury where id = _treasury_id for update;
  if cur is null then
    raise exception 'Treasury % not found', _treasury_id;
  end if;
  delta := case when _type = 'income' then _amount else -_amount end;
  new_balance := cur + delta;
  insert into public.treasury_transactions(
    treasury_id, transaction_type, amount, balance_after,
    reference_type, reference_id, description_en, description_ar, created_by
  ) values (
    _treasury_id, _type, _amount, new_balance,
    _ref_type, _ref_id, _desc_en, _desc_ar, _by
  ) returning id into new_id;
  update public.treasury set current_balance = new_balance, updated_at = now() where id = _treasury_id;
  return new_id;
end; $$;

-- Default treasury per branch
create or replace function public.default_treasury_for_branch(_branch_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from public.treasury where branch_id = _branch_id and is_active = true order by created_at limit 1;
  return t;
end; $$;

-- After payment insert: link treasury & create income tx, recalc invoice
create or replace function public.tg_payment_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  t := new.treasury_id;
  if t is null and new.branch_id is not null then
    t := public.default_treasury_for_branch(new.branch_id);
    if t is not null then
      update public.payments set treasury_id = t where id = new.id;
    end if;
  end if;
  if t is not null then
    perform public.add_treasury_tx(
      t, 'income'::treasury_tx_type, new.amount,
      'payment', new.id,
      'Payment received #' || coalesce(new.reference_number, substring(new.id::text,1,8)),
      'دفعة مستلمة #' || coalesce(new.reference_number, substring(new.id::text,1,8)),
      new.received_by
    );
  end if;
  if new.invoice_id is not null then
    perform public.recalc_invoice_payments(new.invoice_id);
  end if;
  return new;
end; $$;
create trigger trg_payment_ai after insert on public.payments
  for each row execute function public.tg_payment_after_insert();

-- After expense insert: create expense treasury tx
create or replace function public.tg_expense_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  t := new.treasury_id;
  if t is null then
    t := public.default_treasury_for_branch(new.branch_id);
    if t is not null then
      update public.expenses set treasury_id = t where id = new.id;
    end if;
  end if;
  if t is not null then
    perform public.add_treasury_tx(
      t, 'expense'::treasury_tx_type, new.amount,
      'expense', new.id,
      coalesce(new.description_en, 'Expense'),
      coalesce(new.description_ar, 'مصروف'),
      new.created_by
    );
  end if;
  return new;
end; $$;
create trigger trg_expense_ai after insert on public.expenses
  for each row execute function public.tg_expense_after_insert();

-- Auto-create default treasury per branch
create or replace function public.tg_branch_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.treasury (branch_id, name_en, name_ar, current_balance)
  values (new.id, 'Clinic Safe', 'خزينة العيادة', 0);
  return new;
end; $$;
create trigger trg_branch_ai after insert on public.branches
  for each row execute function public.tg_branch_after_insert();

-- Backfill existing branches with a default treasury
insert into public.treasury (branch_id, name_en, name_ar, current_balance)
select b.id, 'Clinic Safe', 'خزينة العيادة', 0
from public.branches b
where not exists (select 1 from public.treasury t where t.branch_id = b.id);

-- ============ RLS POLICIES ============
-- Helper: any authenticated for read; admin for delete/destructive

-- invoice_counters: only system functions touch it; no public policies = no access
-- (functions are SECURITY DEFINER so they can write)

-- invoices
create policy "invoices_select_auth" on public.invoices for select to authenticated using (true);
create policy "invoices_insert_auth" on public.invoices for insert to authenticated with check (true);
create policy "invoices_update_admin" on public.invoices for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "invoices_delete_admin" on public.invoices for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- invoice_items
create policy "items_select_auth" on public.invoice_items for select to authenticated using (true);
create policy "items_insert_auth" on public.invoice_items for insert to authenticated with check (true);
create policy "items_update_auth" on public.invoice_items for update to authenticated using (true);
create policy "items_delete_auth" on public.invoice_items for delete to authenticated using (true);

-- payments
create policy "pay_select_auth" on public.payments for select to authenticated using (true);
create policy "pay_insert_auth" on public.payments for insert to authenticated with check (true);
create policy "pay_update_own_or_admin" on public.payments for update to authenticated
  using (received_by = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "pay_delete_admin" on public.payments for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- treasury
create policy "tre_select_auth" on public.treasury for select to authenticated using (true);
create policy "tre_admin_all" on public.treasury for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- treasury transactions: read for all, insert via SECURITY DEFINER funcs (no insert policy needed for direct), allow admin to delete (audit)
create policy "tx_select_auth" on public.treasury_transactions for select to authenticated using (true);
create policy "tx_admin_delete" on public.treasury_transactions for delete to authenticated using (public.has_role(auth.uid(),'admin'));
-- Allow admins to manually insert/adjust if needed
create policy "tx_admin_insert" on public.treasury_transactions for insert to authenticated with check (public.has_role(auth.uid(),'admin'));

-- expense categories
create policy "cat_select_auth" on public.expense_categories for select to authenticated using (true);
create policy "cat_admin_all" on public.expense_categories for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- expenses
create policy "exp_select_auth" on public.expenses for select to authenticated using (true);
create policy "exp_insert_auth" on public.expenses for insert to authenticated with check (true);
create policy "exp_update_admin" on public.expenses for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "exp_delete_admin" on public.expenses for delete to authenticated using (public.has_role(auth.uid(),'admin'));

-- Seed expense categories (global)
insert into public.expense_categories (name_en, name_ar) values
  ('Rent','الإيجار'),
  ('Utilities','المرافق'),
  ('Salaries','الرواتب'),
  ('Supplies','المستلزمات'),
  ('Maintenance','الصيانة'),
  ('Marketing','التسويق'),
  ('Other','أخرى');
