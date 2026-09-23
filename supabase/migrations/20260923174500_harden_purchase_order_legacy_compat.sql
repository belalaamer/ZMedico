-- Harden the temporary direct-insert compatibility path used by older
-- frontends while the canonical UI uses protected purchase-order RPCs.

create or replace function public.guard_purchase_order_direct_insert()
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

  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.create') then
    raise exception 'Forbidden: missing permission inventory.create'
      using errcode = '42501';
  end if;

  if new.branch_id is null
     or not public.user_has_branch_access(new.branch_id) then
    raise exception 'Forbidden: purchase order branch is outside the caller scope'
      using errcode = '42501';
  end if;

  if new.status not in ('draft'::public.po_status, 'pending'::public.po_status) then
    raise exception 'Direct purchase order creation only supports draft or pending status'
      using errcode = '23514';
  end if;

  if new.order_date is null then
    raise exception 'Order date is required'
      using errcode = '22004';
  end if;

  if new.expected_date is not null and new.expected_date < new.order_date then
    raise exception 'Expected date cannot be before order date'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.suppliers s
     where s.id = new.supplier_id
       and s.is_active = true
       and s.deleted_at is null
  ) then
    raise exception 'Supplier is unavailable'
      using errcode = 'P0002';
  end if;

  if coalesce(new.subtotal, 0) < 0
     or coalesce(new.tax, 0) < 0
     or coalesce(new.tax, 0) > coalesce(new.subtotal, 0) then
    raise exception 'Invalid purchase order amounts'
      using errcode = '23514';
  end if;

  new.created_by := v_actor;
  new.deleted_at := null;
  new.po_number := null;

  return new;
end;
$function$;

revoke all on function public.guard_purchase_order_direct_insert()
from public, anon, authenticated;

drop trigger if exists trg_guard_purchase_order_direct_insert
on public.purchase_orders;

create trigger trg_guard_purchase_order_direct_insert
before insert
on public.purchase_orders
for each row
execute function public.guard_purchase_order_direct_insert();

create or replace function public.tg_po_after_draft_soft_delete_cleanup()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.deleted_at is null
     and new.deleted_at is not null
     and old.status = 'draft'::public.po_status
     and not exists (
       select 1
         from public.purchase_order_items i
        where i.purchase_order_id = old.id
          and i.quantity_received <> 0
     ) then
    delete from public.purchase_order_items
     where purchase_order_id = old.id;
  end if;

  return new;
end;
$function$;

revoke all on function public.tg_po_after_draft_soft_delete_cleanup()
from public, anon, authenticated;

drop trigger if exists trg_po_after_draft_soft_delete_cleanup
on public.purchase_orders;

create trigger trg_po_after_draft_soft_delete_cleanup
after update of deleted_at
on public.purchase_orders
for each row
execute function public.tg_po_after_draft_soft_delete_cleanup();

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
    select 1
      from public.suppliers s
     where s.id = v_po.supplier_id
       and s.is_active = true
       and s.deleted_at is null
  ) then
    raise exception 'Supplier is unavailable'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
      from public.purchase_order_items i
     where i.purchase_order_id = v_po.id
  ) then
    raise exception 'Cannot submit a purchase order without items'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from public.purchase_order_items i
      left join public.products p on p.id = i.product_id
     where i.purchase_order_id = v_po.id
       and (
         p.id is null
         or p.is_active is not true
         or p.deleted_at is not null
       )
  ) then
    raise exception 'Purchase order contains an unavailable product'
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
