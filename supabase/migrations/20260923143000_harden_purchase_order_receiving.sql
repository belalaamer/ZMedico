-- Harden purchase-order receiving against invalid status, deleted orders,
-- negative/zero quantities, over-receipt, and concurrent double-receipt.
-- Keep the existing RPC signature for application compatibility.

create or replace function public.receive_po_item(
  _po_item_id uuid,
  _qty numeric,
  _expiry date,
  _batch text,
  _by uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  po public.purchase_orders%rowtype;
  it public.purchase_order_items%rowtype;
  total_ord numeric;
  total_rec numeric;
  remaining numeric;
  new_status public.po_status;
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'purchase_orders.receive') then
    raise exception 'Forbidden: missing permission purchase_orders.receive'
      using errcode = '42501';
  end if;

  if _qty is null or _qty <= 0 then
    raise exception 'Receive quantity must be greater than zero'
      using errcode = '22023';
  end if;

  select *
    into it
    from public.purchase_order_items
   where id = _po_item_id
   for update;

  if not found then
    raise exception 'PO item not found'
      using errcode = 'P0002';
  end if;

  select *
    into po
    from public.purchase_orders
   where id = it.purchase_order_id
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Purchase order not found or deleted'
      using errcode = 'P0002';
  end if;

  if po.status not in ('pending'::public.po_status, 'partial'::public.po_status) then
    raise exception 'Purchase order cannot receive items in status %', po.status
      using errcode = '23514';
  end if;

  remaining := it.quantity_ordered - it.quantity_received;

  if remaining <= 0 then
    raise exception 'PO item is already fully received'
      using errcode = '23514';
  end if;

  if _qty > remaining then
    raise exception 'Receive quantity % exceeds remaining quantity %', _qty, remaining
      using errcode = '23514';
  end if;

  perform public.apply_inventory_tx(
    it.product_id,
    po.branch_id,
    'purchase'::public.inventory_tx_type,
    _qty,
    it.unit_cost,
    'purchase_order',
    po.id,
    'Received from PO ' || po.po_number,
    'استلام من أمر شراء ' || po.po_number,
    _expiry,
    _batch,
    v_actor
  );

  update public.purchase_order_items
     set quantity_received = quantity_received + _qty
   where id = _po_item_id;

  select coalesce(sum(quantity_ordered), 0),
         coalesce(sum(quantity_received), 0)
    into total_ord, total_rec
    from public.purchase_order_items
   where purchase_order_id = po.id;

  if total_rec >= total_ord then
    new_status := 'received'::public.po_status;
  else
    new_status := 'partial'::public.po_status;
  end if;

  update public.purchase_orders
     set status = new_status
   where id = po.id;
end;
$function$;

revoke all on function public.receive_po_item(uuid, numeric, date, text, uuid)
from public, anon;

grant execute on function public.receive_po_item(uuid, numeric, date, text, uuid)
to authenticated, service_role;
