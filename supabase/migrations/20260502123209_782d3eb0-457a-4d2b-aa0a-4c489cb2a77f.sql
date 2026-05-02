CREATE OR REPLACE FUNCTION public.apply_inventory_tx(_product_id uuid, _branch_id uuid, _type inventory_tx_type, _signed_qty numeric, _unit_cost numeric, _ref_type text, _ref_id uuid, _notes_en text, _notes_ar text, _expiry date, _batch text, _by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cur numeric(14,3);
  newq numeric(14,3);
  inv_id uuid;
  tx_id uuid;
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Forbidden: admin role required';
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

REVOKE EXECUTE ON FUNCTION public.apply_inventory_tx(uuid, uuid, inventory_tx_type, numeric, numeric, text, uuid, text, text, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_inventory_tx(uuid, uuid, inventory_tx_type, numeric, numeric, text, uuid, text, text, date, text, uuid) TO authenticated;