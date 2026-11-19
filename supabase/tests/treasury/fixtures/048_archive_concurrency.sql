-- Committed fixture for 048_archive_concurrency.test.sql.
-- Run only against a disposable local replay. It is intentionally separate from
-- the pgTAP transaction because dblink sessions must see the fixture rows.
create extension if not exists dblink;

insert into public.tenants(id,name,slug,subscription_status,subscription_ends_at)
values ('77777777-7777-4777-8777-777777777777','Archive Concurrency Tenant','archive-concurrency','active',now()+interval '1 year')
on conflict (id) do nothing;
insert into public.allowed_signup_emails(email,role,full_name) values
  ('conc-admin@example.test','admin','Concurrency Admin')
on conflict (email) do nothing;
insert into auth.users(id,email,is_anonymous,deleted_at) values
  ('f7777777-7777-4777-8777-777777777771','conc-admin@example.test',false,null)
on conflict (id) do nothing;
insert into auth.sessions(id,user_id,not_after) values
  ('e7777777-7777-4777-8777-777777777771','f7777777-7777-4777-8777-777777777771',now()+interval '1 day')
on conflict (id) do nothing;
insert into public.branches(id,name_en,name_ar,tenant_id) values
  ('b7777777-7777-4777-8777-777777777771','Concurrency Branch','فرع التزامن','77777777-7777-4777-8777-777777777777')
on conflict (id) do nothing;
insert into public.staff_profiles(id,linked_user_id,branch_id,employee_id,status) values
  ('f7777777-7777-4777-8777-777777777771','f7777777-7777-4777-8777-777777777771','b7777777-7777-4777-8777-777777777771','CC-001','active')
on conflict (id) do nothing;
insert into public.staff_branches(user_id,branch_id) values
  ('f7777777-7777-4777-8777-777777777771','b7777777-7777-4777-8777-777777777771')
on conflict do nothing;
insert into public.user_roles(user_id,role) values
  ('f7777777-7777-4777-8777-777777777771','admin')
on conflict do nothing;
insert into public.financial_cycles(id,branch_id,name_en,name_ar,start_date,end_date) values
  ('c7777777-7777-4777-8777-777777777771','b7777777-7777-4777-8777-777777777771','Concurrency Cycle','دورة التزامن',date '2026-05-01',date '2026-11-30')
on conflict (id) do nothing;
insert into public.treasury(id,branch_id,name_en,name_ar,current_balance,non_cash_balance,currency,account_kind,custodian_user_id,parent_treasury_id,is_active,financial_cycle_id,is_default) values
  ('a7777777-7777-4777-8777-777777777780','b7777777-7777-4777-8777-777777777771','Conc Parent','أصل التزامن',0,0,'EGP','cash',null,null,true,'c7777777-7777-4777-8777-777777777771',false),
  ('a7777777-7777-4777-8777-777777777781','b7777777-7777-4777-8777-777777777771','Conc Archive One','أرشيف واحد',0,0,'EGP','bank',null,null,true,'c7777777-7777-4777-8777-777777777771',false),
  ('a7777777-7777-4777-8777-777777777782','b7777777-7777-4777-8777-777777777771','Conc Drawer','درج التزامن',0,0,'EGP','cash','f7777777-7777-4777-8777-777777777771','a7777777-7777-4777-8777-777777777780',true,'c7777777-7777-4777-8777-777777777771',false),
  ('a7777777-7777-4777-8777-777777777783','b7777777-7777-4777-8777-777777777771','Conc Archive Two','أرشيف اثنان',0,0,'EGP','bank',null,null,true,'c7777777-7777-4777-8777-777777777771',false)
on conflict (id) do nothing;
