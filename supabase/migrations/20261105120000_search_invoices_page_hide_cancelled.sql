-- (أ) search_invoices_page — hide cancelled invoices from the desk by default,
-- and let the page count follow the same rule. Additive and backward compatible:
-- the existing five-argument call keeps resolving because the new parameter is
-- defaulted, and total_count is a window over the filtered set, so the pager can
-- never offer a page of rows the desk was not shown.
--
-- Status: APPLIED to Production `rqcmnfzfytyyicelvifk` on 2026-11-05, owner-approved
-- COMMIT. Proved first on live Production with zero writes -- BEGIN; <these exact bytes>;
-- <receipts>; ROLLBACK; -- and re-measured after the COMMIT: see
-- docs/TREASURY_SHIFT_APPLY_20261105.md for the apply receipts, the prosrc length/md5
-- byte-fidelity gate, the privilege census and the 12/12 financial-regression run.
--
-- One file-wide status note: this header was corrected after the apply. The bytes that
-- were COMMITted are the bytes below, verified by prosrc length and md5 on the live
-- catalog (2401 / bf72bdf35a8b209337e183d7941d6844); header comments are outside any
-- function body and are not part of that gate.
--
-- Why a parameter and not a fix in the client: voiding an invoice writes
-- status='cancelled' and leaves deleted_at NULL (20260923193000:493), so the
-- desk's `deleted_at is null` cannot see the void. Filtering after the RPC would
-- shrink the page to fewer than 50 rows while total_count still counted the
-- cancelled ones, which is the page-numbering bug the owner named.

drop function if exists public.search_invoices_page(uuid, text, public.invoice_status, integer, integer);

create or replace function public.search_invoices_page(
  p_branch_id uuid,
  p_search text default null,
  p_status public.invoice_status default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_include_cancelled boolean default false
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
      -- The working view is "not voided". Two ways out: the desk asks for the
      -- archive, or it picked 'cancelled' as the status, which is already an
      -- explicit request to see voided rows and must not return nothing.
      and (p_include_cancelled or p_status = 'cancelled' or i.status <> 'cancelled')
      and (
        x.search_term is null
        or position(lower(x.search_term) in lower(coalesce(i.invoice_number, ''))) > 0
        or position(lower(x.search_term) in lower(concat_ws(' ', p.first_name_en, p.last_name_en))) > 0
        or position(lower(x.search_term) in lower(concat_ws(' ', p.first_name_ar, p.last_name_ar))) > 0
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

revoke all on function public.search_invoices_page(uuid, text, public.invoice_status, integer, integer, boolean) from public;
revoke all on function public.search_invoices_page(uuid, text, public.invoice_status, integer, integer, boolean) from anon;
grant execute on function public.search_invoices_page(uuid, text, public.invoice_status, integer, integer, boolean) to authenticated;
grant execute on function public.search_invoices_page(uuid, text, public.invoice_status, integer, integer, boolean) to service_role;
