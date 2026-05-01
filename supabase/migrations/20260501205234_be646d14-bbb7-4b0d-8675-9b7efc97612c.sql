-- =========================================================
-- ENUMS
-- =========================================================
create type public.inventory_tx_type as enum (
  'purchase', 'sale', 'adjustment', 'transfer_in', 'transfer_out', 'return', 'expiry'
);
create type public.po_status as enum ('draft','pending','partial','received','cancelled');
create type public.alert_type as enum ('low_stock','out_of_stock','expiring_soon','expired');

-- =========================================================
-- TABLES
-- =========================================================

-- Categories
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  description text,
  parent_id uuid references public.product_categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_categories_parent on public.product_categories(parent_id);

-- Suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  tax_number text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SKU counter
create table public.product_sku_counter (
  id int primary key default 1,
  last_value int not null default 0,
  check (id = 1)
);
insert into public.product_sku_counter(id, last_value) values (1, 0);

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  barcode text unique,
  name_en text not null,
  name_ar text not null,
  description_en text,
  description_ar text,
  category_id uuid references public.product_categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  unit text not null default 'piece',
  cost_price numeric(14,2) not null default 0,
  selling_price numeric(14,2) not null default 0,
  min_stock_level integer not null default 10,
  max_stock_level integer,
  expiry_tracking boolean not null default false,
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category on public.products(category_id);
create index idx_products_supplier on public.products(supplier_id);
create index idx_products_active on public.products(is_active);

-- Inventory (stock per branch)
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  reserved_quantity numeric(14,3) not null default 0,
  available_quantity numeric(14,3) generated always as (quantity - reserved_quantity) stored,
  last_restocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, branch_id)
);
create index idx_inventory_branch on public.inventory(branch_id);
create index idx_inventory_product on public.inventory(product_id);

-- Inventory transactions
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  transaction_type public.inventory_tx_type not null,
  quantity numeric(14,3) not null,            -- signed: + in, - out
  quantity_before numeric(14,3) not null default 0,
  quantity_after numeric(14,3) not null default 0,
  unit_cost numeric(14,2),
  reference_type text,
  reference_id uuid,
  notes_en text,
  notes_ar text,
  expiry_date date,
  batch_number text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index idx_invtx_product on public.inventory_transactions(product_id);
create index idx_invtx_branch on public.inventory_transactions(branch_id);
create index idx_invtx_created on public.inventory_transactions(created_at desc);

-- PO counter
create table public.po_counters (
  year int primary key,
  last_value int not null default 0
);

-- Purchase Orders
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text unique not null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  order_date date not null default current_date,
  expected_date date,
  status public.po_status not null default 'draft',
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_po_supplier on public.purchase_orders(supplier_id);
create index idx_po_branch on public.purchase_orders(branch_id);
create index idx_po_status on public.purchase_orders(status);

-- PO items
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_ordered numeric(14,3) not null default 1,
  quantity_received numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_poi_po on public.purchase_order_items(purchase_order_id);
create index idx_poi_product on public.purchase_order_items(product_id);

-- Stock alerts
create table public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  alert_type public.alert_type not null,
  quantity numeric(14,3) not null default 0,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index idx_alerts_unresolved on public.stock_alerts(is_resolved) where is_resolved = false;
create index idx_alerts_branch on public.stock_alerts(branch_id);

-- =========================================================
-- updated_at triggers
-- =========================================================
create trigger trg_categories_updated before update on public.product_categories for each row execute function public.tg_set_updated_at();
create trigger trg_suppliers_updated before update on public.suppliers for each row execute function public.tg_set_updated_at();
create trigger trg_products_updated before update on public.products for each row execute function public.tg_set_updated_at();
create trigger trg_inventory_updated before update on public.inventory for each row execute function public.tg_set_updated_at();
create trigger trg_po_updated before update on public.purchase_orders for each row execute function public.tg_set_updated_at();

-- =========================================================
-- FUNCTIONS
-- =========================================================

-- Generate SKU
create or replace function public.generate_product_sku()
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.product_sku_counter set last_value = last_value + 1 where id = 1 returning last_value into n;
  return 'PRD-' || lpad(n::text, 4, '0');
end; $$;

-- Generate PO number
create or replace function public.generate_po_number()
returns text language plpgsql security definer set search_path = public as $$
declare y int := extract(year from current_date)::int; n int;
begin
  insert into public.po_counters(year, last_value) values (y, 1)
    on conflict (year) do update set last_value = public.po_counters.last_value + 1
    returning last_value into n;
  return 'PO-' || y::text || '-' || lpad(n::text, 4, '0');
end; $$;

-- Auto SKU before insert
create or replace function public.tg_product_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sku is null or new.sku = '' then new.sku := public.generate_product_sku(); end if;
  return new;
end; $$;
create trigger trg_product_before_insert before insert on public.products for each row execute function public.tg_product_before_insert();

-- Auto PO number before insert + total recompute
create or replace function public.tg_po_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.po_number is null or new.po_number = '' then new.po_number := public.generate_po_number(); end if;
  new.total := coalesce(new.subtotal,0) + coalesce(new.tax,0);
  return new;
end; $$;
create trigger trg_po_before_insert before insert on public.purchase_orders for each row execute function public.tg_po_before_insert();

create or replace function public.tg_po_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.total := coalesce(new.subtotal,0) + coalesce(new.tax,0);
  return new;
end; $$;
create trigger trg_po_before_update before update on public.purchase_orders for each row execute function public.tg_po_before_update();

-- Recompute PO subtotal from its items
create or replace function public.recalc_po_subtotal(_po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s numeric(14,2);
begin
  select coalesce(sum(total),0) into s from public.purchase_order_items where purchase_order_id = _po_id;
  update public.purchase_orders set subtotal = s where id = _po_id;
end; $$;

create or replace function public.tg_po_item_aiud()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_po_subtotal(old.purchase_order_id);
    return old;
  else
    new.total := coalesce(new.quantity_ordered,0) * coalesce(new.unit_cost,0);
    perform public.recalc_po_subtotal(new.purchase_order_id);
    return new;
  end if;
end; $$;
create trigger trg_po_item_iu before insert or update on public.purchase_order_items for each row execute function public.tg_po_item_aiud();
create trigger trg_po_item_d after delete on public.purchase_order_items for each row execute function public.tg_po_item_aiud();

-- Apply an inventory transaction (handles balance & locking)
create or replace function public.apply_inventory_tx(
  _product_id uuid, _branch_id uuid, _type inventory_tx_type, _signed_qty numeric,
  _unit_cost numeric, _ref_type text, _ref_id uuid,
  _notes_en text, _notes_ar text,
  _expiry date, _batch text, _by uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  cur numeric(14,3);
  newq numeric(14,3);
  inv_id uuid;
  tx_id uuid;
begin
  -- Ensure inventory row exists, lock it
  insert into public.inventory(product_id, branch_id, quantity)
    values (_product_id, _branch_id, 0)
    on conflict (product_id, branch_id) do nothing;
  select id, quantity into inv_id, cur from public.inventory
    where product_id = _product_id and branch_id = _branch_id for update;

  newq := cur + _signed_qty;
  if newq < 0 then
    raise exception 'Insufficient stock: have %, need %', cur, abs(_signed_qty);
  end if;

  update public.inventory
    set quantity = newq,
        last_restocked_at = case when _signed_qty > 0 then now() else last_restocked_at end,
        updated_at = now()
    where id = inv_id;

  insert into public.inventory_transactions(
    product_id, branch_id, transaction_type, quantity, quantity_before, quantity_after,
    unit_cost, reference_type, reference_id, notes_en, notes_ar, expiry_date, batch_number, created_by
  ) values (
    _product_id, _branch_id, _type, _signed_qty, cur, newq,
    _unit_cost, _ref_type, _ref_id, _notes_en, _notes_ar, _expiry, _batch, _by
  ) returning id into tx_id;

  return tx_id;
end; $$;

-- Generate stock alerts after inventory change
create or replace function public.tg_inventory_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prod record;
begin
  select min_stock_level into prod from public.products where id = new.product_id;
  if prod is null then return new; end if;

  -- Resolve previous unresolved alerts for this product/branch when stock returns to OK
  if new.quantity > prod.min_stock_level then
    update public.stock_alerts
      set is_resolved = true, resolved_at = now()
      where product_id = new.product_id and branch_id = new.branch_id
        and alert_type in ('low_stock','out_of_stock') and is_resolved = false;
    return new;
  end if;

  if new.quantity <= 0 then
    -- close any low_stock open alert
    update public.stock_alerts set is_resolved = true, resolved_at = now()
      where product_id = new.product_id and branch_id = new.branch_id
        and alert_type = 'low_stock' and is_resolved = false;
    if not exists (select 1 from public.stock_alerts
      where product_id = new.product_id and branch_id = new.branch_id
        and alert_type = 'out_of_stock' and is_resolved = false) then
      insert into public.stock_alerts(product_id, branch_id, alert_type, quantity)
        values (new.product_id, new.branch_id, 'out_of_stock', new.quantity);
    end if;
  elsif new.quantity <= prod.min_stock_level then
    if not exists (select 1 from public.stock_alerts
      where product_id = new.product_id and branch_id = new.branch_id
        and alert_type = 'low_stock' and is_resolved = false) then
      insert into public.stock_alerts(product_id, branch_id, alert_type, quantity)
        values (new.product_id, new.branch_id, 'low_stock', new.quantity);
    end if;
  end if;
  return new;
end; $$;
create trigger trg_inventory_after_update after update of quantity on public.inventory for each row execute function public.tg_inventory_after_update();

-- Receive items from a PO (creates inventory transactions and updates received qty)
create or replace function public.receive_po_item(
  _po_item_id uuid, _qty numeric, _expiry date, _batch text, _by uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  po record;
  it record;
  total_ord numeric;
  total_rec numeric;
  new_status po_status;
begin
  select * into it from public.purchase_order_items where id = _po_item_id;
  if it.id is null then raise exception 'PO item not found'; end if;
  select * into po from public.purchase_orders where id = it.purchase_order_id;

  perform public.apply_inventory_tx(
    it.product_id, po.branch_id, 'purchase'::inventory_tx_type, _qty,
    it.unit_cost, 'purchase_order', po.id,
    'Received from PO ' || po.po_number, 'استلام من أمر شراء ' || po.po_number,
    _expiry, _batch, _by
  );

  update public.purchase_order_items
    set quantity_received = quantity_received + _qty
    where id = _po_item_id;

  select coalesce(sum(quantity_ordered),0), coalesce(sum(quantity_received),0)
    into total_ord, total_rec
    from public.purchase_order_items where purchase_order_id = po.id;

  if total_rec >= total_ord then new_status := 'received';
  elsif total_rec > 0 then new_status := 'partial';
  else new_status := po.status; end if;

  update public.purchase_orders set status = new_status where id = po.id;
end; $$;

-- =========================================================
-- RLS
-- =========================================================
alter table public.product_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.stock_alerts enable row level security;
alter table public.product_sku_counter enable row level security;
alter table public.po_counters enable row level security;

-- Categories
create policy "cat_select" on public.product_categories for select to authenticated using (true);
create policy "cat_insert" on public.product_categories for insert to authenticated with check (true);
create policy "cat_update" on public.product_categories for update to authenticated using (true);
create policy "cat_delete_admin" on public.product_categories for delete to authenticated using (has_role(auth.uid(),'admin'));

-- Suppliers
create policy "sup_select" on public.suppliers for select to authenticated using (true);
create policy "sup_insert" on public.suppliers for insert to authenticated with check (true);
create policy "sup_update" on public.suppliers for update to authenticated using (true);
create policy "sup_delete_admin" on public.suppliers for delete to authenticated using (has_role(auth.uid(),'admin'));

-- Products
create policy "prd_select" on public.products for select to authenticated using (true);
create policy "prd_insert" on public.products for insert to authenticated with check (true);
create policy "prd_update" on public.products for update to authenticated using (true);
create policy "prd_delete_admin" on public.products for delete to authenticated using (has_role(auth.uid(),'admin'));

-- Inventory
create policy "inv_select" on public.inventory for select to authenticated using (true);
create policy "inv_insert" on public.inventory for insert to authenticated with check (true);
create policy "inv_update" on public.inventory for update to authenticated using (true);
create policy "inv_delete_admin" on public.inventory for delete to authenticated using (has_role(auth.uid(),'admin'));

-- Inventory transactions
create policy "invtx_select" on public.inventory_transactions for select to authenticated using (true);
create policy "invtx_insert" on public.inventory_transactions for insert to authenticated with check (true);
create policy "invtx_delete_admin" on public.inventory_transactions for delete to authenticated using (has_role(auth.uid(),'admin'));

-- POs
create policy "po_select" on public.purchase_orders for select to authenticated using (true);
create policy "po_insert" on public.purchase_orders for insert to authenticated with check (true);
create policy "po_update" on public.purchase_orders for update to authenticated using (true);
create policy "po_delete_admin" on public.purchase_orders for delete to authenticated using (has_role(auth.uid(),'admin'));

create policy "poi_select" on public.purchase_order_items for select to authenticated using (true);
create policy "poi_insert" on public.purchase_order_items for insert to authenticated with check (true);
create policy "poi_update" on public.purchase_order_items for update to authenticated using (true);
create policy "poi_delete" on public.purchase_order_items for delete to authenticated using (true);

-- Alerts
create policy "alerts_select" on public.stock_alerts for select to authenticated using (true);
create policy "alerts_insert" on public.stock_alerts for insert to authenticated with check (true);
create policy "alerts_update" on public.stock_alerts for update to authenticated using (true);
create policy "alerts_delete_admin" on public.stock_alerts for delete to authenticated using (has_role(auth.uid(),'admin'));

-- Counters: select only (writes via SECURITY DEFINER functions)
create policy "sku_counter_select" on public.product_sku_counter for select to authenticated using (true);
create policy "po_counter_select" on public.po_counters for select to authenticated using (true);