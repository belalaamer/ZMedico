-- Centralize purchase-order state changes and draft editing in audited,
-- transactional RPCs. Keep a narrow compatibility path for the currently
-- deployed UI while removing destructive table-level capabilities.

drop trigger if exists trg_po_after_soft_delete on public.purchase_orders;
drop function if exists public.tg_po_after_soft_delete();

revoke delete on table public.purchase_orders from authenticated;
revoke update, delete on table public.purchase_order_items from authenticated;

revoke update on table public.purchase_orders from authenticated;
grant update (status, deleted_at) on table public.purchase_orders to authenticated;

drop policy if exists po_delete_admin on public.purchase_orders;
drop policy if exists poi_delete_admin on public.purchase_order_items;
drop policy if exists purchase_order_items_update_admin_manager on public.purchase_order_items;

create or replace function public.guard_purchase_order_direct_state_change()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_received numeric;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if v_actor is null or not public.user_has_branch_access(old.branch_id) then
    raise exception 'Forbidden: purchase order is outside the caller scope'
      using errcode = '42501';
  end if;

  select coalesce(sum(i.quantity_received), 0)
    into v_received
    from public.purchase_order_items i
   where i.purchase_order_id = old.id;

  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is not null or new.deleted_at is null then
      raise exception 'Deleted purchase orders cannot be restored directly'
        using errcode = '42501';
    end if;

    if old.status <> 'draft'::public.po_status or v_received <> 0 then
      raise exception 'Only an unreceived draft purchase order can be deleted'
        using errcode = '23514';
    end if;

    if not public.has_permission(v_actor, 'inventory.delete') then
      raise exception 'Forbidden: missing permission inventory.delete'
        using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not public.has_permission(v_actor, 'inventory.edit') then
      raise exception 'Forbidden: missing permission inventory.edit'
        using errcode = '42501';
    end if;

    if old.status = 'draft'::public.po_status
       and new.status = 'pending'::public.po_status then
      if not exists (
        select 1
          from public.purchase_order_items i
         where i.purchase_order_id = old.id
      ) then
        raise exception 'Cannot submit a purchase order without items'
          using errcode = '23514';
      end if;
    elsif old.status in ('draft'::public.po_status, 'pending'::public.po_status)
          and new.status = 'cancelled'::public.po_status
          and v_received = 0 then
      null;
    else
      raise exception 'Purchase order state transition % -> % must use the protected workflow',
        old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_purchase_order_direct_state_change()
from public, anon, authenticated;

drop trigger if exists trg_guard_purchase_order_direct_state_change
on public.purchase_orders;

create trigger trg_guard_purchase_order_direct_state_change
before update of status, deleted_at
on public.purchase_orders
for each row
execute function public.guard_purchase_order_direct_state_change();

create or replace function public.guard_purchase_order_item_direct_insert()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_status public.po_status;
  v_created_by uuid;
  v_created_at timestamptz;
  v_branch_id uuid;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  select po.status, po.created_by, po.created_at, po.branch_id
    into v_status, v_created_by, v_created_at, v_branch_id
    from public.purchase_orders po
   where po.id = new.purchase_order_id
     and po.deleted_at is null;

  if not found
     or not public.user_has_branch_access(v_branch_id)
     or not public.has_permission(v_actor, 'inventory.create') then
    raise exception 'Forbidden: cannot add purchase order item'
      using errcode = '42501';
  end if;

  if v_status = 'draft'::public.po_status then
    return new;
  end if;

  -- Temporary compatibility for the previous two-request create flow:
  -- a freshly-created pending PO may receive its initial lines from its creator.
  if v_status = 'pending'::public.po_status
     and v_created_by = v_actor
     and v_created_at >= now() - interval '10 minutes'
     and coalesce(new.quantity_received, 0) = 0 then
    return new;
  end if;

  raise exception 'Purchase order items can only be added to a draft'
    using errcode = '23514';
end;
$function$;

revoke all on function public.guard_purchase_order_item_direct_insert()
from public, anon, authenticated;

drop trigger if exists trg_guard_purchase_order_item_direct_insert
on public.purchase_order_items;

create trigger trg_guard_purchase_order_item_direct_insert
before insert
on public.purchase_order_items
for each row
execute function public.guard_purchase_order_item_direct_insert();

create or replace function public.submit_purchase_order(
  p_purchase_order_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_po public.purchase_orders%rowtype;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.edit') then
    raise exception 'Forbidden: missing permission inventory.edit'
      using errcode = '42501';
  end if;

  select *
    into v_po
    from public.purchase_orders
   where id = p_purchase_order_id
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Purchase order not found'
      using errcode = 'P0002';
  end if;

  if not public.user_has_branch_access(v_po.branch_id) then
    raise exception 'Forbidden: purchase order is outside the caller scope'
      using errcode = '42501';
  end if;

  if v_po.status <> 'draft'::public.po_status then
    raise exception 'Only draft purchase orders can be submitted'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.purchase_order_items i
    where i.purchase_order_id = v_po.id
  ) then
    raise exception 'Cannot submit a purchase order without items'
      using errcode = '23514';
  end if;

  perform public.recalc_po_subtotal(v_po.id);

  update public.purchase_orders
     set status = 'pending'::public.po_status
   where id = v_po.id;

  insert into public.audit_logs (
    user_id, branch_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    v_actor, v_po.branch_id, 'purchase_order_submitted', 'purchase_order', v_po.id,
    jsonb_build_object('status', v_po.status::text),
    jsonb_build_object('status', 'pending')
  );
end;
$function$;

revoke all on function public.submit_purchase_order(uuid) from public, anon;
grant execute on function public.submit_purchase_order(uuid)
to authenticated, service_role;

create or replace function public.cancel_purchase_order(
  p_purchase_order_id uuid
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
  v_has_receipts boolean := false;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.edit') then
    raise exception 'Forbidden: missing permission inventory.edit'
      using errcode = '42501';
  end if;

  select *
    into v_po
    from public.purchase_orders
   where id = p_purchase_order_id
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Purchase order not found'
      using errcode = 'P0002';
  end if;

  if not public.user_has_branch_access(v_po.branch_id) then
    raise exception 'Forbidden: purchase order is outside the caller scope'
      using errcode = '42501';
  end if;

  if v_po.status not in (
    'draft'::public.po_status,
    'pending'::public.po_status,
    'partial'::public.po_status
  ) then
    raise exception 'Purchase order cannot be cancelled in status %', v_po.status
      using errcode = '23514';
  end if;

  select exists (
    select 1
      from public.purchase_order_items i
     where i.purchase_order_id = v_po.id
       and i.quantity_received > 0
  ) into v_has_receipts;

  if v_has_receipts
     and not public.has_permission(v_actor, 'inventory.tx.write') then
    raise exception 'Forbidden: missing permission inventory.tx.write for stock reversal'
      using errcode = '42501';
  end if;

  for v_item in
    select i.id, i.product_id, i.quantity_received, i.unit_cost
      from public.purchase_order_items i
     where i.purchase_order_id = v_po.id
       and i.quantity_received > 0
     order by i.id
  loop
    perform public.apply_inventory_tx(
      v_item.product_id,
      v_po.branch_id,
      'adjustment'::public.inventory_tx_type,
      -v_item.quantity_received,
      v_item.unit_cost,
      'purchase_order_cancel',
      v_po.id,
      'Cancelled PO ' || v_po.po_number,
      'إلغاء أمر شراء ' || v_po.po_number,
      null::date,
      null::text,
      v_actor
    );
  end loop;

  update public.purchase_orders
     set status = 'cancelled'::public.po_status
   where id = v_po.id;

  insert into public.audit_logs (
    user_id, branch_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    v_actor, v_po.branch_id, 'purchase_order_cancelled', 'purchase_order', v_po.id,
    jsonb_build_object('status', v_po.status::text, 'had_receipts', v_has_receipts),
    jsonb_build_object('status', 'cancelled', 'stock_reversed', v_has_receipts)
  );
end;
$function$;

revoke all on function public.cancel_purchase_order(uuid) from public, anon;
grant execute on function public.cancel_purchase_order(uuid)
to authenticated, service_role;

create or replace function public.delete_purchase_order_draft(
  p_purchase_order_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_po public.purchase_orders%rowtype;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.delete') then
    raise exception 'Forbidden: missing permission inventory.delete'
      using errcode = '42501';
  end if;

  select *
    into v_po
    from public.purchase_orders
   where id = p_purchase_order_id
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Purchase order not found'
      using errcode = 'P0002';
  end if;

  if not public.user_has_branch_access(v_po.branch_id) then
    raise exception 'Forbidden: purchase order is outside the caller scope'
      using errcode = '42501';
  end if;

  if v_po.status <> 'draft'::public.po_status then
    raise exception 'Only draft purchase orders can be deleted'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.purchase_order_items i
     where i.purchase_order_id = v_po.id
       and i.quantity_received <> 0
  ) then
    raise exception 'A purchase order with receipts cannot be deleted'
      using errcode = '23514';
  end if;

  update public.purchase_orders
     set deleted_at = now()
   where id = v_po.id;

  insert into public.audit_logs (
    user_id, branch_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    v_actor, v_po.branch_id, 'purchase_order_deleted', 'purchase_order', v_po.id,
    jsonb_build_object('status', v_po.status::text, 'deleted_at', v_po.deleted_at),
    jsonb_build_object('deleted_at', now())
  );
end;
$function$;

revoke all on function public.delete_purchase_order_draft(uuid) from public, anon;
grant execute on function public.delete_purchase_order_draft(uuid)
to authenticated, service_role;

create or replace function public.update_purchase_order_draft(
  p_purchase_order_id uuid,
  p_supplier_id uuid,
  p_order_date date,
  p_expected_date date,
  p_tax_pct numeric,
  p_notes text,
  p_items jsonb,
  p_submit boolean default false
)
returns table (
  purchase_order_id uuid,
  purchase_order_number text,
  purchase_order_status public.po_status
)
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
     or not public.has_permission(v_actor, 'inventory.edit') then
    raise exception 'Forbidden: missing permission inventory.edit'
      using errcode = '42501';
  end if;

  select *
    into v_po
    from public.purchase_orders
   where id = p_purchase_order_id
     and deleted_at is null
   for update;

  if not found then
    raise exception 'Purchase order not found'
      using errcode = 'P0002';
  end if;

  if not public.user_has_branch_access(v_po.branch_id) then
    raise exception 'Forbidden: purchase order is outside the caller scope'
      using errcode = '42501';
  end if;

  if v_po.status <> 'draft'::public.po_status then
    raise exception 'Only draft purchase orders can be edited'
      using errcode = '23514';
  end if;

  if p_supplier_id is null
     or not exists (
       select 1 from public.suppliers s
        where s.id = p_supplier_id
          and s.is_active = true
          and s.deleted_at is null
     ) then
    raise exception 'Supplier is unavailable'
      using errcode = 'P0002';
  end if;

  if p_order_date is null then
    raise exception 'Order date is required'
      using errcode = '22004';
  end if;

  if p_expected_date is not null and p_expected_date < p_order_date then
    raise exception 'Expected date cannot be before order date'
      using errcode = '22023';
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
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 200 then
    raise exception 'Purchase order must contain between 1 and 200 items'
      using errcode = '22023';
  end if;

  delete from public.purchase_order_items
   where purchase_order_id = v_po.id;

  update public.purchase_orders
     set supplier_id = p_supplier_id,
         order_date = p_order_date,
         expected_date = p_expected_date,
         notes = nullif(trim(p_notes), ''),
         subtotal = 0,
         tax = 0
   where id = v_po.id;

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
      select 1 from public.products p
       where p.id = v_item.product_id
         and p.is_active = true
         and p.deleted_at is null
    ) then
      raise exception 'Product % is unavailable', v_item.product_id
        using errcode = 'P0002';
    end if;

    insert into public.purchase_order_items (
      purchase_order_id, product_id, quantity_ordered, quantity_received, unit_cost
    ) values (
      v_po.id, v_item.product_id, v_item.quantity_ordered, 0, v_item.unit_cost
    );
  end loop;

  perform public.recalc_po_subtotal(v_po.id);

  update public.purchase_orders
     set tax = round(subtotal * p_tax_pct / 100.0, 2),
         status = case
           when coalesce(p_submit, false) then 'pending'::public.po_status
           else 'draft'::public.po_status
         end
   where id = v_po.id;

  insert into public.audit_logs (
    user_id, branch_id, action, entity_type, entity_id, old_values, new_values
  ) values (
    v_actor, v_po.branch_id,
    case when coalesce(p_submit, false)
      then 'purchase_order_edited_submitted'
      else 'purchase_order_edited'
    end,
    'purchase_order', v_po.id,
    jsonb_build_object('status', v_po.status::text, 'supplier_id', v_po.supplier_id),
    jsonb_build_object(
      'status', case when coalesce(p_submit, false) then 'pending' else 'draft' end,
      'supplier_id', p_supplier_id
    )
  );

  return query
  select po.id, po.po_number, po.status
    from public.purchase_orders po
   where po.id = v_po.id;
end;
$function$;

revoke all on function public.update_purchase_order_draft(
  uuid, uuid, date, date, numeric, text, jsonb, boolean
) from public, anon;

grant execute on function public.update_purchase_order_draft(
  uuid, uuid, date, date, numeric, text, jsonb, boolean
) to authenticated, service_role;
