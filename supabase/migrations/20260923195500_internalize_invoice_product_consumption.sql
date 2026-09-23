-- Allow trusted invoice triggers to consume direct product lines without
-- depending on the caller's UI permission set.

create or replace function public.invoice_product_consumption_core(
  p_invoice_id uuid,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_inv public.invoices%rowtype;
  r record;
begin
  select * into v_inv
  from public.invoices
  where id = p_invoice_id
    and deleted_at is null
  for share;

  if not found then
    raise exception 'Invoice not found'
      using errcode = 'P0002';
  end if;

  if v_inv.status in (
    'draft'::public.invoice_status,
    'cancelled'::public.invoice_status
  ) then
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
      select 1
      from public.inventory_transactions t
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
      p_actor
    );
  end loop;
end;
$function$;

revoke all on function public.invoice_product_consumption_core(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.invoice_product_consumption_core(uuid,uuid)
to service_role;

create or replace function public.consume_invoice_products(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_inv public.invoices%rowtype;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'invoices.create') then
    raise exception 'Forbidden: missing permission invoices.create'
      using errcode = '42501';
  end if;

  select * into v_inv
  from public.invoices
  where id = p_invoice_id
    and deleted_at is null;

  if not found then
    raise exception 'Invoice not found'
      using errcode = 'P0002';
  end if;

  if not public.user_has_branch_access(v_inv.branch_id) then
    raise exception 'Forbidden: invoice is outside the caller branch scope'
      using errcode = '42501';
  end if;

  perform public.invoice_product_consumption_core(p_invoice_id, v_actor);
end;
$function$;

revoke all on function public.consume_invoice_products(uuid)
from public, anon;
grant execute on function public.consume_invoice_products(uuid)
to authenticated, service_role;

create or replace function public.tg_invoice_after_status_paid()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.deleted_at is null
     and new.status not in (
       'draft'::public.invoice_status,
       'cancelled'::public.invoice_status
     )
     and old.status is distinct from new.status then
    begin
      perform public.invoice_product_consumption_core(new.id, auth.uid());
    exception when others then
      insert into public.audit_logs(
        user_id, branch_id, action, entity_type, entity_id, new_values
      )
      values (
        auth.uid(),
        new.branch_id,
        'invoice_product_stock_failed',
        'invoice',
        new.id,
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
