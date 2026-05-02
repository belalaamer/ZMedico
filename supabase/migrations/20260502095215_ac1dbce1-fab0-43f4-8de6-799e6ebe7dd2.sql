
-- apply_inventory_tx: keep return type uuid, add role check
CREATE OR REPLACE FUNCTION public.apply_inventory_tx(
  _product_id uuid, _branch_id uuid, _type inventory_tx_type, _signed_qty numeric,
  _unit_cost numeric, _ref_type text, _ref_id uuid, _notes_en text, _notes_ar text,
  _expiry date, _batch text, _by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  cur numeric(14,3);
  newq numeric(14,3);
  inv_id uuid;
  tx_id uuid;
begin
  if not (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'doctor'::app_role)
    or public.has_role(auth.uid(), 'receptionist'::app_role)
    or public.has_role(auth.uid(), 'staff'::app_role)
  ) then
    raise exception 'Forbidden: insufficient role';
  end if;

  insert into public.inventory(product_id, branch_id, quantity)
    values (_product_id, _branch_id, 0)
    on conflict (product_id, branch_id) do nothing;
  select id, quantity into inv_id, cur from public.inventory
    where product_id = _product_id and branch_id = _branch_id for update;

  newq := cur + _signed_qty;
  if newq < 0 then
    raise exception 'Insufficient stock: have %, need %', cur, abs(_signed_qty);
  end if;

  update public.inventory
    set quantity = newq,
        last_restocked_at = case when _signed_qty > 0 then now() else last_restocked_at end,
        updated_at = now()
    where id = inv_id;

  insert into public.inventory_transactions(
    product_id, branch_id, transaction_type, quantity, quantity_before, quantity_after,
    unit_cost, reference_type, reference_id, notes_en, notes_ar, expiry_date, batch_number, created_by
  ) values (
    _product_id, _branch_id, _type, _signed_qty, cur, newq,
    _unit_cost, _ref_type, _ref_id, _notes_en, _notes_ar, _expiry, _batch, _by
  ) returning id into tx_id;

  return tx_id;
end; $function$;

GRANT EXECUTE ON FUNCTION public.apply_inventory_tx(uuid, uuid, inventory_tx_type, numeric, numeric, text, uuid, text, text, date, text, uuid) TO authenticated;

-- add_treasury_tx
CREATE OR REPLACE FUNCTION public.add_treasury_tx(
  _treasury_id uuid, _type treasury_tx_type, _amount numeric, _ref_type text, _ref_id uuid,
  _desc_en text, _desc_ar text, _by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  cur numeric(14,2);
  new_balance numeric(14,2);
  delta numeric(14,2);
  new_id uuid;
begin
  if not (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'receptionist'::app_role)
  ) then
    raise exception 'Forbidden: insufficient role';
  end if;

  select current_balance into cur from public.treasury where id = _treasury_id for update;
  if cur is null then
    raise exception 'Treasury % not found', _treasury_id;
  end if;
  delta := case when _type = 'income' then _amount else -_amount end;
  new_balance := cur + delta;
  insert into public.treasury_transactions(
    treasury_id, transaction_type, amount, balance_after,
    reference_type, reference_id, description_en, description_ar, created_by
  ) values (
    _treasury_id, _type, _amount, new_balance,
    _ref_type, _ref_id, _desc_en, _desc_ar, _by
  ) returning id into new_id;
  update public.treasury set current_balance = new_balance, updated_at = now() where id = _treasury_id;
  return new_id;
end; $function$;

GRANT EXECUTE ON FUNCTION public.add_treasury_tx(uuid, treasury_tx_type, numeric, text, uuid, text, text, uuid) TO authenticated;

-- receive_po_item: admin only
CREATE OR REPLACE FUNCTION public.receive_po_item(
  _po_item_id uuid, _qty numeric, _expiry date, _batch text, _by uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  po record;
  it record;
  total_ord numeric;
  total_rec numeric;
  new_status po_status;
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Forbidden: admin role required';
  end if;

  select * into it from public.purchase_order_items where id = _po_item_id;
  if it.id is null then raise exception 'PO item not found'; end if;
  select * into po from public.purchase_orders where id = it.purchase_order_id;

  perform public.apply_inventory_tx(
    it.product_id, po.branch_id, 'purchase'::inventory_tx_type, _qty,
    it.unit_cost, 'purchase_order', po.id,
    'Received from PO ' || po.po_number, 'استلام من أمر شراء ' || po.po_number,
    _expiry, _batch, _by
  );

  update public.purchase_order_items
    set quantity_received = quantity_received + _qty
    where id = _po_item_id;

  select coalesce(sum(quantity_ordered),0), coalesce(sum(quantity_received),0)
    into total_ord, total_rec
    from public.purchase_order_items where purchase_order_id = po.id;

  if total_rec >= total_ord then new_status := 'received';
  elsif total_rec > 0 then new_status := 'partial';
  else new_status := po.status; end if;

  update public.purchase_orders set status = new_status where id = po.id;
end; $function$;

GRANT EXECUTE ON FUNCTION public.receive_po_item(uuid, numeric, date, text, uuid) TO authenticated;
