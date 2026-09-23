-- Protect purchase_order_items receipt state from direct client tampering.
-- Stock receipt must flow through receive_po_item(), which is SECURITY DEFINER
-- and performs permission, branch, status, quantity, and locking checks.

alter table public.purchase_order_items
  add constraint purchase_order_items_quantity_ordered_positive
    check (quantity_ordered > 0) not valid,
  add constraint purchase_order_items_quantity_received_bounds
    check (quantity_received >= 0 and quantity_received <= quantity_ordered) not valid,
  add constraint purchase_order_items_unit_cost_nonnegative
    check (unit_cost >= 0) not valid;

alter table public.purchase_order_items
  validate constraint purchase_order_items_quantity_ordered_positive;
alter table public.purchase_order_items
  validate constraint purchase_order_items_quantity_received_bounds;
alter table public.purchase_order_items
  validate constraint purchase_order_items_unit_cost_nonnegative;

create or replace function public.guard_purchase_order_item_received_quantity()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'INSERT' and coalesce(new.quantity_received, 0) <> 0 then
      raise exception 'quantity_received must start at zero and can only change through receive_po_item'
        using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
       and new.quantity_received is distinct from old.quantity_received then
      raise exception 'quantity_received can only change through receive_po_item'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_purchase_order_item_received_quantity()
from public, anon, authenticated;

drop trigger if exists trg_guard_po_item_received_quantity
on public.purchase_order_items;

create trigger trg_guard_po_item_received_quantity
before insert or update of quantity_received
on public.purchase_order_items
for each row
execute function public.guard_purchase_order_item_received_quantity();
