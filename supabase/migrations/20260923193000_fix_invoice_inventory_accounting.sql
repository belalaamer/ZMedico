-- Separate trusted inventory accounting from manual stock-adjustment authorization.
-- Invoice workflows use the internal core; users still need inventory.tx.write
-- for manual stock operations.

create or replace function public.inventory_tx_core(
  p_product_id uuid,
  p_branch_id uuid,
  p_type public.inventory_tx_type,
  p_signed_qty numeric,
  p_unit_cost numeric,
  p_ref_type text,
  p_ref_id uuid,
  p_notes_en text,
  p_notes_ar text,
  p_expiry date,
  p_batch text,
  p_actor uuid
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
  v_product_tenant uuid;
  v_branch_tenant uuid;
begin
  select p.tenant_id into v_product_tenant
  from public.products p
  where p.id = p_product_id;

  if not found then
    raise exception 'Product not found'
      using errcode = 'P0002';
  end if;

  select b.tenant_id into v_branch_tenant
  from public.branches b
  where b.id = p_branch_id;

  if not found or v_branch_tenant is distinct from v_product_tenant then
    raise exception 'Product and branch belong to different tenants'
      using errcode = '23514';
  end if;

  if p_signed_qty is null or p_signed_qty = 0 then
    raise exception 'Inventory quantity must not be zero'
      using errcode = '22023';
  end if;

  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Inventory unit cost cannot be negative'
      using errcode = '22023';
  end if;

  insert into public.inventory(product_id, branch_id, quantity)
  values (p_product_id, p_branch_id, 0)
  on conflict (product_id, branch_id) do nothing;

  select id, quantity, reserved_quantity
    into inv_id, cur, reserved
  from public.inventory
  where product_id = p_product_id
    and branch_id = p_branch_id
  for update;

  newq := cur + p_signed_qty;

  if newq < 0 then
    raise exception 'Insufficient stock: have %, need %', cur, abs(p_signed_qty)
      using errcode = '23514';
  end if;

  if newq < reserved then
    raise exception 'Insufficient available stock: % units are reserved', reserved
      using errcode = '23514';
  end if;

  update public.inventory
  set quantity = newq,
      last_restocked_at = case when p_signed_qty > 0 then now() else last_restocked_at end,
      updated_at = now()
  where id = inv_id;

  insert into public.inventory_transactions(
    product_id, branch_id, transaction_type, quantity,
    quantity_before, quantity_after, unit_cost,
    reference_type, reference_id, notes_en, notes_ar,
    expiry_date, batch_number, created_by
  )
  values (
    p_product_id, p_branch_id, p_type, p_signed_qty,
    cur, newq, p_unit_cost,
    nullif(btrim(p_ref_type), ''), p_ref_id,
    nullif(btrim(p_notes_en), ''), nullif(btrim(p_notes_ar), ''),
    p_expiry, nullif(btrim(p_batch), ''), p_actor
  )
  returning id into tx_id;

  return tx_id;
end;
$function$;

revoke all on function public.inventory_tx_core(
  uuid, uuid, public.inventory_tx_type, numeric, numeric,
  text, uuid, text, text, date, text, uuid
) from public, anon, authenticated;

grant execute on function public.inventory_tx_core(
  uuid, uuid, public.inventory_tx_type, numeric, numeric,
  text, uuid, text, text, date, text, uuid
) to service_role;

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
  v_actor uuid := auth.uid();
  v_existing uuid;
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

  if not exists (
    select 1 from public.products p
    where p.id = _product_id
      and p.deleted_at is null
  ) then
    raise exception 'Product not found or deleted'
      using errcode = 'P0002';
  end if;

  -- Compatibility/idempotency: older clients may retry invoice stock consumption
  -- after a protected workflow has already posted it.
  if _signed_qty < 0
     and _ref_id is not null
     and _ref_type in ('invoice', 'invoice_consumable') then
    select t.id into v_existing
    from public.inventory_transactions t
    where t.reference_type = _ref_type
      and t.reference_id = _ref_id
      and t.product_id = _product_id
      and t.quantity < 0
    order by t.created_at
    limit 1;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  return public.inventory_tx_core(
    _product_id, _branch_id, _type, _signed_qty, _unit_cost,
    _ref_type, _ref_id, _notes_en, _notes_ar,
    _expiry, _batch, v_actor
  );
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

create or replace function public.consume_invoice_products(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_inv public.invoices%rowtype;
  r record;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'invoices.create') then
    raise exception 'Forbidden: missing permission invoices.create'
      using errcode = '42501';
  end if;

  select * into v_inv
  from public.invoices
  where id = p_invoice_id
    and deleted_at is null
  for share;

  if not found then
    raise exception 'Invoice not found'
      using errcode = 'P0002';
  end if;

  if not public.user_has_branch_access(v_inv.branch_id) then
    raise exception 'Forbidden: invoice is outside the caller branch scope'
      using errcode = '42501';
  end if;

  if v_inv.status in ('draft'::public.invoice_status, 'cancelled'::public.invoice_status) then
    return;
  end if;

  for r in
    select ii.product_id,
           sum(coalesce(ii.quantity,0))::numeric(14,3) as qty
    from public.invoice_items ii
    where ii.invoice_id = v_inv.id
      and ii.item_type = 'product'::public.invoice_item_type
      and ii.product_id is not null
      and coalesce(ii.quantity,0) > 0
    group by ii.product_id
  loop
    if exists (
      select 1 from public.inventory_transactions t
      where t.reference_type = 'invoice'
        and t.reference_id = v_inv.id
        and t.product_id = r.product_id
        and t.quantity < 0
    ) then
      continue;
    end if;

    perform public.inventory_tx_core(
      r.product_id,
      v_inv.branch_id,
      'sale'::public.inventory_tx_type,
      -r.qty,
      null::numeric,
      'invoice',
      v_inv.id,
      'Invoice ' || v_inv.invoice_number,
      'فاتورة ' || v_inv.invoice_number,
      null::date,
      null::text,
      v_actor
    );
  end loop;
end;
$function$;

revoke all on function public.consume_invoice_products(uuid)
from public, anon;
grant execute on function public.consume_invoice_products(uuid)
to authenticated, service_role;

create or replace function public.fn_consume_for_invoice(_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  inv public.invoices%rowtype;
  r record;
  total_qty numeric(14,3);
  v_actor uuid := auth.uid();
begin
  if _invoice_id is null then return; end if;

  select * into inv
  from public.invoices
  where id = _invoice_id;

  if inv.id is null
     or inv.deleted_at is not null
     or inv.status <> 'paid'::public.invoice_status then
    return;
  end if;

  for r in
    select sc.product_id,
           sum(coalesce(ii.quantity,1) * coalesce(sc.quantity,1))::numeric(14,3) as qty
    from public.invoice_items ii
    join public.service_consumables sc
      on (ii.item_type = 'service'::public.invoice_item_type and sc.service_id = ii.product_id)
      or (ii.item_type = 'procedure'::public.invoice_item_type and sc.procedure_id = ii.product_id)
    where ii.invoice_id = _invoice_id
    group by sc.product_id
  loop
    if exists (
      select 1 from public.inventory_transactions t
      where t.reference_type = 'invoice_consumable'
        and t.reference_id = _invoice_id
        and t.product_id = r.product_id
        and t.quantity < 0
    ) then
      continue;
    end if;

    total_qty := r.qty;
    if total_qty is null or total_qty <= 0 then continue; end if;

    begin
      perform public.inventory_tx_core(
        r.product_id,
        inv.branch_id,
        'sale'::public.inventory_tx_type,
        -total_qty,
        null::numeric,
        'invoice_consumable',
        _invoice_id,
        'Auto-consumed for paid invoice ' || inv.invoice_number,
        'استهلاك تلقائي لفاتورة مدفوعة ' || inv.invoice_number,
        null::date,
        null::text,
        v_actor
      );
    exception when others then
      insert into public.audit_logs(
        user_id, branch_id, action, entity_type, entity_id, new_values
      )
      values (
        v_actor, inv.branch_id, 'invoice_consumable_stock_failed',
        'invoice', inv.id,
        jsonb_build_object('product_id', r.product_id, 'quantity', total_qty, 'error', sqlerrm)
      );
    end;
  end loop;
end;
$function$;

revoke all on function public.fn_consume_for_invoice(uuid)
from public, anon, authenticated;
grant execute on function public.fn_consume_for_invoice(uuid)
to service_role;

create or replace function public.tg_invoice_after_status_paid()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.deleted_at is null
     and new.status not in ('draft'::public.invoice_status, 'cancelled'::public.invoice_status)
     and old.status is distinct from new.status then
    begin
      perform public.consume_invoice_products(new.id);
    exception when others then
      insert into public.audit_logs(
        user_id, branch_id, action, entity_type, entity_id, new_values
      )
      values (
        auth.uid(), new.branch_id, 'invoice_product_stock_failed',
        'invoice', new.id,
        jsonb_build_object('error', sqlerrm, 'status', new.status::text)
      );
    end;
  end if;

  if new.deleted_at is null
     and new.status = 'paid'::public.invoice_status
     and old.status is distinct from new.status then
    perform public.fn_consume_for_invoice(new.id);
  end if;

  return new;
end;
$function$;

revoke all on function public.tg_invoice_after_status_paid()
from public, anon, authenticated;

create or replace function public.void_invoice_financials(
  _invoice_id uuid,
  _user_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  inv public.invoices%rowtype;
  it record;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Forbidden: authentication required'
      using errcode = '42501';
  end if;

  if _invoice_id is null then
    raise exception 'invoice_id required'
      using errcode = '22004';
  end if;

  if not (
    public.has_role(v_actor, 'admin'::public.app_role)
    or public.has_role(v_actor, 'accountant'::public.app_role)
    or public.has_permission(v_actor, 'invoices.delete')
  ) then
    raise exception 'Forbidden: void_invoice_financials'
      using errcode = '42501';
  end if;

  select * into inv
  from public.invoices
  where id = _invoice_id
  for update;

  if inv.id is null then
    raise exception 'Invoice not found'
      using errcode = 'P0002';
  end if;

  if inv.branch_id is null
     or not public.user_has_branch_access(inv.branch_id) then
    raise exception 'Forbidden: invoice is outside the caller branch scope'
      using errcode = '42501';
  end if;

  if inv.status = 'cancelled'::public.invoice_status then
    return;
  end if;

  -- Reverse only inventory that was actually consumed for this invoice.
  for it in
    with consumed as (
      select t.product_id,
             -sum(t.quantity)::numeric(14,3) as consumed_qty
      from public.inventory_transactions t
      where t.reference_id = _invoice_id
        and t.reference_type in ('invoice','invoice_consumable')
        and t.quantity < 0
      group by t.product_id
    ),
    returned as (
      select t.product_id,
             sum(t.quantity)::numeric(14,3) as returned_qty
      from public.inventory_transactions t
      where t.reference_id = _invoice_id
        and t.reference_type = 'invoice_cancel'
        and t.quantity > 0
      group by t.product_id
    )
    select c.product_id,
           greatest(c.consumed_qty - coalesce(r.returned_qty,0),0)::numeric(14,3) as qty
    from consumed c
    left join returned r using (product_id)
    where c.consumed_qty > coalesce(r.returned_qty,0)
  loop
    perform public.inventory_tx_core(
      it.product_id,
      inv.branch_id,
      'return'::public.inventory_tx_type,
      it.qty,
      null::numeric,
      'invoice_cancel',
      _invoice_id,
      'Cancelled invoice ' || inv.invoice_number,
      'إلغاء فاتورة ' || inv.invoice_number,
      null::date,
      null::text,
      v_actor
    );
  end loop;

  update public.invoices
  set status = 'cancelled'::public.invoice_status,
      voided_at = now()
  where id = _invoice_id;

  update public.payments
  set deleted_at = now()
  where invoice_id = _invoice_id
    and deleted_at is null;

  if inv.medical_record_id is not null then
    update public.doctor_commissions
    set status = 'cancelled'::public.commission_status
    where medical_record_id = inv.medical_record_id
      and status in ('earned','partial','pending')
      and payroll_id is null;
  end if;
end;
$function$;

revoke all on function public.void_invoice_financials(uuid,uuid)
from public, anon;
grant execute on function public.void_invoice_financials(uuid,uuid)
to authenticated, service_role;

create unique index if not exists uq_inventory_invoice_consumption
on public.inventory_transactions(reference_type, reference_id, product_id)
where reference_type in ('invoice','invoice_consumable')
  and reference_id is not null
  and quantity < 0;
