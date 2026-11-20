-- PR-7: make the collection retry safe when the first response was lost.
--
-- The original collection RPC checked the invoice overpayment before it looked
-- up the idempotency key. A committed batch had already raised paid_amount, so
-- retrying the same key returned "Overpayment blocked" instead of replaying.
-- This migration is body-only: it moves the existing replay lookup ahead of
-- the overpayment check. No new tables, permissions, routes, or money paths.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.fn_treasury_payment_collect(
  _branch_id uuid,
  _patient_id uuid,
  _invoice_id uuid,
  _splits jsonb,
  _idempotency_key text,
  _request_id uuid,
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
  v_replay jsonb;
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
  if _request_id is null then
    raise exception 'request id is required' using errcode = '22023';
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

    -- Wallet top-ups and wallet spends use the existing payments/patient-wallet
    -- path, which has its own funding and ledger rules. This route RPC refuses
    -- them explicitly so a wallet movement cannot be posted as a normal split.
    if v_method = 'wallet'::public.payment_method then
      raise exception 'Wallet movements are not handled by the collection RPC'
        using errcode = '0A000';
    end if;

    v_total := v_total + v_amount;
    v_normalized := v_normalized || jsonb_build_object(
      'index', v_i + 1,
      'amount', v_amount,
      'payment_method', v_method::text
    );
  end loop;

  -- A lost response is retried with the same key/request id. The replay must
  -- be resolved before the invoice overpayment check: the committed batch has
  -- already increased paid_amount, and that is exactly the case a replay is
  -- meant to recognize. Checking the invoice first turns a safe retry into a
  -- false overpayment error and leaves the operator unable to reconcile.
  v_replay := public._fn_treasury_payment_replay(
    _branch_id, _patient_id, _invoice_id, v_key, _request_id,
    v_cycle_id, v_total, v_normalized, _payment_date
  );
  if v_replay is not null then
    return v_replay;
  end if;

  if _invoice_id is not null
     and coalesce(v_invoice.paid_amount, 0) + v_total > v_invoice.total then
    raise exception 'Overpayment blocked: invoice total %, already paid %, batch total %',
      v_invoice.total, coalesce(v_invoice.paid_amount, 0), v_total
      using errcode = '23514';
  end if;

  -- -----------------------------------------------------------------------
  -- Resolve one explicit route per split
  -- -----------------------------------------------------------------------
  for v_i in 0 .. jsonb_array_length(v_normalized) - 1 loop
    v_elem := v_normalized -> v_i;
    v_method := (v_elem ->> 'payment_method')::public.payment_method;
    v_amount := (v_elem ->> 'amount')::numeric(14,2);

    -- Route policy: the PR-2 unique indexes forbid a second route for the
    -- same branch/method/cycle (including the NULL default cycle), so there is
    -- never a tie to resolve. When both a cycle route and the default exist,
    -- the cycle route is selected; otherwise the default is selected.
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
      -- A physical drawer belongs to cash. A non-cash route that asks for a
      -- shift is a configuration error, not an invitation to use a cash row.
      if v_method <> 'cash'::public.payment_method then
        raise exception 'Only cash routes may require a shift (route %, method %)',
          v_route.id, v_method using errcode = '23514';
      end if;

      if _shift_id is not null then
        select s.id, s.treasury_id
          into v_shift
          from public.treasury_shifts s
          join public.treasury t on t.id = s.treasury_id
         where s.id = _shift_id
           and s.branch_id = _branch_id
           and s.custodian_user_id = v_actor
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
           and s.custodian_user_id = v_actor
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
           and s.custodian_user_id = v_actor
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
           and s.custodian_user_id = v_actor
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

  -- Creation is serialised after the shift/treasury prefix. PR-4 never takes
  -- the batch advisory lock, so its order is a strict prefix of this one:
  -- shift advisory -> shift row -> treasury row -> batch/request advisory.
  perform pg_advisory_xact_lock(
    hashtextextended('payment-batch:' || _branch_id::text || ':' || v_key, 0)
  );

  -- A same-key winner may have committed while this call waited for the
  -- shift/treasury locks. Re-read before creating anything.
  v_replay := public._fn_treasury_payment_replay(
    _branch_id, _patient_id, _invoice_id, v_key, _request_id,
    v_cycle_id, v_total, v_normalized, _payment_date
  );
  if v_replay is not null then
    return v_replay;
  end if;

  -- -----------------------------------------------------------------------
  -- Write the batch and its split rows
  -- -----------------------------------------------------------------------
  insert into public.payment_batches (
    branch_id, shift_id, patient_id, invoice_id, financial_cycle_id,
    idempotency_key, request_id, total_amount, status, created_by
  ) values (
    _branch_id, v_batch_shift, _patient_id, _invoice_id, v_cycle_id,
    v_key, _request_id, v_total, 'posted', v_actor
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

commit;
