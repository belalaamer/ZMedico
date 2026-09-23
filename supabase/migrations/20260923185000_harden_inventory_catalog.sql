-- Harden inventory catalog lifecycle while preserving legacy historical rows.

alter table public.products
  drop constraint if exists products_price_stock_bounds;

alter table public.products
  add constraint products_price_stock_bounds
  check (
    cost_price >= 0
    and selling_price >= 0
    and min_stock_level >= 0
    and (max_stock_level is null or max_stock_level >= min_stock_level)
  ) not valid;

alter table public.products
  validate constraint products_price_stock_bounds;

-- Product hard-deletes must never erase the stock ledger or alert history.
alter table public.inventory
  drop constraint inventory_product_id_fkey;
alter table public.inventory
  add constraint inventory_product_id_fkey
  foreign key (product_id) references public.products(id) on delete restrict;

alter table public.inventory_transactions
  drop constraint inventory_transactions_product_id_fkey;
alter table public.inventory_transactions
  add constraint inventory_transactions_product_id_fkey
  foreign key (product_id) references public.products(id) on delete restrict;

alter table public.stock_alerts
  drop constraint stock_alerts_product_id_fkey;
alter table public.stock_alerts
  add constraint stock_alerts_product_id_fkey
  foreign key (product_id) references public.products(id) on delete restrict;

revoke delete on table public.products from authenticated;
revoke delete on table public.suppliers from authenticated;
revoke delete on table public.product_categories from authenticated;

drop policy if exists prd_delete on public.products;
drop policy if exists sup_delete on public.suppliers;
drop policy if exists cat_delete on public.product_categories;

create or replace function public.guard_inventory_catalog_update()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'Inventory catalog tenant ownership is immutable'
      using errcode = '42501';
  end if;

  if tg_table_name = 'products'
     and new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is not null or new.deleted_at is null then
      raise exception 'Archived products cannot be restored directly'
        using errcode = '42501';
    end if;

    if v_actor is null
       or not public.has_permission(v_actor, 'inventory.delete') then
      raise exception 'Forbidden: missing permission inventory.delete'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.inventory i
      where i.product_id = old.id
        and (i.quantity <> 0 or i.reserved_quantity <> 0)
    ) then
      raise exception 'Product cannot be archived while stock or reservations remain'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id
      where poi.product_id = old.id
        and po.deleted_at is null
        and po.status in (
          'draft'::public.po_status,
          'pending'::public.po_status,
          'partial'::public.po_status
        )
    ) then
      raise exception 'Product cannot be archived while referenced by an open purchase order'
        using errcode = '23514';
    end if;

    if exists (
      select 1 from public.service_consumables sc
      where sc.product_id = old.id
    ) then
      raise exception 'Product cannot be archived while used as a service consumable'
        using errcode = '23514';
    end if;

    if exists (
      select 1 from public.medications m
      where m.product_id = old.id
    ) then
      raise exception 'Product cannot be archived while linked to a medication'
        using errcode = '23514';
    end if;

    new.deleted_at := now();
    new.is_active := false;
  elsif tg_table_name = 'suppliers'
        and new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is not null or new.deleted_at is null then
      raise exception 'Archived suppliers cannot be restored directly'
        using errcode = '42501';
    end if;

    if v_actor is null
       or not public.has_permission(v_actor, 'inventory.delete') then
      raise exception 'Forbidden: missing permission inventory.delete'
        using errcode = '42501';
    end if;

    if exists (
      select 1 from public.products p
      where p.supplier_id = old.id
        and p.deleted_at is null
    ) then
      raise exception 'Supplier cannot be archived while active products reference it'
        using errcode = '23514';
    end if;

    if exists (
      select 1 from public.purchase_orders po
      where po.supplier_id = old.id
        and po.deleted_at is null
        and po.status in (
          'draft'::public.po_status,
          'pending'::public.po_status,
          'partial'::public.po_status
        )
    ) then
      raise exception 'Supplier cannot be archived while open purchase orders reference it'
        using errcode = '23514';
    end if;

    new.deleted_at := now();
    new.is_active := false;
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_inventory_catalog_update()
from public, anon, authenticated;

drop trigger if exists trg_guard_product_catalog_update on public.products;
create trigger trg_guard_product_catalog_update
before update of tenant_id, deleted_at
on public.products
for each row
execute function public.guard_inventory_catalog_update();

drop trigger if exists trg_guard_supplier_catalog_update on public.suppliers;
create trigger trg_guard_supplier_catalog_update
before update of tenant_id, deleted_at
on public.suppliers
for each row
execute function public.guard_inventory_catalog_update();

create or replace function public.guard_product_category_hierarchy()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE'
     and new.tenant_id is distinct from old.tenant_id
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Category tenant ownership is immutable'
      using errcode = '42501';
  end if;

  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Category cannot be its own parent'
      using errcode = '23514';
  end if;

  if exists (
    with recursive descendants as (
      select c.id
      from public.product_categories c
      where c.parent_id = new.id
      union all
      select c.id
      from public.product_categories c
      join descendants d on c.parent_id = d.id
    )
    select 1 from descendants where id = new.parent_id
  ) then
    raise exception 'Category hierarchy cycle is not allowed'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_product_category_hierarchy()
from public, anon, authenticated;

drop trigger if exists trg_guard_product_category_hierarchy
on public.product_categories;

create trigger trg_guard_product_category_hierarchy
before insert or update of parent_id, tenant_id
on public.product_categories
for each row
execute function public.guard_product_category_hierarchy();

create or replace function public.archive_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_product public.products%rowtype;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.delete') then
    raise exception 'Forbidden: missing permission inventory.delete'
      using errcode = '42501';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Product not found'
      using errcode = 'P0002';
  end if;

  if v_product.tenant_id is null
     or not public.user_has_tenant_access(v_product.tenant_id) then
    raise exception 'Forbidden: product is outside the caller tenant'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.inventory i
    where i.product_id = v_product.id
      and (i.quantity <> 0 or i.reserved_quantity <> 0)
  ) then
    raise exception 'Product cannot be archived while stock or reservations remain'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
    where poi.product_id = v_product.id
      and po.deleted_at is null
      and po.status in (
        'draft'::public.po_status,
        'pending'::public.po_status,
        'partial'::public.po_status
      )
  ) then
    raise exception 'Product cannot be archived while referenced by an open purchase order'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.service_consumables sc
    where sc.product_id = v_product.id
  ) then
    raise exception 'Product cannot be archived while used as a service consumable'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.medications m
    where m.product_id = v_product.id
  ) then
    raise exception 'Product cannot be archived while linked to a medication'
      using errcode = '23514';
  end if;

  update public.products
  set deleted_at = now(),
      is_active = false
  where id = v_product.id;
end;
$function$;

revoke all on function public.archive_product(uuid)
from public, anon;
grant execute on function public.archive_product(uuid)
to authenticated, service_role;

create or replace function public.archive_supplier(p_supplier_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_supplier public.suppliers%rowtype;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.delete') then
    raise exception 'Forbidden: missing permission inventory.delete'
      using errcode = '42501';
  end if;

  select * into v_supplier
  from public.suppliers
  where id = p_supplier_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Supplier not found'
      using errcode = 'P0002';
  end if;

  if v_supplier.tenant_id is null
     or not public.user_has_tenant_access(v_supplier.tenant_id) then
    raise exception 'Forbidden: supplier is outside the caller tenant'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.products p
    where p.supplier_id = v_supplier.id
      and p.deleted_at is null
  ) then
    raise exception 'Supplier cannot be archived while active products reference it'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.purchase_orders po
    where po.supplier_id = v_supplier.id
      and po.deleted_at is null
      and po.status in (
        'draft'::public.po_status,
        'pending'::public.po_status,
        'partial'::public.po_status
      )
  ) then
    raise exception 'Supplier cannot be archived while open purchase orders reference it'
      using errcode = '23514';
  end if;

  update public.suppliers
  set deleted_at = now(),
      is_active = false
  where id = v_supplier.id;
end;
$function$;

revoke all on function public.archive_supplier(uuid)
from public, anon;
grant execute on function public.archive_supplier(uuid)
to authenticated, service_role;

create or replace function public.delete_product_category(p_category_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_category public.product_categories%rowtype;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.delete') then
    raise exception 'Forbidden: missing permission inventory.delete'
      using errcode = '42501';
  end if;

  select * into v_category
  from public.product_categories
  where id = p_category_id
  for update;

  if not found then
    raise exception 'Category not found'
      using errcode = 'P0002';
  end if;

  if v_category.tenant_id is null
     or not public.user_has_tenant_access(v_category.tenant_id) then
    raise exception 'Forbidden: category is outside the caller tenant'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.product_categories c
    where c.parent_id = v_category.id
  ) then
    raise exception 'Category cannot be deleted while child categories exist'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.products p
    where p.category_id = v_category.id
      and p.deleted_at is null
  ) then
    raise exception 'Category cannot be deleted while products reference it'
      using errcode = '23514';
  end if;

  delete from public.product_categories
  where id = v_category.id;
end;
$function$;

revoke all on function public.delete_product_category(uuid)
from public, anon;
grant execute on function public.delete_product_category(uuid)
to authenticated, service_role;
