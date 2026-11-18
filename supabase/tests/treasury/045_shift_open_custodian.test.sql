-- Real-schema regression for 20261117126000_treasury_shift_open_custodian_guard.sql.
--
-- Run against an isolated real-schema replay, never Production. The fixture is
-- synthetic and rolls back with the test transaction.

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
values ('77777777-7777-4777-8777-777777777777','Custodian Guard Tenant','custodian-guard-tenant','active',now()+interval '1 year')
on conflict (id) do nothing;

insert into public.allowed_signup_emails(email,role,full_name) values
  ('custodian-guard-1@example.test','receptionist','Custodian Guard One'),
  ('custodian-guard-2@example.test','receptionist','Custodian Guard Two'),
  ('custodian-guard-3@example.test','admin','Custodian Guard Admin')
on conflict (email) do nothing;

insert into auth.users(id,email,is_anonymous,deleted_at) values
  ('f7777777-7777-4777-8777-777777777771','custodian-guard-1@example.test',false,null),
  ('f7777777-7777-4777-8777-777777777772','custodian-guard-2@example.test',false,null),
  ('f7777777-7777-4777-8777-777777777773','custodian-guard-3@example.test',false,null)
on conflict (id) do nothing;

insert into auth.sessions(id,user_id,not_after) values
  ('e7777777-7777-4777-8777-777777777771','f7777777-7777-4777-8777-777777777771',now()+interval '1 hour'),
  ('e7777777-7777-4777-8777-777777777772','f7777777-7777-4777-8777-777777777772',now()+interval '1 hour'),
  ('e7777777-7777-4777-8777-777777777773','f7777777-7777-4777-8777-777777777773',now()+interval '1 hour')
on conflict (id) do nothing;

insert into public.branches(id,name_en,name_ar,tenant_id) values
  ('b7777777-7777-4777-8777-777777777777','Custodian Guard Branch','فرع حارس العهدة','77777777-7777-4777-8777-777777777777')
on conflict (id) do nothing;

insert into public.staff_profiles(id,linked_user_id,branch_id,employee_id,status) values
  ('f7777777-7777-4777-8777-777777777771','f7777777-7777-4777-8777-777777777771','b7777777-7777-4777-8777-777777777777','CG-001','active'),
  ('f7777777-7777-4777-8777-777777777772','f7777777-7777-4777-8777-777777777772','b7777777-7777-4777-8777-777777777777','CG-002','active'),
  ('f7777777-7777-4777-8777-777777777773','f7777777-7777-4777-8777-777777777773','b7777777-7777-4777-8777-777777777777','CG-003','active')
on conflict (id) do nothing;

insert into public.staff_branches(user_id,branch_id) values
  ('f7777777-7777-4777-8777-777777777771','b7777777-7777-4777-8777-777777777777'),
  ('f7777777-7777-4777-8777-777777777772','b7777777-7777-4777-8777-777777777777'),
  ('f7777777-7777-4777-8777-777777777773','b7777777-7777-4777-8777-777777777777')
on conflict do nothing;

insert into public.user_roles(user_id,role) values
  ('f7777777-7777-4777-8777-777777777771','receptionist'),
  ('f7777777-7777-4777-8777-777777777772','receptionist'),
  ('f7777777-7777-4777-8777-777777777773','admin')
on conflict do nothing;

insert into public.financial_cycles(id,branch_id,name_en,name_ar,start_date,end_date) values
  ('c7777777-7777-4777-8777-777777777777','b7777777-7777-4777-8777-777777777777','Custodian Guard Cycle','دورة حارس العهدة',date '2026-05-01',date '2026-11-30')
on conflict (id) do nothing;

insert into public.treasury(id,branch_id,name_en,name_ar,current_balance,non_cash_balance,currency,account_kind,custodian_user_id,parent_treasury_id,is_active,financial_cycle_id,is_default) values
  ('a7777777-7777-4777-8777-777777777771','b7777777-7777-4777-8777-777777777777','Custodian Guard Parent','أصل حارس العهدة',0,0,'EGP','cash',null,null,true,'c7777777-7777-4777-8777-777777777777',false),
  ('a7777777-7777-4777-8777-777777777772','b7777777-7777-4777-8777-777777777777','Custodian Guard Bank','بنك حارس العهدة',0,0,'EGP','bank',null,null,true,'c7777777-7777-4777-8777-777777777777',false),
  ('a7777777-7777-4777-8777-777777777721','b7777777-7777-4777-8777-777777777777','Custodian Guard One Drawer','درج الحارس الأول',0,0,'EGP','cash','f7777777-7777-4777-8777-777777777771','a7777777-7777-4777-8777-777777777771',true,'c7777777-7777-4777-8777-777777777777',false),
  ('a7777777-7777-4777-8777-777777777722','b7777777-7777-4777-8777-777777777777','Custodian Guard Two Drawer','درج الحارس الثاني',0,0,'EGP','cash','f7777777-7777-4777-8777-777777777772','a7777777-7777-4777-8777-777777777771',true,'c7777777-7777-4777-8777-777777777777',false),
  ('a7777777-7777-4777-8777-777777777723','b7777777-7777-4777-8777-777777777777','Custodian Guard Admin Drawer','درج المدير',0,0,'EGP','cash','f7777777-7777-4777-8777-777777777773','a7777777-7777-4777-8777-777777777771',true,'c7777777-7777-4777-8777-777777777777',false)
on conflict (id) do nothing;

-- 1-5: non-custodian receptionist.
select pg_temp.act('f7777777-7777-4777-8777-777777777771','e7777777-7777-4777-8777-777777777771');
select is(public.has_permission('f7777777-7777-4777-8777-777777777771','treasury.shift.use'),true,
  'receptionist has treasury.shift.use');
reset role;
select is((select custodian_user_id from public.treasury
            where id='a7777777-7777-4777-8777-777777777722'),
  'f7777777-7777-4777-8777-777777777772'::uuid,
  'drawer 722 belongs to custodian two');
select pg_temp.act('f7777777-7777-4777-8777-777777777771','e7777777-7777-4777-8777-777777777771');
select throws_ok($$
  select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777722',0)
$$, '42501', null, 'non-custodian cannot open another custodian drawer');
reset role;
select is((select count(*) from public.treasury_shifts
            where treasury_id='a7777777-7777-4777-8777-777777777722'),0::bigint,
  'rejected open writes no shift');
select is((select count(*) from public.treasury_transactions
            where treasury_id='a7777777-7777-4777-8777-777777777722'),0::bigint,
  'rejected open writes no financial row');

-- 6-10: administrator who is not the custodian.
select pg_temp.act('f7777777-7777-4777-8777-777777777773','e7777777-7777-4777-8777-777777777773');
select is(public.has_role('f7777777-7777-4777-8777-777777777773','admin'::public.app_role),true,
  'administrator role is active');
select is(public.has_permission('f7777777-7777-4777-8777-777777777773','treasury.shift.use'),true,
  'administrator has treasury.shift.use');
reset role;
select is((select custodian_user_id from public.treasury
            where id='a7777777-7777-4777-8777-777777777722'),
  'f7777777-7777-4777-8777-777777777772'::uuid,
  'administrator is not the custodian of drawer 722');
select pg_temp.act('f7777777-7777-4777-8777-777777777773','e7777777-7777-4777-8777-777777777773');
select throws_ok($$
  select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777722',0)
$$, '42501', null, 'administrator cannot open a drawer assigned to someone else');
reset role;
select is((select count(*) from public.treasury_shifts
            where treasury_id='a7777777-7777-4777-8777-777777777722'),0::bigint,
  'administrator rejection writes no shift');

-- 11-20: assigned custodian can open, close, settle, reopen, and close-and-settle.
select pg_temp.act('f7777777-7777-4777-8777-777777777772','e7777777-7777-4777-8777-777777777772');
reset role;
select is((select custodian_user_id from public.treasury
            where id='a7777777-7777-4777-8777-777777777722'),
  'f7777777-7777-4777-8777-777777777772'::uuid,
  'drawer 722 belongs to the acting custodian');
select pg_temp.act('f7777777-7777-4777-8777-777777777772','e7777777-7777-4777-8777-777777777772');
select lives_ok($$
  select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777722',0)
$$, 'assigned custodian can open the drawer');
reset role;
select is((select custodian_user_id from public.treasury_shifts
            where treasury_id='a7777777-7777-4777-8777-777777777722'),
  'f7777777-7777-4777-8777-777777777772'::uuid,
  'opened shift belongs to the assigned custodian');
select is((select status from public.treasury_shifts
            where treasury_id='a7777777-7777-4777-8777-777777777722'),'open',
  'opened shift is open');
select pg_temp.act('f7777777-7777-4777-8777-777777777772','e7777777-7777-4777-8777-777777777772');
select lives_ok($$
  select public.fn_treasury_shift_close('a7777777-7777-4777-8777-777777777722',0)
$$, 'assigned custodian can close the shift');
reset role;
select is((select status from public.treasury_shifts
            where treasury_id='a7777777-7777-4777-8777-777777777722'),'closed',
  'closed shift is closed');
select pg_temp.act('f7777777-7777-4777-8777-777777777772','e7777777-7777-4777-8777-777777777772');
select lives_ok($$
  select public.fn_treasury_shift_settle('a7777777-7777-4777-8777-777777777722')
$$, 'assigned custodian can settle the shift');
reset role;
select is((select status from public.treasury_shifts
            where treasury_id='a7777777-7777-4777-8777-777777777722'),'settled',
  'settled shift is settled');
select is((select current_balance from public.treasury
            where id='a7777777-7777-4777-8777-777777777722'),0::numeric,
  'settlement leaves the drawer at zero');
select pg_temp.act('f7777777-7777-4777-8777-777777777772','e7777777-7777-4777-8777-777777777772');
select lives_ok($$
  select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777722',0)
$$, 'assigned custodian can reopen after settlement');
select lives_ok($$
  select public.fn_treasury_shift_close_and_settle(
    'a7777777-7777-4777-8777-777777777722',0,null,null,
    '77777777-7777-4777-8777-777777777799'::uuid)
$$, 'assigned custodian can close-and-settle');
reset role;
select is((select status from public.treasury_shifts
            where treasury_id='a7777777-7777-4777-8777-777777777722'
            order by opened_at desc limit 1),'settled',
  'close-and-settle leaves the latest shift settled');

-- 21-23: administrator who is the assigned custodian is allowed.
select pg_temp.act('f7777777-7777-4777-8777-777777777773','e7777777-7777-4777-8777-777777777773');
select is((select custodian_user_id from public.treasury
            where id='a7777777-7777-4777-8777-777777777723'),
  'f7777777-7777-4777-8777-777777777773'::uuid,
  'administrator is the custodian of drawer 723');
select lives_ok($$
  select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777723',0)
$$, 'administrator who is the custodian can open');
reset role;
select is((select custodian_user_id from public.treasury_shifts
            where treasury_id='a7777777-7777-4777-8777-777777777723'),
  'f7777777-7777-4777-8777-777777777773'::uuid,
  'administrator-custodian shift has the correct custodian');

-- 24-26: non-drawer treasuries have no custodian and cannot be opened.
select pg_temp.act('f7777777-7777-4777-8777-777777777771','e7777777-7777-4777-8777-777777777771');
select throws_ok($$
  select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777772',0)
$$, '42501', null, 'a bank treasury cannot be opened as a drawer');
select throws_ok($$
  select public.fn_treasury_shift_open('a7777777-7777-4777-8777-777777777771',0)
$$, '42501', null, 'a parent treasury cannot be opened as a drawer');
reset role;
select is((select count(*) from public.treasury_shifts
            where treasury_id in ('a7777777-7777-4777-8777-777777777771',
                                  'a7777777-7777-4777-8777-777777777772')),0::bigint,
  'rejected non-drawers write no shift');

select * from finish();
rollback;
