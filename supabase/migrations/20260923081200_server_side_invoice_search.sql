-- Server-side invoice search with pagination.
-- SECURITY INVOKER keeps the existing invoices/patients RLS policies authoritative.

create or replace function public.search_invoices_page(
  p_branch_id uuid,
  p_search text default null,
  p_status public.invoice_status default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  invoice_number text,
  invoice_date date,
  total numeric,
  paid_amount numeric,
  status public.invoice_status,
  patient_id uuid,
  first_name_en text,
  last_name_en text,
  first_name_ar text,
  last_name_ar text,
  name_language text,
  patient_code integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $function$
  with params as (
    select nullif(btrim(left(coalesce(p_search, ''), 60)), '') as search_term
  ),
  filtered as (
    select
      i.id,
      i.invoice_number,
      i.invoice_date,
      i.total,
      i.paid_amount,
      i.status,
      i.patient_id,
      i.created_at,
      p.first_name_en,
      p.last_name_en,
      p.first_name_ar,
      p.last_name_ar,
      p.name_language,
      p.patient_code
    from public.invoices i
    join public.patients p
      on p.id = i.patient_id
     and p.deleted_at is null
    cross join params x
    where i.deleted_at is null
      and i.branch_id = p_branch_id
      and (p_status is null or i.status = p_status)
      and (
        x.search_term is null
        or position(lower(x.search_term) in lower(coalesce(i.invoice_number, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.first_name_en, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.last_name_en, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.first_name_ar, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.last_name_ar, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.phone, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.phone2, ''))) > 0
        or position(lower(x.search_term) in lower(coalesce(p.email, ''))) > 0
        or p.patient_code::text = x.search_term
      )
  )
  select
    f.id,
    f.invoice_number,
    f.invoice_date,
    f.total,
    f.paid_amount,
    f.status,
    f.patient_id,
    f.first_name_en,
    f.last_name_en,
    f.first_name_ar,
    f.last_name_ar,
    f.name_language,
    f.patient_code,
    count(*) over() as total_count
  from filtered f
  order by f.created_at desc, f.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.search_invoices_page(uuid, text, public.invoice_status, integer, integer) from public;
revoke all on function public.search_invoices_page(uuid, text, public.invoice_status, integer, integer) from anon;
grant execute on function public.search_invoices_page(uuid, text, public.invoice_status, integer, integer) to authenticated;
grant execute on function public.search_invoices_page(uuid, text, public.invoice_status, integer, integer) to service_role;
