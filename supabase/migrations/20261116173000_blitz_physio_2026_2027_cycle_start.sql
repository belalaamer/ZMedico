-- Create the scheduled 2026/2027 financial cycle and its zero-opening treasuries.
-- Apply only after the financial-cycle-aware frontend is deployed.
-- The current cycle remains the historical cycle through 2026-11-30.
do $seed$
declare
  v_branch uuid := 'd0c1a50b-8de3-4a32-9b8f-19ff6309a773';
  v_old_cycle uuid;
  v_new_cycle uuid;
  v_safe_id uuid;
  v_bank_id uuid;
begin
  select fc.id into v_old_cycle
  from public.financial_cycles fc
  where fc.branch_id = v_branch
    and fc.end_date = date '2026-11-30'
  order by fc.start_date desc
  limit 1;

  if v_old_cycle is null then
    raise exception 'Historical financial cycle is missing; apply the financial-cycle framework migration first';
  end if;

  select fc.id into v_new_cycle
  from public.financial_cycles fc
  where fc.branch_id = v_branch and fc.start_date = date '2026-12-01';

  if v_new_cycle is null then
    insert into public.financial_cycles
      (branch_id,name_en,name_ar,start_date,end_date)
    values
      (v_branch,'Blitz Physio – 2026/2027','بليتز فيزيو – 2026/2027',
       date '2026-12-01',null)
    returning id into v_new_cycle;
  else
    if exists (
      select 1 from public.financial_cycles
      where id = v_new_cycle and end_date is not null
    ) then
      raise exception 'The scheduled 2026/2027 cycle has an unexpected end date';
    end if;
  end if;

  select t.id into v_safe_id
  from public.treasury t
  where t.branch_id = v_branch
    and t.financial_cycle_id = v_new_cycle
    and lower(t.name_en) = 'clinic safe'
    and t.deleted_at is null
  limit 1;

  if v_safe_id is null then
    insert into public.treasury
      (branch_id,name_en,name_ar,current_balance,non_cash_balance,currency,
       is_active,financial_cycle_id,account_kind,is_default)
    values
      (v_branch,'Clinic Safe','خزينة العيادة',0,0,'EGP',
       true,v_new_cycle,'cash',true)
    returning id into v_safe_id;
  end if;

  select t.id into v_bank_id
  from public.treasury t
  where t.branch_id = v_branch
    and t.financial_cycle_id = v_new_cycle
    and lower(t.name_en) = 'bank treasury'
    and t.deleted_at is null
  limit 1;

  if v_bank_id is null then
    insert into public.treasury
      (branch_id,name_en,name_ar,current_balance,non_cash_balance,currency,
       is_active,financial_cycle_id,account_kind,is_default)
    values
      (v_branch,'Bank Treasury','الخزينة البنكية',0,0,'EGP',
       true,v_new_cycle,'bank',false)
    returning id into v_bank_id;
  end if;

  if v_safe_id = v_bank_id then
    raise exception 'Clinic Safe and Bank Treasury resolved to the same row';
  end if;

  if not exists (
    select 1 from public.treasury
    where id = v_safe_id and account_kind = 'cash'
      and is_default and financial_cycle_id = v_new_cycle
  ) then
    raise exception 'New Clinic Safe is not the default cash account for the new cycle';
  end if;

  if not exists (
    select 1 from public.treasury
    where id = v_bank_id and account_kind = 'bank'
      and not is_default and financial_cycle_id = v_new_cycle
  ) then
    raise exception 'New Bank Treasury is not configured as the bank account for the new cycle';
  end if;
end;
$seed$;
