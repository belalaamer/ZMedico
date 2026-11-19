-- Real-schema regression for the archive RPC guards.
--
-- Run against an isolated real-schema replay, never Production. The fixture is
-- synthetic and the whole test rolls back.

begin;
select plan(28);

create function pg_temp.act(p_uid uuid, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'iss','https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1',
      'sub',p_uid::text,
      'role','authenticated',
      'session_id',p_session::text,
      'exp',extract(epoch from now()+interval '1 hour')::bigint
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub',p_uid::text,true);
  perform set_config('role','authenticated',true);
end;
$$;

insert into public.tenants(id,name,slug,subscription_status,subscription_ends_at)
values ('99999999-9999-4999-8999-999999999999','Archive Guard Tenant','archive-guard','active',now()+interval '1 year')
on conflict (id) do nothing;
insert into public.allowed_signup_emails(email,role,full_name) values
  ('guard-admin@example.test','admin','Guard Admin'),
  ('guard-reception@example.test','receptionist','Guard Reception'),
  ('guard-open@example.test','receptionist','Guard Open'),
  ('guard-closed@example.test','receptionist','Guard Closed'),
  ('guard-settled@example.test','receptionist','Guard Settled')
on conflict (email) do nothing;
insert into auth.users(id,email,is_anonymous,deleted_at) values
  ('f9999999-9999-4999-8999-999999999991','guard-admin@example.test',false,null),
  ('f9999999-9999-4999-8999-999999999992','guard-reception@example.test',false,null),
  ('f9999999-9999-4999-8999-999999999993','guard-open@example.test',false,null),
  ('f9999999-9999-4999-8999-999999999994','guard-closed@example.test',false,null),
  ('f9999999-9999-4999-8999-999999999995','guard-settled@example.test',false,null)
on conflict (id) do nothing;
insert into auth.sessions(id,user_id,not_after) values
  ('e9999999-9999-4999-8999-999999999991','f9999999-9999-4999-8999-999999999991',now()+interval '1 hour'),
  ('e9999999-9999-4999-8999-999999999992','f9999999-9999-4999-8999-999999999992',now()+interval '1 hour')
on conflict (id) do nothing;
insert into public.branches(id,name_en,name_ar,tenant_id) values
  ('b9999999-9999-4999-8999-999999999991','Guard Branch A','فرع الحراسة أ','99999999-9999-4999-8999-999999999999'),
  ('b9999999-9999-4999-8999-999999999992','Guard Branch B','فرع الحراسة ب','99999999-9999-4999-8999-999999999999')
on conflict (id) do nothing;
insert into public.staff_profiles(id,linked_user_id,branch_id,employee_id,status) values
  ('f9999999-9999-4999-8999-999999999991','f9999999-9999-4999-8999-999999999991','b9999999-9999-4999-8999-999999999991','GR-001','active'),
  ('f9999999-9999-4999-8999-999999999992','f9999999-9999-4999-8999-999999999992','b9999999-9999-4999-8999-999999999991','GR-002','active')
on conflict (id) do nothing;
insert into public.staff_branches(user_id,branch_id) values
  ('f9999999-9999-4999-8999-999999999991','b9999999-9999-4999-8999-999999999991'),
  ('f9999999-9999-4999-8999-999999999992','b9999999-9999-4999-8999-999999999991')
on conflict do nothing;
insert into public.user_roles(user_id,role) values
  ('f9999999-9999-4999-8999-999999999991','admin'),
  ('f9999999-9999-4999-8999-999999999992','receptionist')
on conflict do nothing;
insert into public.financial_cycles(id,branch_id,name_en,name_ar,start_date,end_date) values
  ('c9999999-9999-4999-8999-999999999991','b9999999-9999-4999-8999-999999999991','Guard Cycle A','دورة الحراسة أ',date '2026-05-01',date '2026-11-30'),
  ('c9999999-9999-4999-8999-999999999992','b9999999-9999-4999-8999-999999999992','Guard Cycle B','دورة الحراسة ب',date '2026-05-01',date '2026-11-30')
on conflict (id) do nothing;

insert into public.treasury(id,branch_id,name_en,name_ar,current_balance,non_cash_balance,currency,account_kind,custodian_user_id,parent_treasury_id,is_active,financial_cycle_id,is_default) values
  ('a9999999-9999-4999-8999-999999999980','b9999999-9999-4999-8999-999999999991','Guard Parent','أصل الحراسة',0,0,'EGP','cash',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999981','b9999999-9999-4999-8999-999999999991','Guard Empty','حراسة فارغة',0,0,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999982','b9999999-9999-4999-8999-999999999991','Guard NonAdmin','حراسة غير المدير',0,0,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999983','b9999999-9999-4999-8999-999999999991','Guard With Tx','حراسة بحركة',0,0,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999984','b9999999-9999-4999-8999-999999999991','Guard With Open Shift','حراسة بوردية مفتوحة',0,0,'EGP','cash','f9999999-9999-4999-8999-999999999993','a9999999-9999-4999-8999-999999999980',true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999985','b9999999-9999-4999-8999-999999999991','Guard Already','حراسة مؤرشفة',0,0,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999986','b9999999-9999-4999-8999-999999999991','Guard Balance','حراسة برصيد',10,0,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999987','b9999999-9999-4999-8999-999999999991','Guard NonCash','حراسة برصيد غير نقدي',0,5,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999988','b9999999-9999-4999-8999-999999999991','Guard Closed Unsettled','حراسة مغلقة غير مسواة',0,0,'EGP','cash','f9999999-9999-4999-8999-999999999994','a9999999-9999-4999-8999-999999999980',true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-999999999989','b9999999-9999-4999-8999-999999999991','Guard Active Route','حراسة بمسار نشط',0,0,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-99999999998a','b9999999-9999-4999-8999-999999999991','Guard Inactive Route','حراسة بمسار غير نشط',0,0,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-99999999998b','b9999999-9999-4999-8999-999999999991','Guard Settled','حراسة مسواة',0,0,'EGP','cash','f9999999-9999-4999-8999-999999999995','a9999999-9999-4999-8999-999999999980',true,'c9999999-9999-4999-8999-999999999991',false),
  ('a9999999-9999-4999-8999-99999999998c','b9999999-9999-4999-8999-999999999992','Guard Other Branch','حراسة فرع آخر',0,0,'EGP','bank',null,null,true,'c9999999-9999-4999-8999-999999999992',false)
on conflict (id) do nothing;

insert into public.treasury_transactions(treasury_id,transaction_type,amount,balance_after,description_en)
values ('a9999999-9999-4999-8999-999999999983','income',1,1,'guard fixture');
insert into public.treasury_shifts(id,branch_id,treasury_id,opened_by,custodian_user_id,opening_counted,opening_book,status) values
  ('f9999999-9999-4999-8999-999999999984','b9999999-9999-4999-8999-999999999991','a9999999-9999-4999-8999-999999999984','f9999999-9999-4999-8999-999999999993','f9999999-9999-4999-8999-999999999993',0,0,'open');
insert into public.treasury_shifts(id,branch_id,treasury_id,opened_by,custodian_user_id,opening_counted,opening_book,closed_at,closed_by,expected_closing,closing_counted,status) values
  ('f9999999-9999-4999-8999-999999999988','b9999999-9999-4999-8999-999999999991','a9999999-9999-4999-8999-999999999988','f9999999-9999-4999-8999-999999999994','f9999999-9999-4999-8999-999999999994',0,0,now(),'f9999999-9999-4999-8999-999999999994',0,0,'closed');
insert into public.treasury_shifts(id,branch_id,treasury_id,opened_by,custodian_user_id,opening_counted,opening_book,closed_at,closed_by,expected_closing,closing_counted,settled_at,status) values
  ('f9999999-9999-4999-8999-99999999998b','b9999999-9999-4999-8999-999999999991','a9999999-9999-4999-8999-99999999998b','f9999999-9999-4999-8999-999999999995','f9999999-9999-4999-8999-999999999995',0,0,now(),'f9999999-9999-4999-8999-999999999995',0,0,now(),'settled');
insert into public.treasury_payment_routes(branch_id,financial_cycle_id,payment_method,treasury_id,requires_shift,is_active) values
  ('b9999999-9999-4999-8999-999999999991','c9999999-9999-4999-8999-999999999991','card','a9999999-9999-4999-8999-999999999989',false,true),
  ('b9999999-9999-4999-8999-999999999991','c9999999-9999-4999-8999-999999999991','bank_transfer','a9999999-9999-4999-8999-99999999998a',false,false);
update public.treasury set deleted_at = now()
 where id='a9999999-9999-4999-8999-999999999985';

select pg_temp.act('f9999999-9999-4999-8999-999999999991','e9999999-9999-4999-8999-999999999991');
select is(public.has_permission('f9999999-9999-4999-8999-999999999991','treasury.delete'),true,
  'admin has treasury.delete');
select lives_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999981') $$,
  'admin can archive an empty bank treasury');
reset role;
select isnt((select deleted_at from public.treasury where id='a9999999-9999-4999-8999-999999999981'),null::timestamptz,
  'archive sets deleted_at');
select is((select count(*) from public.treasury where id='a9999999-9999-4999-8999-999999999981'),1::bigint,
  'archive keeps the row');

select pg_temp.act('f9999999-9999-4999-8999-999999999992','e9999999-9999-4999-8999-999999999992');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999982') $$,
  '42501', null, 'non-admin cannot archive a treasury');
reset role;
select is((select deleted_at from public.treasury where id='a9999999-9999-4999-8999-999999999982'),null::timestamptz,
  'non-admin rejection leaves the row unchanged');

select pg_temp.act('f9999999-9999-4999-8999-999999999991','e9999999-9999-4999-8999-999999999991');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999983') $$,
  '23514', null, 'treasury with transactions cannot be archived');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999986') $$,
  '23514', null, 'treasury with a book balance cannot be archived');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999987') $$,
  '23514', null, 'treasury with a non-cash balance cannot be archived');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999984') $$,
  '23514', null, 'treasury with an open shift cannot be archived');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999988') $$,
  '23514', null, 'treasury with a closed-unsettled shift cannot be archived');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999989') $$,
  '23514', null, 'treasury selected by an active route cannot be archived');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999980') $$,
  '23514', null, 'treasury with a live child cannot be archived');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999985') $$,
  '23503', null, 'already archived treasury cannot be archived again');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-99999999998c') $$,
  '42501', null, 'admin cannot archive a treasury outside the assigned branch');
reset role;
select is((select current_balance from public.treasury where id='a9999999-9999-4999-8999-999999999986'),10::numeric,
  'balance rejection leaves the book balance unchanged');
select is((select count(*) from public.treasury_transactions where treasury_id='a9999999-9999-4999-8999-999999999983'),1::bigint,
  'transaction rejection adds no ledger row');

select pg_temp.act('f9999999-9999-4999-8999-999999999991','e9999999-9999-4999-8999-999999999991');
select lives_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-99999999998a') $$,
  'admin can archive a treasury whose route is inactive');
select lives_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-99999999998b') $$,
  'admin can archive a treasury with only a settled shift');
reset role;
select isnt((select deleted_at from public.treasury where id='a9999999-9999-4999-8999-99999999998a'),null::timestamptz,
  'inactive-route archive sets deleted_at');
select isnt((select deleted_at from public.treasury where id='a9999999-9999-4999-8999-99999999998b'),null::timestamptz,
  'settled-shift archive sets deleted_at');

select pg_temp.act('f9999999-9999-4999-8999-999999999991','e9999999-9999-4999-8999-999999999991');
select throws_ok($$ select public.fn_treasury_archive('a9999999-9999-4999-8999-999999999981') $$,
  '23503', null, 'repeated archive is a controlled rejection');
select throws_ok($$ update public.treasury set deleted_at = now()
  where id='a9999999-9999-4999-8999-999999999982' $$,
  '42501', null, 'authenticated cannot bypass the RPC with a direct deleted_at update');
reset role;
select is(has_table_privilege('authenticated','public.treasury','UPDATE'),false,
  'the archive RPC did not restore table-level UPDATE');
select is(has_column_privilege('authenticated','public.treasury','deleted_at','UPDATE'),false,
  'authenticated has no direct deleted_at UPDATE');
select is(has_function_privilege('anon','public.fn_treasury_archive(uuid)','EXECUTE'),false,
  'anon has no archive EXECUTE');
select is(has_function_privilege('service_role','public.fn_treasury_archive(uuid)','EXECUTE'),true,
  'service_role has archive EXECUTE');
select is((select count(*) from public.treasury_transactions where treasury_id='a9999999-9999-4999-8999-99999999998b'),0::bigint,
  'successful archive writes no ledger row');

select * from finish();
rollback;
