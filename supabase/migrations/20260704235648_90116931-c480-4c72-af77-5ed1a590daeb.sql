
CREATE OR REPLACE FUNCTION public.check_expiry_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cnt int := 0;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Forbidden: authentication required';
  end if;

  if not (
    public.has_role(auth.uid(), 'admin'::app_role) or
    public.has_role(auth.uid(), 'manager'::app_role)
  ) then
    raise exception 'Forbidden: admin or manager role required';
  end if;

  for r in
    select t.product_id, t.branch_id
    from public.inventory_transactions t
    join public.products p on p.id = t.product_id
    where p.expiry_tracking = true
      and t.expiry_date is not null
      and t.expiry_date < current_date
      and t.transaction_type = 'purchase'
      and public.user_has_branch_access(t.branch_id)
    group by t.product_id, t.branch_id
  loop
    if not exists (
      select 1 from public.stock_alerts
      where product_id = r.product_id and branch_id = r.branch_id
        and alert_type = 'expired' and is_resolved = false
    ) then
      insert into public.stock_alerts(product_id, branch_id, alert_type, quantity)
      values (r.product_id, r.branch_id, 'expired', 0);
      cnt := cnt + 1;
    end if;
  end loop;

  for r in
    select t.product_id, t.branch_id
    from public.inventory_transactions t
    join public.products p on p.id = t.product_id
    where p.expiry_tracking = true
      and t.expiry_date is not null
      and t.expiry_date >= current_date
      and t.expiry_date <= current_date + interval '30 days'
      and t.transaction_type = 'purchase'
      and public.user_has_branch_access(t.branch_id)
    group by t.product_id, t.branch_id
  loop
    if not exists (
      select 1 from public.stock_alerts
      where product_id = r.product_id and branch_id = r.branch_id
        and alert_type in ('expiring_soon','expired') and is_resolved = false
    ) then
      insert into public.stock_alerts(product_id, branch_id, alert_type, quantity)
      values (r.product_id, r.branch_id, 'expiring_soon', 0);
      cnt := cnt + 1;
    end if;
  end loop;

  return cnt;
end;
$function$;
