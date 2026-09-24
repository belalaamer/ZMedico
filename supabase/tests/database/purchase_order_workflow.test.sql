begin;

select plan(12);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'purchase_order_items'
      and t.tgname = 'trg_po_item_set_total'
      and not t.tgisinternal
  ),
  'purchase-order line totals are calculated by a database trigger'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'purchase_order_items'
      and t.tgname = 'trg_po_item_recalc_after_insert_delete'
      and not t.tgisinternal
  ),
  'parent subtotal is recalculated after line inserts and deletes'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'purchase_order_items'
      and t.tgname = 'trg_po_item_recalc_after_update'
      and not t.tgisinternal
  ),
  'parent subtotal is recalculated after editable line updates'
);

select like(
  pg_get_functiondef('public.tg_po_item_recalc_parent()'::regprocedure),
  '%tg_op = ''DELETE''%',
  'subtotal recalculation handles deleted lines'
);

select like(
  pg_get_functiondef('public.tg_po_item_recalc_parent()'::regprocedure),
  '%new.purchase_order_id is distinct from old.purchase_order_id%',
  'moving a line recalculates the old parent order'
);

select like(
  pg_get_functiondef('public.cancel_purchase_order(uuid)'::regprocedure),
  '%''partial''::public.po_status%',
  'partially received purchase orders are cancellable through the protected workflow'
);

select like(
  pg_get_functiondef('public.cancel_purchase_order(uuid)'::regprocedure),
  '%apply_inventory_tx%',
  'cancellation reverses received stock through the protected inventory ledger'
);

select like(
  pg_get_functiondef('public.cancel_purchase_order(uuid)'::regprocedure),
  '%-v_item.quantity_received%',
  'cancellation reverses the full historical receipt quantity'
);

select ok(
  not has_function_privilege('anon', 'public.cancel_purchase_order(uuid)', 'EXECUTE'),
  'anonymous callers cannot cancel purchase orders'
);

select ok(
  has_function_privilege('authenticated', 'public.cancel_purchase_order(uuid)', 'EXECUTE'),
  'authenticated callers can reach the protected cancellation gateway'
);

select lives_ok(
  $$select * from public.search_purchase_orders_page(null, null, null, null, 10000, -1)$$,
  'purchase-order paging clamps an oversized limit and negative offset'
);

select is(
  (
    select count(*)::bigint
    from public.purchase_orders po
    cross join lateral (
      select coalesce(sum(i.total), 0)::numeric(14,2) as subtotal
      from public.purchase_order_items i
      where i.purchase_order_id = po.id
    ) calc
    where po.deleted_at is null
      and (
        po.subtotal is distinct from calc.subtotal
        or po.total is distinct from round(coalesce(po.subtotal, 0) + coalesce(po.tax, 0), 2)
      )
  ),
  0::bigint,
  'all non-deleted purchase orders have consistent subtotal and total values'
);

select * from finish();
rollback;
