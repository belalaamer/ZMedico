
-- 1) Link invoice items to products
alter table public.invoice_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists idx_invoice_items_product on public.invoice_items(product_id);

-- 2) Storage bucket for product images
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public read
create policy "product_images_public_read"
on storage.objects for select
using (bucket_id = 'product-images');

create policy "product_images_auth_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images');

create policy "product_images_auth_update"
on storage.objects for update to authenticated
using (bucket_id = 'product-images');

create policy "product_images_auth_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images');

-- 3) Expiry-check function (callable from client on Alerts page load)
create or replace function public.check_expiry_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int := 0;
  r record;
begin
  -- Expired
  for r in
    select t.product_id, t.branch_id
    from public.inventory_transactions t
    join public.products p on p.id = t.product_id
    where p.expiry_tracking = true
      and t.expiry_date is not null
      and t.expiry_date < current_date
      and t.transaction_type = 'purchase'
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

  -- Expiring within 30 days
  for r in
    select t.product_id, t.branch_id
    from public.inventory_transactions t
    join public.products p on p.id = t.product_id
    where p.expiry_tracking = true
      and t.expiry_date is not null
      and t.expiry_date >= current_date
      and t.expiry_date <= current_date + interval '30 days'
      and t.transaction_type = 'purchase'
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
end; $$;
