-- Make purchase-order totals deterministic and recalculate the parent only
-- after line-item mutations have actually landed.

create or replace function public.generate_po_number()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  y int := extract(year from current_date)::int;
  n int;
begin
  insert into public.po_counters(year, last_value)
  values (y, 1)
  on conflict (year) do update
    set last_value = public.po_counters.last_value + 1
  returning last_value into n;

  return 'PO-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$function$;

revoke all on function public.generate_po_number() from public, anon, authenticated;
grant execute on function public.generate_po_number() to service_role;

create or replace function public.recalc_po_subtotal(_po_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s numeric(14,2);
begin
  select coalesce(sum(i.total), 0)::numeric(14,2)
    into s
    from public.purchase_order_items i
   where i.purchase_order_id = _po_id;

  update public.purchase_orders
     set subtotal = s
   where id = _po_id;
end;
$function$;

revoke all on function public.recalc_po_subtotal(uuid) from public, anon, authenticated;
grant execute on function public.recalc_po_subtotal(uuid) to service_role;

create or replace function public.tg_po_item_set_total()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.total := round(coalesce(new.quantity_ordered, 0) * coalesce(new.unit_cost, 0), 2);
  return new;
end;
$function$;

revoke all on function public.tg_po_item_set_total() from public, anon, authenticated;

create or replace function public.tg_po_item_recalc_parent()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_po_subtotal(old.purchase_order_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and new.purchase_order_id is distinct from old.purchase_order_id then
    perform public.recalc_po_subtotal(old.purchase_order_id);
  end if;

  perform public.recalc_po_subtotal(new.purchase_order_id);
  return new;
end;
$function$;

revoke all on function public.tg_po_item_recalc_parent() from public, anon, authenticated;

drop trigger if exists trg_po_item_iu on public.purchase_order_items;
drop trigger if exists trg_po_item_d on public.purchase_order_items;

create trigger trg_po_item_set_total
before insert or update of quantity_ordered, unit_cost
on public.purchase_order_items
for each row
execute function public.tg_po_item_set_total();

create trigger trg_po_item_recalc_after_insert_delete
after insert or delete
on public.purchase_order_items
for each row
execute function public.tg_po_item_recalc_parent();

create trigger trg_po_item_recalc_after_update
after update of purchase_order_id, quantity_ordered, unit_cost
on public.purchase_order_items
for each row
execute function public.tg_po_item_recalc_parent();

drop function if exists public.tg_po_item_aiud();

create or replace function public.tg_po_before_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.po_number is null or new.po_number = '' then
    new.po_number := public.generate_po_number();
  end if;
  new.total := round(coalesce(new.subtotal, 0) + coalesce(new.tax, 0), 2);
  return new;
end;
$function$;

revoke all on function public.tg_po_before_insert() from public, anon, authenticated;

create or replace function public.tg_po_before_update()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.total := round(coalesce(new.subtotal, 0) + coalesce(new.tax, 0), 2);
  return new;
end;
$function$;

revoke all on function public.tg_po_before_update() from public, anon, authenticated;

update public.purchase_order_items
   set total = round(quantity_ordered * unit_cost, 2)
 where total is distinct from round(quantity_ordered * unit_cost, 2);

update public.purchase_orders po
   set subtotal = x.items_subtotal
  from (
    select po2.id,
           coalesce(sum(i.total), 0)::numeric(14,2) as items_subtotal
      from public.purchase_orders po2
      left join public.purchase_order_items i
        on i.purchase_order_id = po2.id
     group by po2.id
  ) x
 where po.id = x.id
   and po.subtotal is distinct from x.items_subtotal;

alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_total_matches_line;

alter table public.purchase_order_items
  add constraint purchase_order_items_total_matches_line
  check (total = round(quantity_ordered * unit_cost, 2)) not valid;

alter table public.purchase_order_items
  validate constraint purchase_order_items_total_matches_line;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_amounts_nonnegative;

alter table public.purchase_orders
  add constraint purchase_orders_amounts_nonnegative
  check (subtotal >= 0 and tax >= 0 and total >= 0) not valid;

alter table public.purchase_orders
  validate constraint purchase_orders_amounts_nonnegative;
