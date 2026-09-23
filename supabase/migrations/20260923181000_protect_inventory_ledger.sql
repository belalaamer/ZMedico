-- Route inventory balance/ledger mutations through protected RPCs only and
-- make stock transfers atomic.

create or replace function public.apply_inventory_tx(
  _product_id uuid,
  _branch_id uuid,
  _type public.inventory_tx_type,
  _signed_qty numeric,
  _unit_cost numeric,
  _ref_type text,
  _ref_id uuid,
  _notes_en text,
  _notes_ar text,
  _expiry date,
  _batch text,
  _by uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cur numeric(14,3);
  reserved numeric(14,3);
  newq numeric(14,3);
  inv_id uuid;
  tx_id uuid;
  v_actor uuid := auth.uid();
  v_product_tenant uuid;
  v_branch_tenant uuid;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.tx.write') then
    raise exception 'Forbidden: missing permission inventory.tx.write'
      using errcode = '42501';
  end if;

  if _branch_id is null
     or not public.user_has_branch_access(_branch_id) then
    raise exception 'Forbidden: no access to inventory branch'
      using errcode = '42501';
  end if;

  select p.tenant_id
    into v_product_tenant
    from public.products p
   where p.id = _product_id
     and p.deleted_at is null;

  if not found then
    raise exception 'Product not found or deleted'
      using errcode = 'P0002';
  end if;

  select b.tenant_id
    into v_branch_tenant
    from public.branches b
   where b.id = _branch_id;

  if not found or v_branch_tenant is distinct from v_product_tenant then
    raise exception 'Product and branch belong to different tenants'
      using errcode = '23514';
  end if;

  if _signed_qty is null or _signed_qty = 0 then
    raise exception 'Inventory quantity must not be zero'
      using errcode = '22023';
  end if;

  if _unit_cost is not null and _unit_cost < 0 then
    raise exception 'Inventory unit cost cannot be negative'
      using errcode = '22023';
  end if;

  insert into public.inventory(product_id, branch_id, quantity)
  values (_product_id, _branch_id, 0)
  on conflict (product_id, branch_id) do nothing;

  select id, quantity, reserved_quantity
    into inv_id, cur, reserved
    from public.inventory
   where product_id = _product_id
     and branch_id = _branch_id
   for update;

  newq := cur + _signed_qty;

  if newq < 0 then
    raise exception 'Insufficient stock: have %, need %', cur, abs(_signed_qty)
      using errcode = '23514';
  end if;

  if newq < reserved then
    raise exception 'Insufficient available stock: % units are reserved', reserved
      using errcode = '23514';
  end if;

  update public.inventory
     set quantity = newq,
         last_restocked_at = case
           when _signed_qty > 0 then now()
           else last_restocked_at
         end,
         updated_at = now()
   where id = inv_id;

  insert into public.inventory_transactions(
    product_id,
    branch_id,
    transaction_type,
    quantity,
    quantity_before,
    quantity_after,
    unit_cost,
    reference_type,
    reference_id,
    notes_en,
    notes_ar,
    expiry_date,
    batch_number,
    created_by
  )
  values (
    _product_id,
    _branch_id,
    _type,
    _signed_qty,
    cur,
    newq,
    _unit_cost,
    nullif(btrim(_ref_type), ''),
    _ref_id,
    nullif(btrim(_notes_en), ''),
    nullif(btrim(_notes_ar), ''),
    _expiry,
    nullif(btrim(_batch), ''),
    v_actor
  )
  returning id into tx_id;

  return tx_id;
end;
$function$;

revoke all on function public.apply_inventory_tx(
  uuid, uuid, public.inventory_tx_type, numeric, numeric,
  text, uuid, text, text, date, text, uuid
) from public, anon;

grant execute on function public.apply_inventory_tx(
  uuid, uuid, public.inventory_tx_type, numeric, numeric,
  text, uuid, text, text, date, text, uuid
) to authenticated, service_role;

create or replace function public.transfer_inventory_stock(
  p_product_id uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_quantity numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_transfer_id uuid := gen_random_uuid();
  v_from_name text;
  v_to_name text;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.tx.write') then
    raise exception 'Forbidden: missing permission inventory.tx.write'
      using errcode = '42501';
  end if;

  if p_product_id is null
     or p_from_branch_id is null
     or p_to_branch_id is null then
    raise exception 'Product and both branches are required'
      using errcode = '22004';
  end if;

  if p_from_branch_id = p_to_branch_id then
    raise exception 'Source and destination branches must be different'
      using errcode = '23514';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Transfer quantity must be greater than zero'
      using errcode = '22023';
  end if;

  if not public.user_has_branch_access(p_from_branch_id)
     or not public.user_has_branch_access(p_to_branch_id) then
    raise exception 'Forbidden: both transfer branches must be in the caller scope'
      using errcode = '42501';
  end if;

  select coalesce(b.name_en, b.name_ar)
    into v_from_name
    from public.branches b
   where b.id = p_from_branch_id;

  select coalesce(b.name_en, b.name_ar)
    into v_to_name
    from public.branches b
   where b.id = p_to_branch_id;

  if v_from_name is null or v_to_name is null then
    raise exception 'Transfer branch not found'
      using errcode = 'P0002';
  end if;

  perform public.apply_inventory_tx(
    p_product_id,
    p_from_branch_id,
    'transfer_out'::public.inventory_tx_type,
    -p_quantity,
    null::numeric,
    'transfer',
    v_transfer_id,
    'Transfer to ' || v_to_name || case when nullif(btrim(p_notes), '') is not null then ' — ' || btrim(p_notes) else '' end,
    'تحويل إلى ' || v_to_name || case when nullif(btrim(p_notes), '') is not null then ' — ' || btrim(p_notes) else '' end,
    null::date,
    null::text,
    v_actor
  );

  perform public.apply_inventory_tx(
    p_product_id,
    p_to_branch_id,
    'transfer_in'::public.inventory_tx_type,
    p_quantity,
    null::numeric,
    'transfer',
    v_transfer_id,
    'Transfer from ' || v_from_name || case when nullif(btrim(p_notes), '') is not null then ' — ' || btrim(p_notes) else '' end,
    'تحويل من ' || v_from_name || case when nullif(btrim(p_notes), '') is not null then ' — ' || btrim(p_notes) else '' end,
    null::date,
    null::text,
    v_actor
  );

  return v_transfer_id;
end;
$function$;

revoke all on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, text)
from public, anon;

grant execute on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, text)
to authenticated, service_role;

alter table public.inventory
  drop constraint if exists inventory_quantity_bounds;

alter table public.inventory
  add constraint inventory_quantity_bounds
  check (
    quantity >= 0
    and reserved_quantity >= 0
    and reserved_quantity <= quantity
  ) not valid;

alter table public.inventory
  validate constraint inventory_quantity_bounds;

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_arithmetic_valid;

alter table public.inventory_transactions
  add constraint inventory_transactions_arithmetic_valid
  check (
    quantity <> 0
    and quantity_before >= 0
    and quantity_after >= 0
    and quantity_before + quantity = quantity_after
    and (unit_cost is null or unit_cost >= 0)
  ) not valid;

alter table public.inventory_transactions
  validate constraint inventory_transactions_arithmetic_valid;

revoke insert, update, delete on table public.inventory from authenticated;
revoke insert, update, delete on table public.inventory_transactions from authenticated;

drop policy if exists inventory_insert_admin_manager on public.inventory;
drop policy if exists inventory_update_admin_manager on public.inventory;
drop policy if exists inv_delete_admin on public.inventory;

drop policy if exists inventory_transactions_insert_admin_manager on public.inventory_transactions;
drop policy if exists invtx_update_admin on public.inventory_transactions;
drop policy if exists invtx_delete_admin on public.inventory_transactions;
