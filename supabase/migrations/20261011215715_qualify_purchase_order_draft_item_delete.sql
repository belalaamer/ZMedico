-- ZMED-223: the RETURNS TABLE output parameter purchase_order_id shadows the
-- item-table column, so every authorized draft edit fails with SQLSTATE 42702.
-- Rewrite only the reviewed ambiguous statement and reject definition drift.
do $migration$
declare
  v_regprocedure regprocedure := 'public.update_purchase_order_draft(uuid,uuid,date,date,numeric,text,jsonb,boolean)'::regprocedure;
  v_definition text;
  v_old text := E'delete from public.purchase_order_items\n   where purchase_order_id = v_po.id;';
  v_new text := E'delete from public.purchase_order_items as poi\n   where poi.purchase_order_id = v_po.id;';
begin
  select pg_get_functiondef(v_regprocedure) into v_definition;
  if md5(v_definition) <> '44d1212cbef909df9ba2dffaa1dc5d43' then
    raise exception 'update_purchase_order_draft definition drifted; review before applying';
  end if;
  if length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) then
    raise exception 'Expected one ambiguous purchase-order delete statement';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

notify pgrst, 'reload schema';
