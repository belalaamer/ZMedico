-- (ب) Permanent Delete of a Workspace: an assessment engine plus a delete that only does
-- what the assessment proved safe.
--
-- The engineering findings this is built on were measured on live Production
-- `rqcmnfzfytyyicelvifk` on 2026-11-06, read-only, not assumed:
--
--   * 147 tables live in `public`. 88 foreign keys from 81 of them point straight at
--     `tenants.id` or `branches.id`, and 107 of the 147 are reachable from `tenants` through
--     FK paths at all. ON DELETE behaviour is mixed across those edges: CASCADE (treasury →
--     treasury_transactions, subscriptions, tenant_branding, queue_alerts), RESTRICT/NO ACTION
--     (ai_tool_audit_log → tenants), and SET NULL (notifications.branch_id, invoices, patients,
--     profiles.default_branch_id, reminders.invoice_id). A SET NULL edge does not fail — it
--     silently re-parents clinical and money rows onto a NULL branch, which no report, RLS
--     policy or archive can attribute afterwards. So the erase order has to be computed, never
--     hand-listed: this function walks the constraint catalog.
--   * 17 tables carry a DELETE trigger and 7 of them refuse the delete outright: `audit_logs`
--     (_audit_logs_append_only), `client_errors` (_tg_client_errors_append_only),
--     `platform_change_log` (_platform_change_log_append_only), `authz_versions`
--     (authz_versions_block_delete, platform-global so it is never in scope), and
--     `treasury_transactions` / `treasury_shifts` / `treasury_daily_closes` — "a till handover
--     is never erased". Three of those seven are reached only through `branches → treasury`,
--     two levels down, which is why a one-level enumeration is not enough: `treasury` is ON
--     DELETE CASCADE from `branches`, so deleting a branch that ever took a payment does not
--     merely fail — the cascade *is* the attempted deletion of append-only history. Every
--     branch also gets a 'Clinic Safe' `treasury` row created by trg_branch_ai, so `treasury`
--     is never empty for a workspace that has a branch, and the descent into the treasury
--     trail is what decides whether that workspace can be deleted at all.
--   * `platform_change_log.tenant_id` is ON DELETE CASCADE from `tenants` *and* append-only,
--     so the delete of a workspace would erase the record of that workspace's own
--     administration — and refuse to do it. 4 of the 4 real workspaces measured have rows
--     there (27 / 3 / 2 / 2). The event therefore cannot live in that table: the receipt is
--     relocated to a new ledger, and the CASCADE is stopped by deleting those rows first,
--     deliberately, inside the same transaction, with only that one trigger stepped around.
--   * `tg_guard_last_tenant_branch` (BEFORE DELETE on `branches`) already refuses to delete a
--     tenant's last branch, and already discovers every FK to `branches.id` from the catalog
--     to "fail closed before either" (its own words) rather than trusting CASCADE/SET NULL.
--     `tg_branches_cleanup_orphans` (same event) deletes `pending` reminders and resolves
--     active `queue_alerts` for the branch being deleted — writes no assessment measured, so
--     those two tables are ordered strictly before `branches` (see the rank refinement).
--   * `branches` carries a third BEFORE DELETE guard, `branches_guard_last_active_tenant_branch`,
--     which refuses to remove a tenant's last *active* branch. It is deliberately left enabled,
--     because the archive gate makes it inert: the guard reads `tenants.is_active` first and
--     returns OLD untouched for an inactive tenant, and `is_archived` is only ever true when the
--     console archive has already set the tenant inactive (and deactivated its branches) or the
--     tenant was inactive to begin with. 2 of the 4 live workspaces measured (`amr`, `hady`)
--     already have their single branch inactive. An availability guard for a clinic being
--     erased is not a reason to refuse; a missing active branch for a running one is, and that
--     case cannot reach this function.
--   * Five scope columns have no foreign key at all: `audit_logs.branch_id`,
--     `client_errors.branch_id`, `phi_access_log.branch_id`, `reminders.branch_id`,
--     `ai_config_audit_log.tenant_id`. They are trails, not state: nothing can delete them, so
--     the honest verdict discloses them as survivors rather than pretending they went away.
--
-- So a "documented sanitization path" for a workspace with real books is not a feature that
-- can be written safely: it would have to un-hook immutability triggers and re-parent clinical
-- rows, which is the exact thing those guards exist to prevent. What can be built — and what
-- this file builds — is the other half of the choice the owner asked for:
--
--   Permanent Delete is available for an archived workspace that is structurally empty: no
--   patients, no money, no clinical records, no staff, no messaging, no ad or provider state.
--   Anything that has ever been used gets a named, per-table reason and the advice to archive
--   instead.
--
-- Four properties the implementation is held to:
--
--   1. Fail closed. Tables are not enumerated as blockers — anything that is not explicitly
--      classified as erasable configuration, or as an immutable trail that is disclosed and
--      left behind, is a blocker by default. A table added by a future migration is protected
--      until a human decides otherwise, which is the same posture as the branch guard.
--   2. Scope by constraint, not by column name. Predicates come from pg_constraint
--      (conkey/confkey paired by ordinality), so `profiles.default_branch_id` and
--      `patient_portal_settings`'s two scope columns are found without anyone remembering
--      them, and so is any FK whose parent key is not called `id`.
--   3. Descend only where the delete actually reaches. A level walks FK edges out of the
--     tables the previous level proved non-empty *and* classified as erasable; a table
--      measured at zero rows is pruned (FK integrity means its own children cannot hold rows
--      scoped through it), and a blocker or a survivor ends that path because the delete stops
--      there. Every table that ends up in the erase plan is counted with the full predicate
--      built from every path that reaches it, re-counted if a deeper path is found later.
--   4. Nothing is deleted that the assessment did not measure. The same function produces the
--      verdict and the erase plan; the plan carries its own predicate and bind, the delete
--      executes exactly that text and compares ROW_COUNT to the measured rows, and then calls
--      the assessment again at the end of the same transaction. A concurrent insert, a
--      cascade nobody predicted, or a trigger that wrote something else rolls the whole thing
--      back.
--
-- Status: NOT APPLIED. Proved against live Production inside BEGIN; <these exact bytes>;
-- <receipts>; ROLLBACK; with a synthetic workspace — no COMMIT of any production data before
-- the owner approves.

-- 1. The deletion ledger. Deliberately has no foreign key to `tenants`: the row it describes
--    is being removed, and `platform_change_log.tenant_id` is ON DELETE CASCADE, which is why
--    an account-deletion event cannot live there — it would be erased by the delete it
--    records. The ledger is also append-only for the same reason audit_logs is.
create table if not exists public.platform_workspace_deletions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  slug text not null,
  name text,
  name_en text,
  name_ar text,
  plan_id uuid,
  archived_at timestamptz,
  branch_ids uuid[] not null default '{}'::uuid[],
  erased jsonb not null default '[]'::jsonb,
  survivors jsonb not null default '[]'::jsonb,
  change_log jsonb not null default '[]'::jsonb,
  assessment jsonb,
  reason text,
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);

comment on table public.platform_workspace_deletions is
  'Immutable receipt of every permanent workspace deletion: who, when, why, which branches, how many rows left each table, and a copy of the platform change-log rows the CASCADE would otherwise erase.';
comment on column public.platform_workspace_deletions.survivors is
  'Rows in append-only trails (audit_logs, phi_access_log, client_errors, ai_config_audit_log) that keep pointing at the deleted tenant id. They cannot be deleted by anyone, so the honest record is that they remain; rows_before and rows_after are both measured.';

alter table public.platform_workspace_deletions enable row level security;
revoke all on table public.platform_workspace_deletions from anon, authenticated;
grant select on table public.platform_workspace_deletions to authenticated;
create policy platform_workspace_deletions_owner_read
  on public.platform_workspace_deletions for select to authenticated
  using (public.has_role(auth.uid(), 'system_owner'::public.app_role));

create index if not exists platform_workspace_deletions_tenant_idx
  on public.platform_workspace_deletions (tenant_id);
create index if not exists platform_workspace_deletions_slug_idx
  on public.platform_workspace_deletions (slug);

create or replace function public._platform_workspace_deletions_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'platform_workspace_deletions is append-only (op=%)', TG_OP
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function public._platform_workspace_deletions_append_only() from public, anon, authenticated;

drop trigger if exists platform_workspace_deletions_no_delete on public.platform_workspace_deletions;
create trigger platform_workspace_deletions_no_delete
  before delete on public.platform_workspace_deletions
  for each row execute function public._platform_workspace_deletions_append_only();

drop trigger if exists platform_workspace_deletions_no_update on public.platform_workspace_deletions;
create trigger platform_workspace_deletions_no_update
  before update on public.platform_workspace_deletions
  for each row execute function public._platform_workspace_deletions_append_only();

-- 2. The assessment engine, shared by the dialog and the delete.
--    Walks the foreign-key closure outward from tenants.id / branches.id, builds one scoped
--    predicate per reachable table, classifies it, and returns the verdict plus the erase plan.
create or replace function public.platform_workspace_delete_assess(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant record;
  v_branch_ids uuid[];

  -- Configuration and bookkeeping a structurally empty workspace is allowed to own. Anything
  -- not listed here and not listed as a survivor is a blocker: a future table is protected
  -- until a human moves it into one of the two lists.
  v_erase text[] := array[
    'branches', 'platform_change_log', 'subscription_change_log', 'subscription_requests',
    'subscriptions', 'tenant_addons', 'tenant_branding', 'tenant_module_settings', 'tenant_usage',
    'clinic_profile', 'clinic_settings', 'appointment_settings', 'notification_settings',
    'queue_settings', 'invoice_settings', 'invoice_counters', 'payment_methods',
    'expense_categories', 'coupons', 'stock_alerts', 'communication_templates', 'email_templates',
    'sms_templates', 'whatsapp_templates', 'allowed_signup_emails', 'doctor_service_assignments',
    'service_consumables', 'booking_resource_services', 'booking_resources', 'staff_branches',
    'staff_targets', 'work_schedules', 'staff_positions', 'departments', 'lead_pipeline_stages',
    'lead_lost_reasons', 'loyalty_settings', 'ai_tenant_settings', 'ai_provider_config',
    'tenant_domains', 'reminders', 'treasury', 'custom_domain_rate_limits', 'login_rate_limits',
    'public_booking_rate_limits', 'subscription_request_rate_limits'
  ];
  -- Trails that cannot be erased by anyone (four of them are enforced by trigger; the fifth,
  -- phi_access_log, is a PHI access record we do not delete either). Disclosed, not deleted.
  v_survive text[] := array['audit_logs', 'phi_access_log', 'client_errors', 'ai_config_audit_log'];

  v_pred jsonb := '{}'::jsonb;
  v_dep jsonb := '{}'::jsonb;
  v_bind jsonb := '{}'::jsonb;
  v_seen jsonb := '{}'::jsonb;
  v_pairs jsonb := '[]'::jsonb;
  v_erase_map jsonb := '{}'::jsonb;
  v_block_map jsonb := '{}'::jsonb;
  v_surv_map jsonb := '{}'::jsonb;

  v_frontier text[] := '{}';
  v_walked text[] := '{}';
  v_next text[] := '{}';
  v_dirty text[] := '{}';

  v_row record;
  v_edge record;
  v_rel text;
  v_parent text;
  v_child text;
  v_key text;
  v_corr text;
  v_path text;
  v_seq int := 0;
  v_level int := 0;
  v_edges int := 0;
  v_pass int := 0;
  v_changed boolean;
  v_ok boolean;
  v_err text;
  v_rows bigint;
  v_sub bigint;
  v_verdict text;
  v_blockers jsonb;
  v_erased jsonb;
  v_survivors jsonb;
begin
  if not public.has_role(auth.uid(), 'system_owner'::public.app_role) then
    raise exception 'System Owner role required' using errcode = '42501';
  end if;

  select t.id, t.slug, t.name, t.name_en, t.name_ar, t.plan_id, t.is_active,
         t.subscription_status::text as subscription_status, t.is_archived, t.archived_at
    into v_tenant
    from public.tenants t
   where t.id = p_tenant_id;
  if not found then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(b.id), '{}'::uuid[]) into v_branch_ids
    from public.branches b
   where b.tenant_id = p_tenant_id;

  -- Level 0. Every predicate is written against a per-table alias ("_sN"), assigned once per
  -- table, so a predicate nested three exists()s deep still binds its own row and nothing a
  -- grandparent introduced.
  v_seq := 1;
  v_bind := jsonb_build_object('tenants', 1);
  v_dep := jsonb_build_object('tenants', 0);
  v_pred := jsonb_build_object('tenants', '"_s1"."id" = $1');
  v_frontier := array['tenants'];

  while v_frontier <> '{}'::text[] and v_level < 12 loop
    v_level := v_level + 1;
    v_next := '{}';
    v_dirty := '{}';
    v_walked := v_walked || v_frontier;

    for v_row in
      with fkless as (
        -- Scope columns that carry no foreign key. They are exactly the tables a CASCADE would
        -- silently leave dangling, so they are walked as virtual edges of the right parent.
        select c.relname::text as rel, a.attname::text as col
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relkind = 'r'
           and a.attnum > 0
           and not a.attisdropped
           and a.atttypid = 'uuid'::regtype
           and a.attname in ('tenant_id', 'branch_id')
           and c.relname not in ('tenants', 'branches', 'platform_workspace_deletions')
           and not exists (
             select 1 from pg_constraint u
              where u.conrelid = c.oid
                and u.contype = 'f'
                and u.confrelid in ('public.tenants'::regclass, 'public.branches'::regclass)
                and a.attnum = any (u.conkey))
      )
      select f.relname::text as parent, c.relname::text as child, con.conname as con,
             p.pcols, x.ccols
        from pg_constraint con
        join pg_class f on f.oid = con.confrelid
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral (
          select array_agg(quote_ident(a.attname) order by o.ord) as pcols
            from unnest(con.confkey::int[]) with ordinality o(attnum, ord)
            join pg_attribute a on a.attrelid = con.confrelid and a.attnum = o.attnum) p
        cross join lateral (
          select array_agg(quote_ident(a.attname) order by o.ord) as ccols
            from unnest(con.conkey::int[]) with ordinality o(attnum, ord)
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = o.attnum) x
       where con.contype = 'f'
         and n.nspname = 'public'
         and c.relkind = 'r'
         and f.relname::text = any (v_frontier)
         and c.oid <> con.confrelid
         and c.relname::text not in ('platform_workspace_deletions', 'tenants')
      union all
      -- A virtual edge fires only at the level where its parent is on the frontier: its
      -- predicate is written in terms of the parent's predicate, which does not exist before
      -- the parent itself has been reached and measured.
      select 'branches', s.rel, 'no-fk-' || s.col, array['"id"']::text[], array[quote_ident(s.col)]::text[]
        from fkless s where s.col = 'branch_id' and 'branches' = any (v_frontier)
      union all
      select 'tenants', s.rel, 'no-fk-' || s.col, array['"id"']::text[], array[quote_ident(s.col)]::text[]
        from fkless s where s.col = 'tenant_id' and 'tenants' = any (v_frontier)
       order by 1, 2, 3
    loop
      v_key := v_row.parent || '>' || v_row.child || '#' || v_row.con;
      if v_seen -> v_key is not null then
        continue;
      end if;
      v_seen := v_seen || jsonb_build_object(v_key, true);
      v_edges := v_edges + 1;

      if v_bind -> v_row.child is null then
        v_seq := v_seq + 1;
        v_bind := v_bind || jsonb_build_object(v_row.child, v_seq);
        v_dep := v_dep || jsonb_build_object(v_row.child, (v_dep ->> v_row.parent)::int + 1);
      elsif (v_dep ->> v_row.parent)::int + 1 > (v_dep ->> v_row.child)::int then
        v_dep := v_dep || jsonb_build_object(v_row.child, (v_dep ->> v_row.parent)::int + 1);
      end if;

      select string_agg('"_s' || (v_bind ->> v_row.parent) || '".' || u.p ||
                         ' = "_s' || (v_bind ->> v_row.child) || '".' || u.c, ' and ')
        into v_corr
        from unnest(v_row.pcols, v_row.ccols) as u(p, c);

      v_path := 'exists (select 1 from public.' || quote_ident(v_row.parent) ||
                ' "_s' || (v_bind ->> v_row.parent) || '" where (' || (v_pred ->> v_row.parent) ||
                ') and ' || v_corr || ')';

      -- A path needs a predicate for its parent. If the parent has none, this edge is not the
      -- table's scope and must not become one (a NULL here would poison the entry for good,
      -- because the edge is never revisited).
      if v_path is null then
        continue;
      end if;

      if v_pred ->> v_row.child is null then
        v_pred := v_pred || jsonb_build_object(v_row.child, v_path);
      else
        v_pred := jsonb_set(v_pred, array[v_row.child],
                            to_jsonb((v_pred ->> v_row.child) || ' or ' || v_path));
      end if;

      v_pairs := v_pairs || jsonb_build_object('p', v_row.parent, 'c', v_row.child);
      if not (v_row.child = any (v_dirty)) then
        v_dirty := v_dirty || array[v_row.child];
      end if;
    end loop;

    -- Classify everything this level newly reached. A table reached again at a deeper level is
    -- re-counted with the wider predicate and its entry is replaced, never duplicated.
    for v_rel in select x from unnest(v_dirty) as x order by 1 loop
      if v_pred ->> v_rel is null then
        v_block_map := v_block_map || jsonb_build_object(v_rel, jsonb_build_object(
          'table', v_rel, 'rows', null, 'code', 'SCOPE_UNMEASURABLE',
          'reason', 'No foreign-key path from this workspace could be built for the table, so its rows were never counted. Nothing that was not counted is deleted.',
          'action', 'archive'));
        continue;
      end if;

      if char_length(v_pred ->> v_rel) > 9000 then
        v_block_map := v_block_map || jsonb_build_object(v_rel, jsonb_build_object(
          'table', v_rel, 'rows', null, 'code', 'SCOPE_TOO_BROAD',
          'reason', 'This table reaches the workspace through so many foreign-key paths that the assessment will not name its scope. Nothing was measured, so nothing is deleted.',
          'action', 'archive'));
        continue;
      end if;

      v_ok := true;
      begin
        execute 'select count(*) from public.' || quote_ident(v_rel) ||
                ' "_s' || (v_bind ->> v_rel) || '" where (' || (v_pred ->> v_rel) || ')'
          into v_rows
          using p_tenant_id;
      exception when others then
        v_ok := false;
        v_err := left(sqlerrm, 200);
      end;
      if not v_ok then
        v_block_map := v_block_map || jsonb_build_object(v_rel, jsonb_build_object(
          'table', v_rel, 'rows', null, 'code', 'SCOPE_UNMEASURABLE',
          'reason', 'The workspace scope could not be measured in this table (' || v_err || ').',
          'action', 'archive'));
        continue;
      end if;

      -- Empty means both "nothing to erase here" and "nothing scoped through here below", so
      -- the walk stops at this table: FK integrity guarantees its children hold no rows that
      -- reach the workspace through it.
      if v_rows = 0 then
        continue;
      end if;

      -- Three tables are classified per row, not per table, because the dangerous rows and the
      -- harmless ones live in the same relation.
      if v_rel = 'tenant_domains' then
        begin
          execute 'select count(*) from public."tenant_domains" "_s' || (v_bind ->> v_rel) ||
                  '" where (' || (v_pred ->> v_rel) || ') and "cloudflare_hostname_id" is not null'
            into v_sub using p_tenant_id;
        exception when others then
          v_sub := v_rows;
        end;
        if v_sub > 0 then
          v_block_map := v_block_map || jsonb_build_object(v_rel, jsonb_build_object(
            'table', v_rel, 'rows', v_sub, 'code', 'PROVIDER_HOSTNAME_ATTACHED',
            'reason', 'A custom domain still has a provider hostname attached. Delete it from the Domains panel first, so the hostname is removed at the provider too.',
            'action', 'domains'));
          continue;
        end if;
      elsif v_rel = 'reminders' then
        begin
          execute 'select count(*) from public."reminders" "_s' || (v_bind ->> v_rel) ||
                  '" where (' || (v_pred ->> v_rel) || ') and "status" <> ''pending'''
            into v_sub using p_tenant_id;
        exception when others then
          v_sub := v_rows;
        end;
        if v_sub > 0 then
          v_block_map := v_block_map || jsonb_build_object(v_rel, jsonb_build_object(
            'table', v_rel, 'rows', v_sub, 'code', 'COMMUNICATION_HISTORY',
            'reason', 'Reminders were already sent to patients. That is communication history, not a queue.',
            'action', 'archive'));
          continue;
        end if;
      elsif v_rel = 'treasury' then
        begin
          execute 'select count(*) from public."treasury" "_s' || (v_bind ->> v_rel) ||
                  '" where (' || (v_pred ->> v_rel) ||
                  ') and ("current_balance" <> 0 or "non_cash_balance" <> 0)'
            into v_sub using p_tenant_id;
        exception when others then
          v_sub := v_rows;
        end;
        if v_sub > 0 then
          v_block_map := v_block_map || jsonb_build_object(v_rel, jsonb_build_object(
            'table', v_rel, 'rows', v_sub, 'code', 'TREASURY_BALANCE_OPEN',
            'reason', 'A till still holds a balance. Close it and move the money before deleting.',
            'action', 'archive'));
          continue;
        end if;
      end if;

      if v_rel = any (v_survive) then
        v_surv_map := v_surv_map || jsonb_build_object(v_rel, jsonb_build_object(
          'table', v_rel, 'rows', v_rows, 'depth', (v_dep ->> v_rel)::int));
        continue;
      end if;

      if v_rel = any (v_erase) then
        v_erase_map := v_erase_map || jsonb_build_object(v_rel, jsonb_build_object(
          'k', v_rel, 'table', v_rel, 'rows', v_rows,
          'depth', (v_dep ->> v_rel)::int, 'rank', (v_dep ->> v_rel)::int,
          'bind', (v_bind ->> v_rel)::int, 'pred', v_pred ->> v_rel));
        if not (v_rel = any (v_next)) and not (v_rel = any (v_walked)) then
          v_next := v_next || array[v_rel];
        end if;
        continue;
      end if;

      -- Fail closed: clinical, financial, identity and provider state is everything else.
      v_block_map := v_block_map || jsonb_build_object(v_rel, jsonb_build_object(
        'table', v_rel, 'rows', v_rows, 'code', upper('DATA_' || v_rel),
        'depth', (v_dep ->> v_rel)::int,
        'reason', case v_rel
          when 'patients' then 'Patient records exist. Clinical data is never erased with a workspace.'
          when 'patient_documents' then 'Uploaded patient documents exist.'
          when 'patient_portal_accounts' then 'Patient portal logins exist.'
          when 'patient_portal_settings' then 'Patient portal configuration exists for real patients.'
          when 'invoices' then 'Invoices exist — the clinic has issued bills.'
          when 'invoice_items' then 'Invoice lines exist.'
          when 'payments' then 'Payments exist — money has been collected.'
          when 'medical_records' then 'Medical records exist.'
          when 'record_procedures' then 'Procedures were billed inside a medical record.'
          when 'record_diagnoses' then 'Diagnoses were recorded for patients.'
          when 'diagnoses' then 'Diagnosis catalog entries exist.'
          when 'medical_history' then 'Patient medical history exists.'
          when 'prescriptions' then 'Prescriptions exist.'
          when 'prescription_items' then 'Prescription lines exist.'
          when 'vital_signs' then 'Vital signs were recorded.'
          when 'dental_chart' then 'A dental chart exists.'
          when 'appointments' then 'Bookings exist.'
          when 'treatment_sessions' then 'Treatment sessions exist.'
          when 'treatment_plans' then 'Treatment plans exist.'
          when 'physio_cases' then 'Physio cases exist.'
          when 'physio_sessions' then 'Physio sessions exist.'
          when 'physio_reassessments' then 'Physio reassessments exist.'
          when 'attendance' then 'Attendance was recorded.'
          when 'staff_profiles' then 'Staff records exist. Remove the team from the clinic first.'
          when 'profiles' then 'A user account still defaults to a branch of this workspace.'
          when 'user_roles' then 'A user still holds a role inside this workspace.'
          when 'leave_requests' then 'Leave requests exist.'
          when 'leave_types' then 'Leave types are configured.'
          when 'performance_reviews' then 'Performance reviews exist.'
          when 'salary_adjustments' then 'Salary adjustments exist.'
          when 'payroll' then 'Payroll records exist.'
          when 'doctor_commissions' then 'Doctor commissions are calculated.'
          when 'treasury_transactions' then 'Treasury entries exist and are append-only by design.'
          when 'treasury_shifts' then 'Till shifts were opened or signed. A handover is never erased.'
          when 'treasury_daily_closes' then 'A daily close is recorded. Closes are immutable.'
          when 'expenses' then 'Expenses exist.'
          when 'inventory' then 'Stock levels exist.'
          when 'inventory_transactions' then 'Stock movements exist.'
          when 'purchase_orders' then 'Purchase orders exist.'
          when 'purchase_order_items' then 'Purchase order lines exist.'
          when 'suppliers' then 'Suppliers are registered.'
          when 'products' then 'The inventory catalog is not empty.'
          when 'product_categories' then 'Product categories exist.'
          when 'services' then 'Service catalog entries exist.'
          when 'service_categories' then 'Service categories exist.'
          when 'procedures' then 'Procedure catalog entries exist.'
          when 'medications' then 'Medication catalog entries exist.'
          when 'insurance_contracts' then 'Insurance contracts exist.'
          when 'insurance_companies' then 'Insurance companies are configured.'
          when 'insurance_contract_rules' then 'Insurance contract rules exist.'
          when 'loyalty_settings' then 'Loyalty settings exist for real patients.'
          when 'patient_wallets' then 'Patient wallets exist.'
          when 'patient_wallet_transactions' then 'Wallet movements exist.'
          when 'coupons' then 'Coupons are configured.'
          when 'coupon_redemptions' then 'A coupon has been redeemed.'
          when 'conversations' then 'Messaging conversations exist.'
          when 'messages' then 'Message history exists.'
          when 'channel_accounts' then 'A messaging channel account is connected.'
          when 'whatsapp_templates' then 'WhatsApp templates are configured for real conversations.'
          when 'notifications' then 'Notifications were delivered to staff.'
          when 'queue_alerts' then 'Queue alerts were raised. That is operational history.'
          when 'queue_alert_runs' then 'Queue alert runs exist.'
          when 'patient_portal_delivery_events' then 'Portal messages were delivered to patients.'
          when 'reminders' then 'Reminders were queued for patients.'
          when 'leads' then 'Patient-acquisition leads exist.'
          when 'lead_activities' then 'Lead activity history exists.'
          when 'lead_assignments' then 'Leads were assigned to staff.'
          when 'lead_followups' then 'Lead follow-ups exist.'
          when 'lead_campaign_spend' then 'Ad spend is attributed to this workspace.'
          when 'meta_ads_connections' then 'A connected ad account still holds provider tokens.'
          when 'meta_ads_sync_runs' then 'Ad sync runs exist.'
          when 'saas_invoices' then 'The workspace has been billed by the platform.'
          when 'saas_payments' then 'The workspace has paid the platform.'
          when 'report_schedules' then 'Scheduled reports exist.'
          when 'saved_reports' then 'Saved report definitions exist.'
          when 'self_checkin_tokens' then 'A patient check-in link is still live.'
          when 'ai_tool_audit_log' then 'The AI receptionist acted inside this workspace. That trail is kept.'
          when 'authz_shadow_decisions' then 'Authorization shadow decisions exist.'
          when 'system_backups' then 'Backup records exist.'
          else 'Operational data exists in this table.'
        end,
        'action', 'archive'));
    end loop;

    v_frontier := v_next;
  end loop;

  -- Children before parents, computed rather than assumed. Inside the erase set, an FK edge
  -- parent -> child forces the parent to a strictly higher rank than the child, so no CASCADE
  -- can erase rows the assessment counted for a later step and no RESTRICT can abort midway.
  -- tg_branches_cleanup_orphans is honoured the same way for free: its targets are reached
  -- through branches (reminders by the FK-less virtual edge, queue_alerts by a real one), so
  -- branches always ranks above them and is erased last.
  v_changed := true;
  v_pass := 0;
  while v_changed and v_pass < 16 loop
    v_pass := v_pass + 1;
    v_changed := false;
    for v_edge in select * from jsonb_array_elements(v_pairs) loop
      v_parent := v_edge.value->>'p';
      v_child := v_edge.value->>'c';
      if v_erase_map -> v_parent is not null and v_erase_map -> v_child is not null
         and (v_erase_map -> v_parent ->> 'rank')::int <= (v_erase_map -> v_child ->> 'rank')::int then
        v_erase_map := jsonb_set(v_erase_map, array[v_parent, 'rank'],
                                 to_jsonb((v_erase_map -> v_child ->> 'rank')::int + 1));
        v_changed := true;
      end if;
    end loop;
  end loop;

  if not v_tenant.is_archived then
    v_verdict := 'NEEDS_ARCHIVE';
  elsif v_block_map <> '{}'::jsonb then
    v_verdict := 'BLOCKED';
  else
    v_verdict := 'DELETABLE';
  end if;

  select coalesce(jsonb_agg(v_erase_map -> k order by (v_erase_map -> k ->> 'rank')::int,
                            (k = 'branches'), k), '[]'::jsonb)
    into v_erased
    from jsonb_object_keys(v_erase_map) k;
  select coalesce(jsonb_agg(v_block_map -> k order by (v_block_map -> k ->> 'table'),
                            (v_block_map -> k ->> 'code')), '[]'::jsonb)
    into v_blockers
    from jsonb_object_keys(v_block_map) k;
  select coalesce(jsonb_agg(v_surv_map -> k order by (v_surv_map -> k ->> 'table')), '[]'::jsonb)
    into v_survivors
    from jsonb_object_keys(v_surv_map) k;

  return jsonb_build_object(
    'tenant_id', v_tenant.id,
    'slug', v_tenant.slug,
    'name', coalesce(v_tenant.name_ar, v_tenant.name_en, v_tenant.name),
    'is_archived', v_tenant.is_archived,
    'archived_at', v_tenant.archived_at,
    'subscription_status', v_tenant.subscription_status,
    'branch_count', coalesce(array_length(v_branch_ids, 1), 0),
    'branch_ids', to_jsonb(v_branch_ids),
    'verdict', v_verdict,
    'walk_levels', v_level,
    'walk_stopped', v_level >= 12,
    'tables_measured', v_seq - 1,
    'edges_walked', v_edges,
    'blockers', v_blockers,
    'erased', v_erased,
    'survivors', v_survivors,
    'confirm_value', v_tenant.slug);
end;
$$;

-- 3. The delete: it executes the plan the assessment produced and nothing else.
create or replace function public.platform_permanent_delete_tenant(
  p_tenant_id uuid,
  p_confirm_slug text,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tenant record;
  v_assess jsonb;
  v_recheck jsonb;
  v_verdict text;
  v_plan jsonb;
  v_item jsonb;
  v_branch_ids uuid[];
  v_tbl text;
  v_rows bigint;
  v_before bigint;
  v_sub bigint;
  v_survivors jsonb;
  v_survivors_after jsonb := '[]'::jsonb;
  v_change_log jsonb;
  v_receipt_id uuid;
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 500);
  v_blockers jsonb;
  v_pred text;
begin
  if not public.has_role(auth.uid(), 'system_owner'::public.app_role) then
    raise exception 'System Owner role required' using errcode = '42501';
  end if;

  -- Same posture as tg_guard_last_tenant_branch: a Repeatable Read snapshot can hide rows
  -- committed after it began, and this function decides what is safe to erase.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Permanent workspace deletion requires a fresh Read Committed transaction'
      using errcode = '40001';
  end if;

  select t.id, t.slug, t.name, t.name_en, t.name_ar, t.plan_id, t.is_archived, t.archived_at
    into v_tenant
    from public.tenants t
   where t.id = p_tenant_id
     for update;
  if not found then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;

  -- The typed confirmation is re-checked server-side against the live slug: the dialog cannot
  -- be the only place the name is verified.
  if lower(btrim(coalesce(p_confirm_slug, ''))) <> lower(v_tenant.slug) then
    raise exception 'PERMANENT_DELETE_SLUG_MISMATCH: type the workspace slug exactly to confirm'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zmedico.workspace-delete:' || p_tenant_id::text, 0));

  if not v_tenant.is_archived then
    raise exception 'PERMANENT_DELETE_ARCHIVE_FIRST: archive this workspace before deleting it permanently'
      using errcode = '23514';
  end if;

  v_assess := public.platform_workspace_delete_assess(p_tenant_id);
  v_verdict := v_assess ->> 'verdict';
  if v_verdict is distinct from 'DELETABLE' then
    v_blockers := v_assess->'blockers';
    raise exception 'PERMANENT_DELETE_BLOCKED: % is %; %',
      v_tenant.slug, lower(v_verdict),
      left(coalesce((select string_agg(b->>'table' || ' (' || coalesce(b->>'rows', '?') || ')', ', ')
                       from jsonb_array_elements(v_blockers) b), 'no deletable state'), 240)
      using errcode = '23514',
            hint = 'Archive the workspace instead, or clear the named tables through the clinic screens first.';
  end if;

  v_plan := v_assess->'erased';
  v_branch_ids := coalesce((select array_agg(b.v::uuid)
                              from jsonb_array_elements_text(v_assess->'branch_ids') b(v)),
                           '{}'::uuid[]);
  v_survivors := v_assess->'survivors';

  -- The platform change log for this tenant is ON DELETE CASCADE from tenants, so the delete
  -- would erase the record of the tenant's own administration. Copy it into the receipt
  -- before anything is removed.
  select coalesce(jsonb_agg(jsonb_build_object(
           'at', x.created_at, 'actor', x.actor_id, 'category', x.category,
           'action', x.action, 'summary', x.summary) order by x.created_at), '[]'::jsonb)
    into v_change_log
    from public.platform_change_log x
   where x.tenant_id = p_tenant_id;

  -- Erase in plan order: every step is the predicate the assessment counted with, and every
  -- step must delete exactly the rows that predicate matched.
  for v_item in select * from jsonb_array_elements(v_plan) loop
    v_tbl := v_item ->> 'table';

    -- Two triggers stand between this plan and Postgres: the last-branch policy guard, whose
    -- integrity half the assessment already re-ran and whose audit half is the disclosed
    -- survivor case, and the change-log append-only guard, whose rows were copied above.
    -- Both are re-enabled immediately, and only for these rows in this transaction. The third
    -- BEFORE DELETE guard on branches (last active branch) is left enabled on purpose: it
    -- returns OLD untouched for a tenant with is_active = false, which the archive gate above
    -- guarantees here.
    if v_tbl = 'branches' then
      alter table public.branches disable trigger branches_guard_last_tenant_branch;
    end if;
    if v_tbl = 'platform_change_log' then
      alter table public.platform_change_log disable trigger platform_change_log_no_delete;
    end if;

    begin
      execute 'delete from public.' || quote_ident(v_tbl) || ' "_s' || (v_item ->> 'bind') ||
              '" where (' || (v_item ->> 'pred') || ')'
        using p_tenant_id;
      get diagnostics v_rows = ROW_COUNT;
    exception when others then
      if v_tbl = 'branches' then
        alter table public.branches enable trigger branches_guard_last_tenant_branch;
      end if;
      if v_tbl = 'platform_change_log' then
        alter table public.platform_change_log enable trigger platform_change_log_no_delete;
      end if;
      raise;
    end;

    if v_tbl = 'branches' then
      alter table public.branches enable trigger branches_guard_last_tenant_branch;
    end if;
    if v_tbl = 'platform_change_log' then
      alter table public.platform_change_log enable trigger platform_change_log_no_delete;
    end if;

    if v_rows is distinct from (v_item ->> 'rows')::bigint then
      raise exception 'PERMANENT_DELETE_DRIFT: % was measured at % rows, deleting it removed %; a cascade or a trigger wrote something the assessment did not measure',
        v_tbl, (v_item ->> 'rows')::bigint, coalesce(v_rows, -1)
        using errcode = '40001';
    end if;
  end loop;

  -- Re-check after the erasure and before the tenant row goes. Anything the walk now reports —
  -- a concurrent insert, a table nobody expected — aborts the whole delete.
  v_recheck := public.platform_workspace_delete_assess(p_tenant_id);
  if v_recheck ->> 'verdict' is distinct from 'DELETABLE'
     or jsonb_array_length(v_recheck->'erased') > 0 then
    raise exception 'PERMANENT_DELETE_BLOCKED: the workspace changed during deletion (%; % erase steps still pending); nothing was committed',
      lower(v_recheck ->> 'verdict'), jsonb_array_length(v_recheck->'erased')
      using errcode = '40001';
  end if;

  delete from public.tenants where id = p_tenant_id;

  -- The trails that stay behind, measured again now that the parent rows are gone. The
  -- assessment scoped them through branches; the branches are deleted, so this recount names
  -- the branch ids captured before the erase. Anything the two numbers disagree about is the
  -- receipt saying so plainly.
  for v_item in select * from jsonb_array_elements(v_survivors) loop
    v_tbl := v_item ->> 'table';
    v_pred := case v_tbl
      when 'audit_logs' then '"branch_id" = any ($2)'
      when 'client_errors' then '"branch_id" = any ($2)'
      when 'phi_access_log' then '"branch_id" = any ($2)'
      when 'ai_config_audit_log' then '"tenant_id" = $1'
      else null end;
    v_before := coalesce((v_item ->> 'rows')::bigint, 0);
    if v_pred is null then
      v_survivors_after := v_survivors_after || jsonb_build_object(
        'table', v_tbl, 'rows_before', v_before, 'rows_after', null);
      continue;
    end if;
    begin
      execute 'select count(*) from public.' || quote_ident(v_tbl) || ' where (' || v_pred || ')'
        into v_sub
        using p_tenant_id, v_branch_ids;
      v_survivors_after := v_survivors_after || jsonb_build_object(
        'table', v_tbl, 'rows_before', v_before, 'rows_after', v_sub::bigint);
    exception when others then
      v_survivors_after := v_survivors_after || jsonb_build_object(
        'table', v_tbl, 'rows_before', v_before, 'rows_after', 'unmeasurable');
    end;
  end loop;

  insert into public.platform_workspace_deletions (
    tenant_id, slug, name, name_en, name_ar, plan_id, archived_at, branch_ids,
    erased, survivors, change_log, assessment, reason, deleted_by)
  values (
    p_tenant_id, v_tenant.slug, v_tenant.name, v_tenant.name_en, v_tenant.name_ar, v_tenant.plan_id,
    v_tenant.archived_at, v_branch_ids,
    coalesce((select jsonb_agg(jsonb_build_object(
                'table', e->>'table', 'rows', (e->>'rows')::bigint,
                'depth', (e->>'depth')::int, 'rank', (e->>'rank')::int)
              order by (e->>'rank')::int, (e->>'table') = 'branches', e->>'table')
               from jsonb_array_elements(v_plan) e), '[]'::jsonb),
    coalesce(v_survivors_after, '[]'::jsonb),
    coalesce(v_change_log, '[]'::jsonb),
    jsonb_build_object(
      'verdict', v_assess ->> 'verdict',
      'walk_levels', v_assess ->> 'walk_levels',
      'tables_measured', v_assess ->> 'tables_measured',
      'edges_walked', v_assess ->> 'edges_walked',
      'branch_count', v_assess ->> 'branch_count',
      'recheck', jsonb_build_object(
        'verdict', v_recheck ->> 'verdict',
        'blockers', v_recheck->'blockers',
        'erased', v_recheck->'erased',
        'survivors', v_recheck->'survivors')),
    v_reason, auth.uid())
  returning id into v_receipt_id;

  return jsonb_build_object(
    'deleted', true, 'tenant_id', p_tenant_id, 'slug', v_tenant.slug,
    'receipt_id', v_receipt_id,
    'branch_count', coalesce(array_length(v_branch_ids, 1), 0),
    'erased', coalesce((select jsonb_agg(jsonb_build_object(
                'table', e->>'table', 'rows', (e->>'rows')::bigint, 'rank', (e->>'rank')::int)
              order by (e->>'rank')::int, (e->>'table') = 'branches', e->>'table')
               from jsonb_array_elements(v_plan) e), '[]'::jsonb),
    'survivors', coalesce(v_survivors_after, '[]'::jsonb),
    'change_log_rows_kept', jsonb_array_length(coalesce(v_change_log, '[]'::jsonb)),
    'reason', v_reason);
end;
$$;

REVOKE ALL ON FUNCTION public.platform_workspace_delete_assess(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_permanent_delete_tenant(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_workspace_delete_assess(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_permanent_delete_tenant(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.platform_workspace_delete_assess(uuid) IS
  'System Owner read: walks the foreign-key closure outward from tenants.id / branches.id (including the five FK-less scope columns), builds one predicate per reachable table, classifies it as erasable configuration, disclosed trail or blocker (unknown means blocker), and returns DELETABLE / BLOCKED / NEEDS_ARCHIVE with the erase plan. Shared by the confirmation dialog and platform_permanent_delete_tenant.';

COMMENT ON FUNCTION public.platform_permanent_delete_tenant(uuid, text, text) IS
  'System Owner irreversible action: permanently deletes an archived workspace the assessment proved structurally empty. Requires the live slug re-typed, erases only the measured plan with a ROW_COUNT check per table, re-assesses before removing the tenant row, relocates the platform change-log rows the CASCADE would erase, and writes an immutable receipt. Aborts rather than un-hooking an immutability trigger.';
