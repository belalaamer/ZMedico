-- Server-side purchase-order search and pagination. RLS remains authoritative
-- because this function is SECURITY INVOKER.

create or replace function public.search_purchase_orders_page(
  p_branch_id uuid default null,
  p_search text default null,
  p_status public.po_status default null,
  p_supplier_id uuid default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  po_number text,
  supplier_id uuid,
  supplier_name_en text,
  supplier_name_ar text,
  order_date date,
  expected_date date,
  status public.po_status,
  subtotal numeric,
  tax numeric,
  total numeric,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $function$
  with params as (
    select nullif(btrim(left(coalesce(p_search, ''), 80)), '') as search_term
  ),
  filtered as (
    select
      po.id,
      po.po_number,
      po.supplier_id,
      s.name_en as supplier_name_en,
      s.name_ar as supplier_name_ar,
      po.order_date,
      po.expected_date,
      po.status,
      po.subtotal,
      po.tax,
      po.total,
      po.created_at
    from public.purchase_orders po
    join public.suppliers s
      on s.id = po.supplier_id
     and s.deleted_at is null
    cross join params x
    where po.deleted_at is null
      and (p_branch_id is null or po.branch_id = p_branch_id)
      and (p_status is null or po.status = p_status)
      and (p_supplier_id is null or po.supplier_id = p_supplier_id)
      and (
        x.search_term is null
        or position(lower(x.search_term) in lower(coalesce(po.po_number, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(s.name_en, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(s.name_ar, ''))) > 0
      )
  )
  select
    f.id,
    f.po_number,
    f.supplier_id,
    f.supplier_name_en,
    f.supplier_name_ar,
    f.order_date,
    f.expected_date,
    f.status,
    f.subtotal,
    f.tax,
    f.total,
    f.created_at,
    count(*) over() as total_count
  from filtered f
  order by f.created_at desc, f.id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.search_purchase_orders_page(
  uuid, text, public.po_status, uuid, integer, integer
) from public, anon;

grant execute on function public.search_purchase_orders_page(
  uuid, text, public.po_status, uuid, integer, integer
) to authenticated, service_role;

create index if not exists idx_purchase_orders_active_branch_created
  on public.purchase_orders (branch_id, created_at desc, id desc)
  where deleted_at is null;

create index if not exists idx_purchase_orders_active_branch_status_created
  on public.purchase_orders (branch_id, status, created_at desc, id desc)
  where deleted_at is null;

create index if not exists idx_purchase_orders_active_branch_supplier_created
  on public.purchase_orders (branch_id, supplier_id, created_at desc, id desc)
  where deleted_at is null;
