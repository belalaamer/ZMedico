-- Structural contract for write/delete and private Realtime hardening.
-- This test is not applied to Production and does not create business rows.
begin;
select plan(17);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'prevent_cross_tenant_branch_reassignment'
      and pg_get_function_identity_arguments(p.oid) = ''
      and p.prosecdef
      and pg_get_functiondef(p.oid) like '%search_path%public%'
  ),
  'branch reassignment guard is SECURITY DEFINER with a fixed search_path'
);

select is(
  (select count(*) from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and not t.tgisinternal
     and t.tgname = 'trg_prevent_cross_tenant_branch_reassignment'
     and c.relname = any (array[
       'appointments','patients','invoices','payments','expenses','treasury',
       'treasury_daily_closes','medical_records','physio_cases','treatment_plans',
       'patient_wallet_transactions','doctor_commissions','inventory',
       'inventory_transactions','stock_alerts','queue_alerts','reminders',
       'attendance','payroll','work_schedules','staff_targets','staff_profiles',
       'staff_branches'
     ]::name[])),
  23::bigint,
  'all direct branch-scoped tables have the reassignment guard trigger'
);

select ok(
  not has_function_privilege('anon', 'public.prevent_cross_tenant_branch_reassignment()', 'EXECUTE'),
  'anon cannot execute the trigger helper directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.prevent_cross_tenant_branch_reassignment()', 'EXECUTE'),
  'authenticated cannot execute the trigger helper directly'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'can_access_realtime_topic'
      and pg_get_function_identity_arguments(p.oid) = '_topic text'
      and p.prosecdef
      and pg_get_functiondef(p.oid) like '%search_path%public%'
  ),
  'Realtime topic guard is SECURITY DEFINER with a fixed search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.can_access_realtime_topic(text)', 'EXECUTE'),
  'authenticated can use the Realtime topic guard'
);
select ok(
  not has_function_privilege('anon', 'public.can_access_realtime_topic(text)', 'EXECUTE'),
  'anon cannot use the Realtime topic guard'
);

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='realtime' and c.relname='messages'),
  'realtime.messages has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'realtime.messages', 'SELECT'),
  'anon has no direct SELECT grant on realtime.messages'
);
select ok(
  not has_table_privilege('anon', 'realtime.messages', 'INSERT'),
  'anon has no direct INSERT grant on realtime.messages'
);
select ok(
  has_table_privilege('authenticated', 'realtime.messages', 'SELECT')
    and has_table_privilege('authenticated', 'realtime.messages', 'INSERT')
    and not has_table_privilege('authenticated', 'realtime.messages', 'UPDATE'),
  'authenticated has only the Realtime privileges required by the client contract'
);
select ok(
  exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='zmedico_private_topic_read' and cmd='SELECT' and roles @> array['authenticated']::name[]),
  'private Realtime read policy exists for authenticated users'
);
select ok(
  exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='zmedico_private_topic_send' and cmd='INSERT' and roles @> array['authenticated']::name[]),
  'private Realtime send policy exists for authenticated users'
);
select ok(
  exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='zmedico_private_topic_read' and qual::text like '%can_access_realtime_topic%')
    and exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='zmedico_private_topic_send' and with_check::text like '%can_access_realtime_topic%'),
  'private Realtime policies delegate access to the topic guard'
);

select is(
  (select count(*) from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in (
       'enforce_doctor_service_eligibility','ensure_appointment_reminders',
       'set_doctor_service_assignment_tenant','set_patient_portal_settings_tenant',
       'sync_patient_portal_branch_enabled','tg_public_booking_request_defaults',
       'trg_invoice_enqueue_communication','trg_payment_enqueue_communication'
     )
     and NOT has_function_privilege('anon', p.oid, 'EXECUTE')),
  8::bigint,
  'internal trigger and setter functions are not executable by anon'
);
select is(
  (select count(*) from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in (
       'enforce_doctor_service_eligibility','ensure_appointment_reminders',
       'set_doctor_service_assignment_tenant','set_patient_portal_settings_tenant',
       'sync_patient_portal_branch_enabled','tg_public_booking_request_defaults',
       'trg_invoice_enqueue_communication','trg_payment_enqueue_communication'
     )
     and NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  8::bigint,
  'internal trigger and setter functions are not executable by authenticated'
);

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='safe_notification_settings'
      and c.reloptions @> array['security_invoker=true']
  ),
  'safe notification settings view uses security_invoker'
);

select * from finish();
rollback;
