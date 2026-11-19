-- PR-3/6: branch, cycle, and route guards for the additive finance schema.
--
-- This migration adds constraints and one trigger function. It does not delete
-- rows, tables, columns, or historical ledger entries.
--
-- It closes the remaining cross-branch links that a single-column FK cannot
-- express, plus the invoice-cycle rule for a payment that carries a cycle.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. payment_batches: patient and shift must be in the batch branch
-- ---------------------------------------------------------------------------

-- Needed as the referenced unique key for the composite FKs below.
create unique index if not exists patients_id_branch_uq
  on public.patients (id, branch_id);

create unique index if not exists payment_batches_id_branch_uq
  on public.payment_batches (id, branch_id);

alter table public.payment_batches
  add constraint payment_batches_patient_branch_fk
    foreign key (patient_id, branch_id)
    references public.patients (id, branch_id)
    on delete restrict
    not valid;

alter table public.payment_batches
  validate constraint payment_batches_patient_branch_fk;

alter table public.payment_batches
  add constraint payment_batches_shift_branch_fk
    foreign key (shift_id, branch_id)
    references public.treasury_shifts (id, branch_id)
    on delete restrict
    not valid;

alter table public.payment_batches
  validate constraint payment_batches_shift_branch_fk;

-- ---------------------------------------------------------------------------
-- 2. payments: a batch link must be in the payment branch
-- ---------------------------------------------------------------------------

alter table public.payments
  add constraint payments_batch_branch_required
    check (payment_batch_id is null or branch_id is not null);

alter table public.payments
  add constraint payments_batch_branch_fk
    foreign key (payment_batch_id, branch_id)
    references public.payment_batches (id, branch_id)
    on delete restrict
    not valid;

alter table public.payments
  validate constraint payments_batch_branch_fk;

-- ---------------------------------------------------------------------------
-- 3. routes: cash always uses a shift
-- ---------------------------------------------------------------------------

alter table public.treasury_payment_routes
  add constraint treasury_payment_routes_cash_requires_shift
    check (payment_method <> 'cash' or requires_shift);

-- ---------------------------------------------------------------------------
-- 4. payments: a cycle must match the linked invoice's cycle
-- ---------------------------------------------------------------------------

-- The invoice does not carry a stored cycle: the cycle is derived from the
-- invoice branch and invoice date through the existing financial-cycle
-- resolver. This trigger makes that derivation binding for new/updated payment
-- links, while leaving legacy rows with financial_cycle_id NULL untouched.
create or replace function public._tg_payment_invoice_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_branch uuid;
  v_invoice_date date;
  v_cycle uuid;
begin
  if new.invoice_id is null or new.financial_cycle_id is null then
    return new;
  end if;

  select i.branch_id, i.invoice_date
    into v_branch, v_invoice_date
  from public.invoices i
  where i.id = new.invoice_id;

  if not found then
    -- The existing invoice FK reports the reference failure.
    return new;
  end if;

  if v_branch is null then
    raise exception 'Invoice % has no branch; payment cycle cannot be verified',
      new.invoice_id
      using errcode = '23514';
  end if;

  v_cycle := public._financial_cycle_for_date(v_branch, v_invoice_date);

  if v_cycle is null then
    raise exception 'Invoice % has no financial cycle for %',
      new.invoice_id, v_invoice_date
      using errcode = '23514';
  end if;

  if new.financial_cycle_id is distinct from v_cycle then
    raise exception 'Payment financial cycle % does not match invoice % cycle %',
      new.financial_cycle_id, new.invoice_id, v_cycle
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public._tg_payment_invoice_cycle()
  from public, anon, authenticated;

create trigger trg_payment_invoice_cycle
before insert or update of invoice_id, financial_cycle_id, branch_id
on public.payments
for each row execute function public._tg_payment_invoice_cycle();
