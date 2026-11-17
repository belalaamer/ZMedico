-- PR-5/6: payment collection RPCs for the additive treasury model.
--
-- This migration adds one collection RPC, one payment-link immutability
-- trigger, and one ledger-cycle attribution trigger. It does not delete rows,
-- tables, columns, or historical ledger entries, and it does not backfill
-- legacy payments.
--
-- A collection is a payment_batch plus one payment row per split. The RPC:
--   * resolves an explicit treasury_payment_routes row per split,
--   * requires an open cash shift when the route says requires_shift,
--   * derives the financial cycle from the invoice (or the payment date),
--   * writes payment_batch_id, split_index, idempotency_key, shift_id and
--     financial_cycle_id on every payment,
--   * reuses the existing payment AFTER INSERT trigger for the ledger and
--     invoice recalculation, so there is only one posting path per payment.
--
-- Canonical lock order is the same as PR-4:
--   1. advisory lock for the payment idempotency key (batch creation only),
--   2. advisory lock keyed by each shift id, in id order,
--   3. shift rows, in id order,
--   4. treasury rows, in id order,
--   5. re-read and revalidate route, shift and treasury metadata.
--
-- The batch advisory lock serialises retries of the same key. The shift
-- advisory lock is the same key used by transfer_treasury_funds and by the
-- shift close/settle RPCs, so a collection cannot interleave with a handover.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. payment link immutability
-- ---------------------------------------------------------------------------

-- The existing tg_payment_immutable_fields() protects the money facts. The new
-- links are equally permanent: rewriting a payment into another batch, shift,
-- cycle, or split slot would move money between reports without a ledger entry.
create or replace function public._tg_payment_links_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if NEW.shift_id            is distinct from OLD.shift_id
     or NEW.payment_batch_id is distinct from OLD.payment_batch_id
     or NEW.idempotency_key  is distinct from OLD.idempotency_key
     or NEW.financial_cycle_id is distinct from OLD.financial_cycle_id
     or NEW.split_index       is distinct from OLD.split_index then
    raise exception 'Payment links are permanent -- reverse the payment and record a new one'
      using errcode = '23514';
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_payment_links_immutable on public.payments;
create trigger trg_payment_links_immutable
before update on public.payments
for each row execute function public._tg_payment_links_immutable();

revoke all on function public._tg_payment_links_immutable()
  from public, anon, authenticated;

-- A payment-derived ledger row carries the same cycle as its payment. This is
-- a forward-only attribution for new rows; historical rows keep NULL.
create or replace function public._tg_treasury_tx_payment_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if NEW.reference_type = 'payment'
     and NEW.reference_id is not null
     and NEW.financial_cycle_id is null then
    select p.financial_cycle_id
      into NEW.financial_cycle_id
      from public.payments p
     where p.id = NEW.reference_id;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_treasury_tx_payment_cycle on public.treasury_transactions;
create trigger trg_treasury_tx_payment_cycle
before insert on public.treasury_transactions
for each row execute function public._tg_treasury_tx_payment_cycle();

revoke all on function public._tg_treasury_tx_payment_cycle()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. collection RPC
-- ---------------------------------------------------------------------------

create or replace function public.fn_treasury_payment_collect(
  _branch_id uuid,
  _patient_id uuid,
  _invoice_id uuid,
  _splits jsonb,
  _idempotency_key text,
  _payment_date date default null,
  _shift_id uuid default null,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_key text := nullif(btrim(_idempotency_key), '');
  v_count integer;
  v_i integer;
  v_elem jsonb;
  v_method public.payment_method;
  v_amount numeric(14,2);
  v_amount_raw numeric;
  v_total numeric(14,2) := 0;
  v_normalized jsonb := '[]'::jsonb;
  v_invoice record;
  v_patient_branch uuid;
  v_cycle_id uuid;
  v_cycle_date date;
  v_payment_date date;
  v_existing record;
  v_existing_norm jsonb;
  v_existing_count integer;
  v_existing_min_date date;
  v_existing_max_date date;
  v_route record;
  v_resolved jsonb := '[]'::jsonb;
  v_shift record;
  v_treasury_id uuid;
  v_shift_id uuid;
  v_open_shifts integer;
  v_distinct_shifts integer;
  v_batch_shift uuid;
  v_batch_id uuid;
  v_payment_id uuid;
  v_payment_ids jsonb := '[]'::jsonb;
  v_inserted_count integer;
  v_inserted_total numeric(14,2);
  v_r record;
begin
  -- -----------------------------------------------------------------------
  -- Input and caller checks
  -- -----------------------------------------------------------------------
  if _branch_id is null or _patient_id is null then
    raise exception 'Branch and patient are required' using errcode = '22023';
  end if;

  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.has_permission(v_actor, 'invoices.create') then
    raise exception 'Forbidden: missing permission invoices.create'
      using errcode = '42501';
  end if;
  if not public.user_has_branch_access(_branch_id) then
    raise exception 'Forbidden: branch outside caller scope'
      using errcode = '42501';
  end if;

  if v_key is null or char_length(v_key) < 8 or char_length(v_key) > 200 then
    raise exception 'idempotency key must be between 8 and 200 characters'
      using errcode = '22023';
  end if;

  if _splits is null
     or jsonb_typeof(_splits) <> 'array'
     or jsonb_array_length(_splits) not between 1 and 50 then
    raise exception 'splits must be a JSON array of 1 to 50 payment objects'
      using errcode = '22023';
  end if;

  if _invoice_id is not null then
    select i.id, i.branch_id, i.patient_id, i.invoice_date,
           i.status::text as status, i.total, i.paid_amount
      into v_invoice
      from public.invoices i
     where i.id = _invoice_id;
    if not found then
      raise exception 'Invoice % not found', _invoice_id using errcode = '23503';
    end if;
    if v_invoice.branch_id is null or v_invoice.branch_id <> _branch_id then
      raise exception 'Invoice % is not in branch %', _invoice_id, _branch_id
        using errcode = '23514';
    end if;
    if v_invoice.patient_id <> _patient_id then
      raise exception 'Invoice % belongs to another patient', _invoice_id
        using errcode = '23514';
    end if;
    if v_invoice.status = 'cancelled' then
      raise exception 'Cannot record a payment against a cancelled invoice'
        using errcode = '23514';
    end if;
  end if;

  v_payment_date := coalesce(
    _payment_date,
    (statement_timestamp() at time zone 'Africa/Cairo')::date
  );

  if _invoice_id is not null then
    v_cycle_date := v_invoice.invoice_date;
  else
    v_cycle_date := v_payment_date;
  end if;

  select p.branch_id into v_patient_branch
    from public.patients p
   where p.id = _patient_id;
  if not found then
    raise exception 'Patient % not found', _patient_id using errcode = '23503';
  end if;
  if v_patient_branch is null or v_patient_branch <> _branch_id then
    raise exception 'Patient % is not in branch %', _patient_id, _branch_id
      using errcode = '23514';
  end if;

  v_cycle_id := public._financial_cycle_for_date(_branch_id, v_cycle_date);
  if v_cycle_id is null then
    raise exception 'No financial cycle covers branch % on %',
      _branch_id, v_cycle_date using errcode = '23514';
  end if;

  -- -----------------------------------------------------------------------
  -- Normalise and validate splits before taking any lock
  -- -----------------------------------------------------------------------
  for v_i in 0 .. jsonb_array_length(_splits) - 1 loop
    v_elem := _splits -> v_i;

    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'split % must be an object', v_i + 1 using errcode = '22023';
    end if;

    begin
      v_amount_raw := (v_elem ->> 'amount')::numeric;
    exception when others then
      raise exception 'split % has an invalid amount', v_i + 1 using errcode = '22023';
    end;

    if v_amount_raw is null
       or v_amount_raw::text in ('NaN', 'Infinity', '-Infinity')
       or v_amount_raw <= 0
       or v_amount_raw <> round(v_amount_raw, 2) then
      raise exception 'split % amount must be positive with at most 2 decimals',
        v_i + 1 using errcode = '22023';
    end if;
    if v_amount_raw > 999999999999.99 then
      raise exception 'split % amount exceeds numeric(14,2)', v_i + 1
        using errcode = '22003';
    end if;
    v_amount := v_amount_raw::numeric(14,2);

    if coalesce(nullif(btrim(v_elem ->> 'payment_method'), ''), '') = '' then
      raise exception 'split % is missing payment_method', v_i + 1
        using errcode = '22023';
    end if;

    begin
      v_method := (v_elem ->> 'payment_method')::public.payment_method;
    exception when invalid_text_representation then
      raise exception 'split % has unknown payment_method %', v_i + 1,
        v_elem ->> 'payment_method' using errcode = '22023';
    end;

    -- Wallet top-ups have a separate funding RPC and a different ledger path.
    if v_method = 'wallet'::public.payment_method then
      raise exception 'Wallet top-ups are not handled by the collection RPC'
        using errcode = '0A000';
    end if;

    v_total := v_total + v_amount;
    v_normalized := v_normalized || jsonb_build_object(
      'index', v_i + 1,
      'amount', v_amount,
      'payment_method', v_method::text
    );
  end loop;

  if _invoice_id is not null
     and coalesce(v_invoice.paid_amount, 0) + v_total > v_invoice.total then
    raise exception 'Overpayment blocked: invoice total %, already paid %, batch total %',
      v_invoice.total, coalesce(v_invoice.paid_amount, 0), v_total
      using errcode = '23514';
  end if;

  -- -----------------------------------------------------------------------
  -- Idempotency: serialise the key, then replay or continue
  -- -----------------------------------------------------------------------
  perform pg_advisory_xact_lock(
    hashtextextended('payment-batch:' || _branch_id::text || ':' || v_key, 0)
  );

  select b.id, b.patient_id, b.invoice_id, b.financial_cycle_id,
         b.shift_id, b.total_amount, b.status
    into v_existing
    from public.payment_batches b
   where b.branch_id = _branch_id
     and b.idempotency_key = v_key;

  if found then
    if v_existing.status <> 'posted' then
      raise exception 'Idempotency key % belongs to a % batch', v_key, v_existing.status
        using errcode = '23514';
    end if;

    select jsonb_agg(jsonb_build_object(
             'index', p.split_index,
             'amount', p.amount,
             'payment_method', p.payment_method::text
           ) order by p.split_index),
           count(*),
           min(p.payment_date),
           max(p.payment_date)
      into v_existing_norm, v_existing_count,
           v_existing_min_date, v_existing_max_date
      from public.payments p
     where p.payment_batch_id = v_existing.id;

    if v_existing.patient_id is distinct from _patient_id
       or v_existing.invoice_id is distinct from _invoice_id
       or v_existing.financial_cycle_id is distinct from v_cycle_id
       or v_existing.total_amount is distinct from v_total
       or v_existing_count is distinct from jsonb_array_length(v_normalized)
       or v_existing_norm is distinct from v_normalized
       or (_payment_date is not null
           and (v_existing_min_date is distinct from _payment_date
                or v_existing_max_date is distinct from _payment_date)) then
      raise exception 'Idempotency key % was already used with different payment facts', v_key
        using errcode = '23505';
    end if;

    select coalesce(jsonb_agg(p.id order by p.split_index), '[]'::jsonb)
      into v_payment_ids
      from public.payments p
     where p.payment_batch_id = v_existing.id;

    return jsonb_build_object(
      'batch_id', v_existing.id,
      'payment_ids', v_payment_ids,
      'total_amount', v_existing.total_amount,
      'financial_cycle_id', v_existing.financial_cycle_id,
      'shift_id', v_existing.shift_id,
      'idempotent_replay', true
    );
  end if;

  -- -----------------------------------------------------------------------
  -- Resolve one explicit route per split
  -- -----------------------------------------------------------------------
  for v_i in 0 .. jsonb_array_length(v_normalized) - 1 loop
    v_elem := v_normalized -> v_i;
    v_method := (v_elem ->> 'payment_method')::public.payment_method;
    v_amount := (v_elem ->> 'amount')::numeric(14,2);

    select r.id, r.treasury_id, r.requires_shift
      into v_route
      from public.treasury_payment_routes r
     where r.branch_id = _branch_id
       and r.payment_method = v_method
       and r.is_active
       and (r.financial_cycle_id = v_cycle_id or r.financial_cycle_id is null)
     order by (r.financial_cycle_id is not null) desc, r.created_at, r.id
     limit 1;

    if not found then
      raise exception 'No active % payment route for branch % in cycle %',
        v_method, _branch_id, v_cycle_id using errcode = '23514';
    end if;

    v_shift_id := null;
    v_treasury_id := null;

    if v_route.requires_shift then
      if _shift_id is not null then
        select s.id, s.treasury_id
          into v_shift
          from public.treasury_shifts s
          join public.treasury t on t.id = s.treasury_id
         where s.id = _shift_id
           and s.branch_id = _branch_id
           and s.closed_at is null
           and s.settled_at is null
           and t.branch_id = _branch_id
           and t.financial_cycle_id = v_cycle_id
           and t.account_kind = 'cash'
           and t.is_active
           and t.deleted_at is null;
        if not found then
          raise exception 'Shift % is not an open cash drawer in branch % for cycle %',
            _shift_id, _branch_id, v_cycle_id using errcode = '23514';
        end if;
      else
        select count(*)
          into v_open_shifts
          from public.treasury_shifts s
          join public.treasury t on t.id = s.treasury_id
         where s.branch_id = _branch_id
           and s.closed_at is null
           and s.settled_at is null
           and t.branch_id = _branch_id
           and t.financial_cycle_id = v_cycle_id
           and t.account_kind = 'cash'
           and t.is_active
           and t.deleted_at is null;

        if v_open_shifts = 0 then
          raise exception 'No open cash shift for branch % in cycle %',
            _branch_id, v_cycle_id using errcode = '55000';
        end if;
        if v_open_shifts > 1 then
          raise exception 'Multiple open cash shifts for branch %; pass _shift_id',
            _branch_id using errcode = '23514';
        end if;

        select s.id, s.treasury_id
          into v_shift
          from public.treasury_shifts s
          join public.treasury t on t.id = s.treasury_id
         where s.branch_id = _branch_id
           and s.closed_at is null
           and s.settled_at is null
           and t.branch_id = _branch_id
           and t.financial_cycle_id = v_cycle_id
           and t.account_kind = 'cash'
           and t.is_active
           and t.deleted_at is null;
      end if;

      v_shift_id := v_shift.id;
      v_treasury_id := v_shift.treasury_id;
    else
      if _shift_id is not null then
        raise exception 'Shift % cannot be attached to a route that does not require a shift',
          _shift_id using errcode = '23514';
      end if;

      select t.id
        into v_treasury_id
        from public.treasury t
       where t.id = v_route.treasury_id
         and t.branch_id = _branch_id
         and t.financial_cycle_id = v_cycle_id
         and t.is_active
         and t.deleted_at is null;
      if not found then
        raise exception 'Route % points at treasury % outside branch % / cycle %',
          v_route.id, v_route.treasury_id, _branch_id, v_cycle_id
          using errcode = '23514';
      end if;
    end if;

    v_resolved := v_resolved || jsonb_build_object(
      'index', v_elem ->> 'index',
      'amount', v_amount,
      'payment_method', v_method::text,
      'treasury_id', v_treasury_id,
      'shift_id', v_shift_id,
      'route_id', v_route.id,
      'reference_number', nullif(btrim(coalesce(v_elem ->> 'reference_number', '')), ''),
      'notes', coalesce(
        nullif(btrim(coalesce(v_elem ->> 'notes', '')), ''),
        _notes
      )
    );
  end loop;

  -- The batch points at a shift only when every split that has one uses the
  -- same drawer. Each payment row still carries its own shift_id.
  select count(distinct (e ->> 'shift_id')::uuid)
    into v_distinct_shifts
    from jsonb_array_elements(v_resolved) e
   where e ->> 'shift_id' is not null;

  if v_distinct_shifts = 1 then
    select (e ->> 'shift_id')::uuid
      into v_batch_shift
      from jsonb_array_elements(v_resolved) e
     where e ->> 'shift_id' is not null
     limit 1;
  else
    v_batch_shift := null;
  end if;

  -- -----------------------------------------------------------------------
  -- Canonical locks: advisory -> shift -> treasury
  -- -----------------------------------------------------------------------
  for v_r in
    select distinct (e ->> 'shift_id')::uuid as id
      from jsonb_array_elements(v_resolved) e
     where e ->> 'shift_id' is not null
     order by 1
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('treasury-transfer:' || v_r.id::text, 0)
    );
  end loop;

  for v_r in
    select distinct (e ->> 'shift_id')::uuid as id
      from jsonb_array_elements(v_resolved) e
     where e ->> 'shift_id' is not null
     order by 1
  loop
    perform 1
      from public.treasury_shifts s
     where s.id = v_r.id
       for update;
  end loop;

  for v_r in
    select distinct (e ->> 'treasury_id')::uuid as id
      from jsonb_array_elements(v_resolved) e
     order by 1
  loop
    perform 1
      from public.treasury t
     where t.id = v_r.id
       for update;
  end loop;

  -- Re-read after the locks. A route or shift that changed while this call was
  -- waiting must fail, not silently post to the old destination.
  for v_r in
    select value as e from jsonb_array_elements(v_resolved)
  loop
    if not exists (
      select 1
        from public.treasury_payment_routes r
       where r.id = (v_r.e ->> 'route_id')::uuid
         and r.branch_id = _branch_id
         and r.is_active
         and r.payment_method = (v_r.e ->> 'payment_method')::public.payment_method
         and (r.financial_cycle_id = v_cycle_id or r.financial_cycle_id is null)
    ) then
      raise exception 'Payment route changed while the collection was waiting'
        using errcode = '23514';
    end if;

    if v_r.e ->> 'shift_id' is not null then
      if not exists (
        select 1
          from public.treasury_shifts s
          join public.treasury t on t.id = s.treasury_id
         where s.id = (v_r.e ->> 'shift_id')::uuid
           and s.branch_id = _branch_id
           and s.closed_at is null
           and s.settled_at is null
           and t.id = (v_r.e ->> 'treasury_id')::uuid
           and t.branch_id = _branch_id
           and t.financial_cycle_id = v_cycle_id
           and t.account_kind = 'cash'
           and t.is_active
           and t.deleted_at is null
      ) then
        raise exception 'Shift % changed while the collection was waiting',
          v_r.e ->> 'shift_id' using errcode = '23514';
      end if;
    else
      if not exists (
        select 1
          from public.treasury t
          join public.treasury_payment_routes r
            on r.treasury_id = t.id
         where t.id = (v_r.e ->> 'treasury_id')::uuid
           and t.branch_id = _branch_id
           and t.financial_cycle_id = v_cycle_id
           and t.is_active
           and t.deleted_at is null
           and r.id = (v_r.e ->> 'route_id')::uuid
           and r.is_active
      ) then
        raise exception 'Treasury % changed while the collection was waiting',
          v_r.e ->> 'treasury_id' using errcode = '23514';
      end if;
    end if;
  end loop;

  -- -----------------------------------------------------------------------
  -- Write the batch and its split rows
  -- -----------------------------------------------------------------------
  insert into public.payment_batches (
    branch_id, shift_id, patient_id, invoice_id, financial_cycle_id,
    idempotency_key, total_amount, status, created_by
  ) values (
    _branch_id, v_batch_shift, _patient_id, _invoice_id, v_cycle_id,
    v_key, v_total, 'posted', v_actor
  ) returning id into v_batch_id;

  for v_r in
    select e, (e ->> 'index')::integer as split_index
      from jsonb_array_elements(v_resolved) e
     order by (e ->> 'index')::integer
  loop
    insert into public.payments (
      invoice_id, patient_id, branch_id, treasury_id, amount,
      payment_method, payment_date, reference_number, notes, received_by,
      shift_id, payment_batch_id, idempotency_key, financial_cycle_id,
      split_index
    ) values (
      _invoice_id, _patient_id, _branch_id, (v_r.e ->> 'treasury_id')::uuid,
      (v_r.e ->> 'amount')::numeric(14,2),
      (v_r.e ->> 'payment_method')::public.payment_method,
      v_payment_date,
      v_r.e ->> 'reference_number',
      v_r.e ->> 'notes',
      v_actor,
      (v_r.e ->> 'shift_id')::uuid,
      v_batch_id,
      v_key,
      v_cycle_id,
      v_r.split_index
    ) returning id into v_payment_id;

    v_payment_ids := v_payment_ids || to_jsonb(v_payment_id);
  end loop;

  -- The batch must equal its split rows. This is a runtime invariant, not a
  -- test-only expectation: a mismatch rolls the whole transaction back.
  select count(*), coalesce(sum(p.amount), 0)
    into v_inserted_count, v_inserted_total
    from public.payments p
   where p.payment_batch_id = v_batch_id;

  if v_inserted_count <> jsonb_array_length(v_resolved)
     or v_inserted_total <> v_total then
    raise exception 'Collection batch % does not equal its payment rows (count %, total %)',
      v_batch_id, v_inserted_count, v_inserted_total
      using errcode = '23514';
  end if;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'payment_ids', v_payment_ids,
    'total_amount', v_total,
    'financial_cycle_id', v_cycle_id,
    'shift_id', v_batch_shift,
    'idempotent_replay', false
  );
end;
$fn$;

revoke all on function public.fn_treasury_payment_collect(
  uuid, uuid, uuid, jsonb, text, date, uuid, text
) from public, anon, authenticated;

grant execute on function public.fn_treasury_payment_collect(
  uuid, uuid, uuid, jsonb, text, date, uuid, text
) to authenticated, service_role;
