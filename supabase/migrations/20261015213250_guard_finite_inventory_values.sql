-- ZMED-253: reject non-finite inputs at the shared stock-write boundary.
-- Individually reviewed candidate; no data repair, grant, policy or table change.
do $preflight$
begin
  if md5(pg_get_functiondef(
    'public.inventory_tx_core(uuid,uuid,public.inventory_tx_type,numeric,numeric,text,uuid,text,text,date,text,uuid)'::regprocedure
  )) is distinct from '9eab0ab0d1df589f7cb65c0b8f883a21' then
    raise exception 'Inventory core changed; review the current definition before applying';
  end if;
end;
$preflight$;

create or replace function public.inventory_tx_core(
  p_product_id uuid, p_branch_id uuid, p_type public.inventory_tx_type,
  p_signed_qty numeric, p_unit_cost numeric, p_ref_type text, p_ref_id uuid,
  p_notes_en text, p_notes_ar text, p_expiry date, p_batch text, p_actor uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  cur numeric(14,3); reserved numeric(14,3); newq numeric(14,3);
  inv_id uuid; tx_id uuid; v_product_tenant uuid; v_branch_tenant uuid;
begin
  select p.tenant_id into v_product_tenant from public.products p where p.id=p_product_id;
  if not found then raise exception 'Product not found' using errcode='P0002'; end if;
  select b.tenant_id into v_branch_tenant from public.branches b where b.id=p_branch_id;
  if not found or v_branch_tenant is distinct from v_product_tenant then
    raise exception 'Product and branch belong to different tenants' using errcode='23514';
  end if;
  -- PostgreSQL numeric NaN passes ordinary zero/negative comparisons and fits
  -- constrained numeric columns. Reject special values before any stock write.
  if p_signed_qty::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Inventory quantity must be finite' using errcode='22023';
  end if;
  if p_unit_cost::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Inventory unit cost must be finite' using errcode='22023';
  end if;
  if p_signed_qty is null or p_signed_qty=0 then
    raise exception 'Inventory quantity must not be zero' using errcode='22023';
  end if;
  if p_unit_cost is not null and p_unit_cost<0 then
    raise exception 'Inventory unit cost cannot be negative' using errcode='22023';
  end if;

  insert into public.inventory(product_id,branch_id,quantity)
  values(p_product_id,p_branch_id,0)
  on conflict(product_id,branch_id) do nothing;

  select id,quantity,reserved_quantity into inv_id,cur,reserved
  from public.inventory
  where product_id=p_product_id and branch_id=p_branch_id
  for update;

  newq:=cur+p_signed_qty;
  if newq<0 then
    raise exception 'Insufficient stock: have %, need %',cur,abs(p_signed_qty) using errcode='23514';
  end if;
  if newq<reserved then
    raise exception 'Insufficient available stock: % units are reserved',reserved using errcode='23514';
  end if;

  update public.inventory
  set quantity=newq,
      last_restocked_at=case when p_signed_qty>0 then now() else last_restocked_at end,
      updated_at=now()
  where id=inv_id;

  insert into public.inventory_transactions(
    product_id,branch_id,transaction_type,quantity,quantity_before,quantity_after,
    unit_cost,reference_type,reference_id,notes_en,notes_ar,expiry_date,batch_number,created_by
  ) values(
    p_product_id,p_branch_id,p_type,p_signed_qty,cur,newq,p_unit_cost,
    nullif(btrim(p_ref_type),''),p_ref_id,nullif(btrim(p_notes_en),''),
    nullif(btrim(p_notes_ar),''),p_expiry,nullif(btrim(p_batch),''),p_actor
  ) returning id into tx_id;
  return tx_id;
end;
$function$;
