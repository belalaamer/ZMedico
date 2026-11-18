-- Real-schema regression for 20261117125600_treasury_archive_rpc.sql.
--
-- Run against an isolated real-schema replay, never Production. The fixture is
-- synthetic and rolls back with the test transaction.

begin;
select plan(12);

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
values ('88888888-8888-4888-8888-888888888888','Archive Tenant','archive-tenant','active',now()+interval '1 year')
on conflict (id) do nothing;
insert into public.allowed_signup_emails(email,role,full_name) values
  ('archive-admin@example.test','admin','Archive Admin'),
  ('archive-reception@example.test','receptionist','Archive Reception')
on conflict (email) do nothing;
insert into auth.users(id,email,is_anonymous,deleted_at) values
  ('f8888888-8888-4888-8888-888888888881','archive-admin@example.test',false,null),
  ('f8888888-8888-4888-8888-888888888882','archive-reception@example.test',false,null)
on conflict (id) do nothing;
insert into auth.sessions(id,user_id,not_after) values
  ('e8888888-8888-4888-8888-888888888881','f8888888-8888-4888-8888-888888888881',now()+interval '1 hour'),
  ('e8888888-8888-4888-8888-888888888882','f8888888-8888-4888-8888-888888888882',now()+interval '1 hour')
on conflict (id) do nothing;
insert into public.branches(id,name_en,name_ar,tenant_id) values
  ('b8888888-8888-4888-8888-888888888888','Archive Branch','فرع الأرشفة','88888888-8888-4888-8888-888888888888')
on conflict (id) do nothing;
insert into public.staff_profiles(id,linked_user_id,branch_id,employee_id,status) values
  ('f8888888-8888-4888-8888-888888888881','f8888888-8888-4888-8888-888888888881','b8888888-8888-4888-8888-888888888888','AR-001','active'),
  ('f8888888-8888-4888-8888-888888888882','f8888888-8888-4888-8888-888888888882','b8888888-8888-4888-8888-888888888888','AR-002','active')
on conflict (id) do nothing;
insert into public.staff_branches(user_id,branch_id) values
  ('f8888888-8888-4888-8888-888888888881','b8888888-8888-4888-8888-888888888888'),
  ('f8888888-8888-4888-8888-888888888882','b8888888-8888-4888-8888-888888888888')
on conflict do nothing;
insert into public.user_roles(user_id,role) values
  ('f8888888-8888-4888-8888-888888888881','admin'),
  ('f8888888-8888-4888-8888-888888888882','receptionist')
on conflict do nothing;
insert into public.financial_cycles(id,branch_id,name_en,name_ar,start_date,end_date) values
  ('c8888888-8888-4888-8888-888888888888','b8888888-8888-4888-8888-888888888888','Archive Cycle','دورة الأرشفة',date '2026-05-01',date '2026-11-30')
on conflict (id) do nothing;
insert into public.treasury(id,branch_id,name_en,name_ar,current_balance,non_cash_balance,currency,account_kind,custodian_user_id,parent_treasury_id,is_active,financial_cycle_id,is_default) values
  ('a8888888-8888-4888-8888-888888888880','b8888888-8888-4888-8888-888888888888','Archive Parent','أصل الأرشيف',0,0,'EGP','cash',null,null,true,'c8888888-8888-4888-8888-888888888888',false),
  ('a8888888-8888-4888-8888-888888888881','b8888888-8888-4888-8888-888888888888','Archive Empty','أرشيف فارغ',0,0,'EGP','bank',null,null,true,'c8888888-8888-4888-8888-888888888888',false),
  ('a8888888-8888-4888-8888-888888888882','b8888888-8888-4888-8888-888888888888','Archive NonAdmin','أرشيف غير المدير',0,0,'EGP','bank',null,null,true,'c8888888-8888-4888-8888-888888888888',false),
  ('a8888888-8888-4888-8888-888888888883','b8888888-8888-4888-8888-888888888888','Archive With Transaction','أرشيف بحركة',0,0,'EGP','bank',null,null,true,'c8888888-8888-4888-8888-888888888888',false),
  ('a8888888-8888-4888-8888-888888888884','b8888888-8888-4888-8888-888888888888','Archive With Shift','أرشيف بوردية',0,0,'EGP','cash','f8888888-8888-4888-8888-888888888881','a8888888-8888-4888-8888-888888888880',true,'c8888888-8888-4888-8888-888888888888',false),
  ('a8888888-8888-4888-8888-888888888885','b8888888-8888-4888-8888-888888888888','Archive Already','أرشيف مسبق',0,0,'EGP','bank',null,null,true,'c8888888-8888-4888-8888-888888888888',false)
on conflict (id) do nothing;
insert into public.treasury_transactions(treasury_id,transaction_type,amount,balance_after,description_en)
values ('a8888888-8888-4888-8888-888888888883','income',1,1,'archive fixture')
;
insert into public.treasury_shifts(id,branch_id,treasury_id,opened_by,custodian_user_id,opening_counted,opening_book,status)
values ('f8888888-8888-4888-8888-888888888884','b8888888-8888-4888-8888-888888888888','a8888888-8888-4888-8888-888888888884','f8888888-8888-4888-8888-888888888881','f8888888-8888-4888-8888-888888888881',0,0,'open');

update public.treasury set deleted_at = now()
 where id='a8888888-8888-4888-8888-888888888885';

select pg_temp.act('f8888888-8888-4888-8888-888888888881','e8888888-8888-4888-8888-888888888881');
select is(public.has_permission('f8888888-8888-4888-8888-888888888881','treasury.delete'),true,
  'admin has treasury.delete');
select lives_ok($$
  select public.fn_treasury_archive('a8888888-8888-4888-8888-888888888881')
$$, 'admin can archive an empty treasury');
reset role;
select isnt((select deleted_at from public.treasury
             where id='a8888888-8888-4888-8888-888888888881'),null::timestamptz,
  'archive sets deleted_at');
select is((select count(*) from public.treasury
            where id='a8888888-8888-4888-8888-888888888881'),1::bigint,
  'archive keeps the row');

select pg_temp.act('f8888888-8888-4888-8888-888888888882','e8888888-8888-4888-8888-888888888882');
select throws_ok($$
  select public.fn_treasury_archive('a8888888-8888-4888-8888-888888888882')
$$, '42501', null, 'non-admin cannot archive a treasury');
reset role;
select is((select deleted_at from public.treasury
            where id='a8888888-8888-4888-8888-888888888882'),null::timestamptz,
  'non-admin rejection leaves the row unchanged');

select pg_temp.act('f8888888-8888-4888-8888-888888888881','e8888888-8888-4888-8888-888888888881');
select throws_ok($$
  select public.fn_treasury_archive('a8888888-8888-4888-8888-888888888883')
$$, '23514', null, 'treasury with transactions cannot be archived');
select throws_ok($$
  select public.fn_treasury_archive('a8888888-8888-4888-8888-888888888884')
$$, '23514', null, 'treasury with an open shift cannot be archived');
select throws_ok($$
  select public.fn_treasury_archive('a8888888-8888-4888-8888-888888888885')
$$, '23503', null, 'already archived treasury cannot be archived again');
reset role;
select is((select deleted_at from public.treasury
            where id='a8888888-8888-4888-8888-888888888883'),null::timestamptz,
  'transaction rejection leaves the row unchanged');
select is((select deleted_at from public.treasury
            where id='a8888888-8888-4888-8888-888888888884'),null::timestamptz,
  'shift rejection leaves the row unchanged');
select is(has_table_privilege('authenticated','public.treasury','UPDATE'),false,
  'the archive RPC did not restore table-level UPDATE');

select * from finish();
rollback;
