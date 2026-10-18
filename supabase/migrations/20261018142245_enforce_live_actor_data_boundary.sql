-- ZMED-271. Sensitive individual review required; never bulk migration replay.
-- Live actor denial supplements existing authorization; it grants no data access.
set local lock_timeout='2s';
set local statement_timeout='30s';
do $preflight$ begin
 if md5(pg_get_functiondef('zmedico_security.session_is_active()'::regprocedure))<>'4a77243167edf154de0192c7105f8bde' then
  raise exception 'Reviewed live-session baseline required' using errcode='55000';
 end if;
 if to_regprocedure('public.enforce_live_data_api_actor()') is not null then
  raise exception 'Live request guard already exists; reconcile release' using errcode='55000';
 end if;
 if exists(select 1 from pg_roles r cross join lateral unnest(coalesce(r.rolconfig,array[]::text[])) c where c like 'pgrst.db_pre_request=%')
 or exists(select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) c where c like 'pgrst.db_pre_request=%') then
  raise exception 'Existing pre-request configuration requires explicit integration' using errcode='55000';
 end if;
 -- Managed internal Storage tables currently have no policies, so RLS denies
 -- authenticated rows by default. Do not alter their provider-owned schemas.
 if exists(select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname<>'objects') then
  raise exception 'Additional Storage authorization surface requires review' using errcode='55000';
 end if;
end $preflight$;

create or replace function zmedico_security.session_is_active()
returns boolean language sql stable security definer set search_path = ''
as $guard$
  with claims as (select auth.jwt() as jwt)
  select case
    when current_setting('role', true) = 'authenticated'
      and jwt->>'role' = 'authenticated'
      and jwt->>'iss' = 'https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1'
      and jwt->>'sub' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jwt->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jwt->>'exp' ~ '^[0-9]{1,11}$'
    then (case when jwt->>'exp' ~ '^[0-9]{1,11}$'
      then (jwt->>'exp')::bigint else 0 end) > extract(epoch from statement_timestamp())
      and exists (
        select 1 from auth.users u
        join auth.sessions s on s.user_id = u.id
        -- Each cast has its own guard: the planner can evaluate a subquery
        -- before its enclosing CASE, so outer validation alone is not enough.
        where u.id = case when jwt->>'sub' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then auth.uid() else null end
          and s.id = case when jwt->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (jwt->>'session_id')::uuid else null end
          and u.deleted_at is null
          and not coalesce(u.is_anonymous, false)
          and (u.banned_until is null or u.banned_until <= statement_timestamp())
          and (s.not_after is null or s.not_after > statement_timestamp())
          and not exists (select 1 from public.staff_profiles sp
            where (sp.linked_user_id=u.id or
              (sp.linked_user_id is null and sp.id=u.id and not exists
                (select 1 from public.staff_profiles explicit_link where explicit_link.linked_user_id=u.id)))
              and sp.status in ('suspended'::public.staff_status,'terminated'::public.staff_status))
      )
    else false
  end from claims;
$guard$;

-- PostgREST hook covers privileged RPC/view paths as well as direct table reads.
-- Anonymous public flows and backend roles retain their existing authorization.
create function public.enforce_live_data_api_actor() returns void
language plpgsql security invoker set search_path='' as $function$
begin
 if current_user='authenticated' then perform public.assert_active_session();end if;
end $function$;
revoke all on function public.enforce_live_data_api_actor() from public,anon,authenticated,service_role;
grant execute on function public.enforce_live_data_api_actor() to anon,authenticated,service_role;

-- Restrictive RLS also covers non-PostgREST products. Existing permissive
-- policies are still required; this policy cannot grant access on its own.
create policy zmedico_live_actor_boundary on "public"."ai_config_audit_log"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."ai_provider_config"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."ai_tenant_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."ai_tool_audit_log"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."allowed_signup_emails"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."appointment_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."appointments"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."attendance"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."audit_export_presets"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."audit_logs"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_bundle_implies"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_bundle_permissions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_bundles"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_permissions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_role_bundles"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_shadow_decisions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_shadow_expected_expansions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_shadow_slice_gate"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."authz_versions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."booking_resource_services"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."booking_resources"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."branches"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."channel_accounts"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."client_errors"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."clinic_profile"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."clinic_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."communication_templates"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."conversations"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."coupon_redemptions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."coupons"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."custom_domain_rate_limits"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."dental_chart"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."departments"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."diagnoses"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."doctor_commissions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."doctor_service_assignments"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."email_templates"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."employee_id_counter"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."expense_categories"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."expenses"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."insurance_companies"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."insurance_contract_rules"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."insurance_contracts"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."inventory"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."inventory_transactions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."invoice_counters"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."invoice_items"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."invoice_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."invoices"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."lead_activities"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."lead_assignments"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."lead_campaign_spend"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."lead_followups"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."lead_lost_reasons"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."lead_pipeline_stages"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."leads"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."leave_requests"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."leave_types"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."login_rate_limits"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."loyalty_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."medical_history"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."medical_records"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."medical_specialties"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."medications"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."messages"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."meta_ads_connections"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."meta_ads_sync_runs"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."notification_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."notifications"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."patient_documents"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."patient_portal_accounts"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."patient_portal_delivery_events"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."patient_portal_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."patient_wallet_transactions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."patient_wallets"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."patients"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."payment_methods"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."payments"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."payroll"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."performance_reviews"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."phi_access_log"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."physio_cases"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."physio_reassessments"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."physio_sessions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."platform_change_log"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."po_counters"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."prescription_items"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."prescriptions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."procedures"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."product_categories"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."product_sku_counter"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."products"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."profiles"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."public_booking_rate_limits"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."purchase_order_items"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."purchase_orders"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."queue_alert_runs"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."queue_alerts"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."queue_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."record_diagnoses"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."record_procedures"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."reminders"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."report_schedules"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."report_templates"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."role_permissions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."saas_invoice_counters"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."saas_invoices"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."saas_payments"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."salary_adjustments"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."saved_reports"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."self_checkin_tokens"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."service_categories"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."service_consumables"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."services"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."sms_templates"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."staff_branches"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."staff_positions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."staff_profiles"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."staff_targets"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."stock_alerts"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."subscription_addons"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."subscription_change_log"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."subscription_plan_change_log"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."subscription_plans"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."subscription_request_rate_limits"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."subscription_requests"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."subscriptions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."suppliers"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."system_backups"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."system_languages"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."tenant_addons"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."tenant_branding"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."tenant_domains"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."tenant_module_settings"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."tenant_usage"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."tenants"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."treasury"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."treasury_daily_closes"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."treasury_transactions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."treatment_plans"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."treatment_sessions"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."user_activity_logs"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."user_roles"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."vital_signs"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."whatsapp_templates"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "public"."work_schedules"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "realtime"."messages"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));
create policy zmedico_live_actor_boundary on "storage"."objects"
 as restrictive for all to authenticated
 using ((select zmedico_security.session_is_active()))
 with check ((select zmedico_security.session_is_active()));

alter role authenticator set pgrst.db_pre_request='public.enforce_live_data_api_actor';
notify pgrst,'reload schema';
notify pgrst,'reload config';
