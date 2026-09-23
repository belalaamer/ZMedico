-- Create purchase orders atomically so the header and all line items either
-- succeed together or roll back together. Subtotal and tax are computed server-side.

create or replace function public.create_purchase_order(
  p_branch_id uuid,
  p_supplier_id uuid,
  p_order_date date,
  p_expected_date date,
  p_status public.po_status,
  p_tax_pct numeric,
  p_notes text,
  p_items jsonb
)
returns table (
  purchase_order_id uuid,
  purchase_order_number text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_po_id uuid;
  v_po_number text;
  v_item record;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.create') then
    raise exception 'Forbidden: missing permission inventory.create'
      using errcode = '42501';
  end if;

  if p_branch_id is null
     or not public.user_has_branch_access(p_branch_id) then
    raise exception 'Forbidden: no access to purchase order branch'
      using errcode = '42501';
  end if;

  if p_supplier_id is null then
    raise exception 'Supplier is required'
      using errcode = '22004';
  end if;

  if p_order_date is null then
    raise exception 'Order date is required'
      using errcode = '22004';
  end if;

  if p_expected_date is not null and p_expected_date < p_order_date then
    raise exception 'Expected date cannot be before order date'
      using errcode = '22023';
  end if;

  if p_status not in ('draft'::public.po_status, 'pending'::public.po_status) then
    raise exception 'New purchase order status must be draft or pending'
      using errcode = '23514';
  end if;

  if p_tax_pct is null or p_tax_pct < 0 or p_tax_pct > 100 then
    raise exception 'Tax percentage must be between 0 and 100'
      using errcode = '22023';
  end if;

  if p_notes is not null and length(p_notes) > 1000 then
    raise exception 'Purchase order notes exceed 1000 characters'
      using errcode = '22001';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one purchase order item is required'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 200 then
    raise exception 'Purchase order item limit exceeded'
      using errcode = '54000';
  end if;

  if not exists (
    select 1
      from public.suppliers s
     where s.id = p_supplier_id
       and s.is_active = true
       and s.deleted_at is null
  ) then
    raise exception 'Supplier is unavailable'
      using errcode = 'P0002';
  end if;

  insert into public.purchase_orders (
    supplier_id,
    branch_id,
    order_date,
    expected_date,
    status,
    subtotal,
    tax,
    notes,
    created_by
  )
  values (
    p_supplier_id,
    p_branch_id,
    p_order_date,
    p_expected_date,
    p_status,
    0,
    0,
    nullif(trim(p_notes), ''),
    v_actor
  )
  returning id, po_number
    into v_po_id, v_po_number;

  for v_item in
    select *
      from jsonb_to_recordset(p_items) as x(
        product_id uuid,
        quantity_ordered numeric,
        unit_cost numeric
      )
  loop
    if v_item.product_id is null
       or v_item.quantity_ordered is null
       or v_item.quantity_ordered <= 0
       or v_item.unit_cost is null
       or v_item.unit_cost < 0 then
      raise exception 'Invalid purchase order item'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
        from public.products p
       where p.id = v_item.product_id
         and p.is_active = true
         and p.deleted_at is null
    ) then
      raise exception 'Product % is unavailable', v_item.product_id
        using errcode = 'P0002';
    end if;

    insert into public.purchase_order_items (
      purchase_order_id,
      product_id,
      quantity_ordered,
      quantity_received,
      unit_cost
    )
    values (
      v_po_id,
      v_item.product_id,
      v_item.quantity_ordered,
      0,
      v_item.unit_cost
    );
  end loop;

  perform public.recalc_po_subtotal(v_po_id);

  update public.purchase_orders
     set tax = round(subtotal * p_tax_pct / 100.0, 2)
   where id = v_po_id;

  return query
  select v_po_id, v_po_number;
end;
$function$;

revoke all on function public.create_purchase_order(
  uuid, uuid, date, date, public.po_status, numeric, text, jsonb
) from public, anon;

grant execute on function public.create_purchase_order(
  uuid, uuid, date, date, public.po_status, numeric, text, jsonb
) to authenticated, service_role;
