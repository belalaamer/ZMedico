-- Server-side product search, filtering, stock aggregation, and pagination.

create or replace function public.search_products_page(
  p_tenant_id uuid,
  p_branch_id uuid default null,
  p_search text default null,
  p_category_id uuid default null,
  p_active boolean default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  sku text,
  barcode text,
  name_en text,
  name_ar text,
  description_en text,
  description_ar text,
  category_id uuid,
  supplier_id uuid,
  unit text,
  cost_price numeric,
  selling_price numeric,
  min_stock_level integer,
  max_stock_level integer,
  expiry_tracking boolean,
  is_active boolean,
  image_url text,
  created_at timestamptz,
  updated_at timestamptz,
  tenant_id uuid,
  stock_quantity numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $function$
  with params as (
    select nullif(btrim(left(coalesce(p_search,''),100)),'') as search_term
  ),
  filtered as (
    select
      p.id, p.sku, p.barcode, p.name_en, p.name_ar,
      p.description_en, p.description_ar,
      p.category_id, p.supplier_id, p.unit,
      p.cost_price, p.selling_price,
      p.min_stock_level, p.max_stock_level,
      p.expiry_tracking, p.is_active, p.image_url,
      p.created_at, p.updated_at, p.tenant_id,
      coalesce(stock.qty,0)::numeric as stock_quantity
    from public.products p
    cross join params x
    left join lateral (
      select coalesce(sum(i.quantity),0)::numeric as qty
      from public.inventory i
      where i.product_id = p.id
        and (p_branch_id is null or i.branch_id = p_branch_id)
    ) stock on true
    where p.tenant_id = p_tenant_id
      and p.deleted_at is null
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_active is null or p.is_active = p_active)
      and (
        x.search_term is null
        or position(lower(x.search_term) in lower(coalesce(p.name_en,''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.name_ar,''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.sku,''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.barcode,''))) > 0
      )
  )
  select
    f.id, f.sku, f.barcode, f.name_en, f.name_ar,
    f.description_en, f.description_ar,
    f.category_id, f.supplier_id, f.unit,
    f.cost_price, f.selling_price,
    f.min_stock_level, f.max_stock_level,
    f.expiry_tracking, f.is_active, f.image_url,
    f.created_at, f.updated_at, f.tenant_id,
    f.stock_quantity,
    count(*) over() as total_count
  from filtered f
  order by f.created_at desc, f.id desc
  limit greatest(1,least(coalesce(p_limit,25),100))
  offset greatest(coalesce(p_offset,0),0);
$function$;

revoke all on function public.search_products_page(
  uuid,uuid,text,uuid,boolean,integer,integer
) from public,anon;

grant execute on function public.search_products_page(
  uuid,uuid,text,uuid,boolean,integer,integer
) to authenticated,service_role;

create index if not exists idx_products_active_tenant_created
  on public.products(tenant_id,created_at desc,id desc)
  where deleted_at is null;

create index if not exists idx_products_active_tenant_category_created
  on public.products(tenant_id,category_id,created_at desc,id desc)
  where deleted_at is null;

create index if not exists idx_products_active_tenant_status_created
  on public.products(tenant_id,is_active,created_at desc,id desc)
  where deleted_at is null;
