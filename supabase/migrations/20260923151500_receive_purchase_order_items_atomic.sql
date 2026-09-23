-- Receive multiple purchase-order items atomically. Any failure rolls the
-- whole receipt back so one UI submission cannot leave a partially-applied batch.

create or replace function public.receive_purchase_order_items(
  p_purchase_order_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_po public.purchase_orders%rowtype;
  v_item record;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'purchase_orders.receive') then
    raise exception 'Forbidden: missing permission purchase_orders.receive'
      using errcode = '42501';
  end if;

  select *
    into v_po
    from public.purchase_orders
   where id = p_purchase_order_id
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Purchase order not found or deleted'
      using errcode = 'P0002';
  end if;

  if not public.user_has_branch_access(v_po.branch_id) then
    raise exception 'Forbidden: no access to purchase order branch'
      using errcode = '42501';
  end if;

  if v_po.status not in ('pending'::public.po_status, 'partial'::public.po_status) then
    raise exception 'Purchase order cannot receive items in status %', v_po.status
      using errcode = '23514';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one receipt item is required'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'Receipt item limit exceeded'
      using errcode = '54000';
  end if;

  for v_item in
    select *
      from jsonb_to_recordset(p_items) as x(
        po_item_id uuid,
        qty numeric,
        expiry date,
        batch text
      )
  loop
    if v_item.po_item_id is null
       or v_item.qty is null
       or v_item.qty <= 0 then
      raise exception 'Invalid receipt item'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
        from public.purchase_order_items poi
       where poi.id = v_item.po_item_id
         and poi.purchase_order_id = p_purchase_order_id
    ) then
      raise exception 'Purchase order item % does not belong to this order', v_item.po_item_id
        using errcode = '23503';
    end if;

    perform public.receive_po_item(
      v_item.po_item_id,
      v_item.qty,
      v_item.expiry,
      nullif(trim(v_item.batch), ''),
      v_actor
    );
  end loop;
end;
$function$;

revoke all on function public.receive_purchase_order_items(uuid, jsonb)
from public, anon;

grant execute on function public.receive_purchase_order_items(uuid, jsonb)
to authenticated, service_role;
