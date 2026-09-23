-- Scope stock-alert notifications to the affected branch, make alert
-- resolution server-authoritative, and make expiry alert generation idempotent
-- per receipt.

create or replace function public.tg_stock_alert_notify()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  prod record;
  title_en text;
  title_ar text;
  msg_en text;
  msg_ar text;
begin
  select p.name_en, p.name_ar
    into prod
    from public.products p
   where p.id = new.product_id;

  if new.alert_type = 'out_of_stock' then
    title_en := 'Out of stock';
    title_ar := 'نفد المخزون';
  elsif new.alert_type = 'low_stock' then
    title_en := 'Low stock';
    title_ar := 'مخزون منخفض';
  elsif new.alert_type = 'expired' then
    title_en := 'Expired item';
    title_ar := 'صنف منتهي';
  else
    title_en := 'Expiring soon';
    title_ar := 'يقترب انتهاؤه';
  end if;

  msg_en := coalesce(prod.name_en, 'product') || ' — qty: ' || new.quantity;
  msg_ar := coalesce(prod.name_ar, prod.name_en, 'منتج') || ' — الكمية: ' || new.quantity;

  insert into public.notifications(
    user_id,
    branch_id,
    title_ar,
    title_en,
    message_ar,
    message_en,
    type,
    related_entity_type,
    related_entity_id
  )
  select distinct
    sb.user_id,
    new.branch_id,
    title_ar,
    title_en,
    msg_ar,
    msg_en,
    'system'::public.notification_type,
    'stock_alert',
    new.id
  from public.staff_branches sb
  join public.user_roles ur
    on ur.user_id = sb.user_id
  where sb.branch_id = new.branch_id
    and ur.role in ('admin'::public.app_role, 'manager'::public.app_role);

  return new;
end;
$function$;

revoke all on function public.tg_stock_alert_notify()
from public, anon, authenticated;

create or replace function public.resolve_stock_alert(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_alert public.stock_alerts%rowtype;
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.alerts.manage') then
    raise exception 'Forbidden: missing permission inventory.alerts.manage'
      using errcode = '42501';
  end if;

  select *
    into v_alert
    from public.stock_alerts
   where id = p_alert_id
   for update;

  if not found then
    raise exception 'Stock alert not found'
      using errcode = 'P0002';
  end if;

  if not public.user_has_branch_access(v_alert.branch_id) then
    raise exception 'Forbidden: stock alert is outside the caller scope'
      using errcode = '42501';
  end if;

  if v_alert.is_resolved then
    return;
  end if;

  update public.stock_alerts
     set is_resolved = true,
         resolved_at = now(),
         resolved_by = v_actor
   where id = v_alert.id;
end;
$function$;

revoke all on function public.resolve_stock_alert(uuid)
from public, anon;

grant execute on function public.resolve_stock_alert(uuid)
to authenticated, service_role;

create or replace function public.check_expiry_alerts()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  cnt int := 0;
  r record;
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not public.has_permission(v_actor, 'inventory.alerts.manage') then
    raise exception 'Forbidden: missing permission inventory.alerts.manage'
      using errcode = '42501';
  end if;

  for r in
    select
      t.product_id,
      t.branch_id,
      max(t.created_at) as latest_receipt_at
    from public.inventory_transactions t
    join public.products p
      on p.id = t.product_id
     and p.deleted_at is null
     and p.expiry_tracking = true
    join public.inventory i
      on i.product_id = t.product_id
     and i.branch_id = t.branch_id
     and i.quantity > 0
    where t.expiry_date is not null
      and t.expiry_date < current_date
      and t.transaction_type = 'purchase'::public.inventory_tx_type
      and public.user_has_branch_access(t.branch_id)
    group by t.product_id, t.branch_id
  loop
    if not exists (
      select 1
        from public.stock_alerts a
       where a.product_id = r.product_id
         and a.branch_id = r.branch_id
         and a.alert_type = 'expired'
         and a.created_at >= r.latest_receipt_at
    ) then
      insert into public.stock_alerts(product_id, branch_id, alert_type, quantity)
      select r.product_id, r.branch_id, 'expired', i.quantity
      from public.inventory i
      where i.product_id = r.product_id
        and i.branch_id = r.branch_id;

      cnt := cnt + 1;
    end if;
  end loop;

  for r in
    select
      t.product_id,
      t.branch_id,
      max(t.created_at) as latest_receipt_at
    from public.inventory_transactions t
    join public.products p
      on p.id = t.product_id
     and p.deleted_at is null
     and p.expiry_tracking = true
    join public.inventory i
      on i.product_id = t.product_id
     and i.branch_id = t.branch_id
     and i.quantity > 0
    where t.expiry_date is not null
      and t.expiry_date >= current_date
      and t.expiry_date <= current_date + interval '30 days'
      and t.transaction_type = 'purchase'::public.inventory_tx_type
      and public.user_has_branch_access(t.branch_id)
    group by t.product_id, t.branch_id
  loop
    if not exists (
      select 1
        from public.stock_alerts a
       where a.product_id = r.product_id
         and a.branch_id = r.branch_id
         and a.alert_type = 'expiring_soon'
         and a.created_at >= r.latest_receipt_at
    )
    and not exists (
      select 1
        from public.stock_alerts a
       where a.product_id = r.product_id
         and a.branch_id = r.branch_id
         and a.alert_type = 'expired'
         and a.is_resolved = false
    ) then
      insert into public.stock_alerts(product_id, branch_id, alert_type, quantity)
      select r.product_id, r.branch_id, 'expiring_soon', i.quantity
      from public.inventory i
      where i.product_id = r.product_id
        and i.branch_id = r.branch_id;

      cnt := cnt + 1;
    end if;
  end loop;

  return cnt;
end;
$function$;

revoke all on function public.check_expiry_alerts()
from public, anon;

grant execute on function public.check_expiry_alerts()
to authenticated, service_role;

revoke insert, update, delete on table public.stock_alerts from authenticated;

drop policy if exists alerts_insert on public.stock_alerts;
drop policy if exists alerts_update on public.stock_alerts;
drop policy if exists alerts_delete_admin on public.stock_alerts;

create unique index if not exists uq_stock_alerts_unresolved_type
  on public.stock_alerts(product_id, branch_id, alert_type)
  where is_resolved = false;
