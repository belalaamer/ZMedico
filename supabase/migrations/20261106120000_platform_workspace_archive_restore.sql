-- (أ) Platform workspace archive ledger, and the Restore half of Archive.
--
-- Why this exists. `platform_archive_tenant` (20260827210000:148) already deactivates a
-- workspace, but it leaves nothing behind that says so: "archived" was only inferable from
-- `is_active = false AND subscription_status IN ('cancelled','expired')`, which is the same
-- row shape a subscription that expired on its own produces. The console therefore could not
-- tell an archive from an expiry, could not say who did it or why, and had no way back — the
-- archive dialog promised "can be restored later through a separate administrative action"
-- and no such action existed. Worse, the archive clamps the four timestamps that a restore
-- would need (`trial_ends_at`, `subscription_ends_at`, `subscriptions.current_period_end`)
-- and flips `branches.is_active` / `tenant_domains.is_enabled`, so the before-state was
-- destroyed by the very statement that created it.
--
-- What changes here. The archive writes are byte-identical — same clamps, same enum casts,
-- same early return, same result keys — and this file only *adds* the record of what the
-- archive did to get there, plus a Restore that replays it. Nothing in the clinic-facing
-- reads changes: the new columns are not selected by any existing client query, and
-- `is_archived` is additive.
--
-- Status: NOT APPLIED. Proved against live Production `rqcmnfzfytyyicelvifk` inside
-- BEGIN; <these exact bytes>; <receipts>; ROLLBACK; — no COMMIT before the owner approves.

-- 1. The archive ledger on the tenant row itself.
alter table public.tenants
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists archive_reason text,
  add column if not exists archive_snapshot jsonb;

comment on column public.tenants.archived_at is
  'When platform_archive_tenant ran for this tenant. NULL for a workspace that was never archived by the platform, including every archive that predates this migration.';
comment on column public.tenants.archived_by is
  'The auth user who archived the workspace. Deliberately has no FK to profiles: an accountable ledger must survive the deletion of the actor''s profile row, the same way platform audit trails are attributed without a reference.';
comment on column public.tenants.archive_reason is 'Operator-supplied reason, capped at 500 characters by the RPC and by tenants_archive_ledger_coherent.';
comment on column public.tenants.archive_snapshot is
  'Versioned before-state (tenant flags and timestamps, branches with their is_active, domains with is_enabled/status, subscriptions with status and period end) captured inside the same FOR UPDATE transaction as the archive. Restore replays it and nothing else.';

-- An archived row that cannot say what it looked like before is not restorable, so it may not
-- claim to be archived. Existing rows have archived_at NULL and satisfy this without a scan.
alter table public.tenants
  drop constraint if exists tenants_archive_ledger_coherent;
alter table public.tenants
  add constraint tenants_archive_ledger_coherent check (
    archived_at is null
    or (
      archive_snapshot is not null
      and (archive_reason is null or char_length(archive_reason) <= 500)
    )
  );

-- 2. One definition of "archived", shared by the console list, its KPI counts and the RPCs.
--    Derived rather than stored so a legacy archive (inactive + cancelled, written before this
--    migration) can never be counted as live, and so no code path can forget to clear it.
alter table public.tenants
  add column if not exists is_archived boolean generated always as (
    archived_at is not null
    or (
      is_active = false
      and subscription_status in ('cancelled'::public.subscription_status, 'expired'::public.subscription_status)
    )
  ) stored;

comment on column public.tenants.is_archived is
  'Derived: archived by the platform RPC, or an equivalent legacy archive (deactivated and cancelled/expired). The single filter the Platform console uses for its directory, its counts and its Archived tab.';

create index if not exists tenants_archived_ledger_idx
  on public.tenants (is_archived, created_at desc);

-- 3. Archive: identical writes, plus the snapshot and the ledger.
CREATE OR REPLACE FUNCTION public.platform_archive_tenant(p_tenant_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 500);
  v_snap jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002'; END IF;
  IF v_tenant.is_archived THEN
    RETURN jsonb_build_object('archived', false, 'already_archived', true, 'tenant_id', p_tenant_id);
  END IF;

  -- Read the before-state before anything is clamped. jsonb_build_object keeps NULLs as JSON
  -- nulls, so Restore can distinguish "was NULL" from "missing" and replay either faithfully.
  SELECT jsonb_build_object(
    'version', 2,
    'tenant', jsonb_build_object(
      'is_active', v_tenant.is_active,
      'subscription_status', v_tenant.subscription_status::text,
      'trial_ends_at', v_tenant.trial_ends_at,
      'subscription_ends_at', v_tenant.subscription_ends_at,
      'plan_id', v_tenant.plan_id),
    'branches', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'is_active', b.is_active, 'is_main_branch', b.is_main_branch,
        'name_en', b.name_en, 'name_ar', b.name_ar))
      FROM (SELECT id, is_active, is_main_branch, name_en, name_ar
              FROM public.branches WHERE tenant_id = p_tenant_id ORDER BY created_at, id) b), '[]'::jsonb),
    'domains', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'is_enabled', d.is_enabled, 'status', d.status, 'hostname', d.hostname))
      FROM (SELECT id, is_enabled, status, hostname
              FROM public.tenant_domains WHERE tenant_id = p_tenant_id ORDER BY hostname, id) d), '[]'::jsonb),
    'subscriptions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'status', s.status::text, 'billing_cycle', s.billing_cycle::text,
        'current_period_end', s.current_period_end))
      FROM (SELECT id, status, billing_cycle, current_period_end
              FROM public.subscriptions WHERE tenant_id = p_tenant_id ORDER BY current_period_end, id) s), '[]'::jsonb)
  ) INTO v_snap;

  -- The clamp block is the pre-existing body, unchanged.
  UPDATE public.tenants
     SET is_active = false,
         subscription_status = 'cancelled'::public.subscription_status,
         trial_ends_at = CASE WHEN trial_ends_at IS NULL THEN NULL ELSE least(trial_ends_at, now()) END,
         subscription_ends_at = CASE WHEN subscription_ends_at IS NULL THEN now() ELSE least(subscription_ends_at, now()) END,
         archived_at = now(),
         archived_by = auth.uid(),
         archive_reason = v_reason,
         archive_snapshot = v_snap,
         updated_at = now()
   WHERE id = p_tenant_id;

  UPDATE public.branches SET is_active = false, updated_at = now() WHERE tenant_id = p_tenant_id;
  UPDATE public.tenant_domains SET is_enabled = false, status = 'disabled', updated_at = now() WHERE tenant_id = p_tenant_id;
  UPDATE public.subscriptions SET status = 'cancelled'::public.subscription_status, current_period_end = least(current_period_end, now()) WHERE tenant_id = p_tenant_id;

  -- The ledger entry is written by the server, in the same transaction as the writes it
  -- describes. It used to be a client-side `writePlatformChange` after the RPC returned, so a
  -- closed tab or a failed second call lost the record of a completed archive.
  INSERT INTO public.platform_change_log (tenant_id, actor_id, category, action, summary, before_values, after_values)
  VALUES (
    p_tenant_id, auth.uid(), 'tenant', 'archive',
    left(coalesce(v_reason, 'platform_console_archive'), 500),
    jsonb_build_object('is_active', v_tenant.is_active, 'subscription_status', v_tenant.subscription_status::text,
                       'trial_ends_at', v_tenant.trial_ends_at, 'subscription_ends_at', v_tenant.subscription_ends_at),
    jsonb_build_object('is_active', false, 'subscription_status', 'cancelled',
                       'branches_deactivated', jsonb_array_length(v_snap->'branches'),
                       'domains_disabled', jsonb_array_length(v_snap->'domains')));

  RETURN jsonb_build_object('archived', true, 'already_archived', false, 'tenant_id', p_tenant_id,
    'reason', v_reason, 'snapshot_version', 2,
    'branch_count', jsonb_array_length(v_snap->'branches'));
END;
$$;

-- 4. Restore: the inverse, and only the inverse.
--    p_branch_ids lets the owner say which branches come back; p_subscription_status lets a
--    legacy archive (no snapshot, so no recorded prior status) be restored at all.
CREATE OR REPLACE FUNCTION public.platform_restore_tenant(
  p_tenant_id uuid,
  p_reason text DEFAULT NULL,
  p_branch_ids uuid[] DEFAULT NULL,
  p_subscription_status public.subscription_status DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 500);
  v_snap jsonb;
  v_branch_ids uuid[];
  v_seen uuid[] := '{}'::uuid[];
  v_status public.subscription_status;
  v_prev_trial timestamptz;
  v_prev_ends timestamptz;
  v_domain_rows integer := 0;
  v_subscription_rows integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'system_owner'::public.app_role) THEN
    RAISE EXCEPTION 'System Owner role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_tenant.is_archived THEN
    RETURN jsonb_build_object('restored', false, 'already_active', true, 'tenant_id', p_tenant_id);
  END IF;

  v_snap := v_tenant.archive_snapshot;

  -- Which branches come back. An explicit list always wins and is filtered against this
  -- tenant's own rows, so a crafted payload cannot reactivate another clinic's branch.
  IF p_branch_ids IS NOT NULL THEN
    SELECT coalesce(array_agg(b.id), '{}'::uuid[]) INTO v_branch_ids
      FROM public.branches b
     WHERE b.tenant_id = p_tenant_id AND b.id = ANY (p_branch_ids);
    IF coalesce(array_length(v_branch_ids, 1), 0) = 0 THEN
      RAISE EXCEPTION 'RESTORE_BRANCH_SELECTION_REQUIRED: p_branch_ids must name at least one branch of this tenant'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_snap IS NOT NULL AND jsonb_typeof(v_snap->'branches') = 'array' THEN
    SELECT coalesce(array_agg(b.id), '{}'::uuid[]) INTO v_branch_ids
      FROM public.branches b
     WHERE b.tenant_id = p_tenant_id
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_snap->'branches') AS e(value)
          WHERE (e.value->>'id')::uuid = b.id
            AND coalesce((e.value->>'is_active')::boolean, false));
  END IF;

  -- No snapshot (every archive made before this migration) or a workspace whose branches were
  -- already all inactive before it was archived: fall back to the single-branch shortcut, and
  -- otherwise make the operator choose instead of guessing.
  IF coalesce(array_length(v_branch_ids, 1), 0) = 0 THEN
    SELECT array_agg(s.id) INTO v_seen
      FROM (SELECT id FROM public.branches WHERE tenant_id = p_tenant_id ORDER BY created_at, id LIMIT 2) s;
    IF array_length(v_seen, 1) = 1 THEN
      v_branch_ids := v_seen;
    ELSE
      RAISE EXCEPTION 'RESTORE_BRANCH_SELECTION_REQUIRED: pass p_branch_ids — this workspace has % branches and no recorded before-state to replay',
        coalesce((SELECT count(*) FROM public.branches WHERE tenant_id = p_tenant_id), 0)
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Which subscription state comes back. The archive clamped the timestamps and cancelled
  -- the row, so the prior status is only knowable from the snapshot.
  -- `->>` yields SQL NULL for a missing key and for a JSON null, so an absent recorded status
  -- falls through to the raise below rather than to an empty-string enum cast.
  v_status := coalesce(p_subscription_status,
                       NULLIF(v_snap->'tenant' ->> 'subscription_status', '')::public.subscription_status);
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'RESTORE_SUBSCRIPTION_STATUS_REQUIRED: this archive predates the restore ledger, pass p_subscription_status (trial, active or past_due)'
      USING ERRCODE = '23514';
  END IF;

  v_prev_trial := NULLIF(v_snap->'tenant' ->> 'trial_ends_at', '')::timestamptz;
  v_prev_ends := NULLIF(v_snap->'tenant' ->> 'subscription_ends_at', '')::timestamptz;

  UPDATE public.branches
     SET is_active = true, updated_at = now()
   WHERE tenant_id = p_tenant_id AND id = ANY (v_branch_ids) AND is_active = false;

  -- Domains replay only the rows the snapshot recorded, still owned by this tenant. The
  -- provider state (hostname_status, ssl_status, cloudflare_hostname_id) is deliberately not
  -- touched: it is read back from Cloudflare by the next domain check, not remembered here.
  IF v_snap IS NOT NULL AND jsonb_typeof(v_snap->'domains') = 'array' THEN
    WITH replay AS (
      SELECT (e.value->>'id')::uuid AS id,
             coalesce((e.value->>'is_enabled')::boolean, false) AS is_enabled,
             NULLIF(e.value->>'status', '') AS status
        FROM jsonb_array_elements(v_snap->'domains') AS e(value)
    )
    UPDATE public.tenant_domains d
       SET is_enabled = r.is_enabled,
           status = coalesce(r.status, d.status),
           updated_at = now()
      FROM replay r
     WHERE d.id = r.id AND d.tenant_id = p_tenant_id
       AND (d.is_enabled <> r.is_enabled OR d.status IS DISTINCT FROM r.status);
    GET DIAGNOSTICS v_domain_rows = ROW_COUNT;
  END IF;

  -- Restoring current_period_end matters: the archive clamped it with least(), so replaying
  -- only the status would silently shorten a period the clinic had already paid for.
  IF v_snap IS NOT NULL AND jsonb_typeof(v_snap->'subscriptions') = 'array' THEN
    WITH replay AS (
      SELECT (e.value->>'id')::uuid AS id,
             NULLIF(e.value->>'status', '')::public.subscription_status AS status,
             NULLIF(e.value->>'current_period_end', '')::timestamptz AS current_period_end
        FROM jsonb_array_elements(v_snap->'subscriptions') AS e(value)
    )
    UPDATE public.subscriptions s
       SET status = coalesce(r.status, s.status),
           current_period_end = coalesce(r.current_period_end, s.current_period_end),
           updated_at = now()
      FROM replay r
     WHERE s.id = r.id AND s.tenant_id = p_tenant_id
       AND (s.status <> coalesce(r.status, s.status) OR s.current_period_end <> coalesce(r.current_period_end, s.current_period_end));
    GET DIAGNOSTICS v_subscription_rows = ROW_COUNT;
  END IF;

  UPDATE public.tenants
     SET is_active = true,
         subscription_status = v_status,
         trial_ends_at = coalesce(v_prev_trial, trial_ends_at),
         subscription_ends_at = coalesce(v_prev_ends, subscription_ends_at),
         archived_at = NULL,
         archived_by = NULL,
         archive_reason = NULL,
         archive_snapshot = NULL,
         updated_at = now()
   WHERE id = p_tenant_id;

  INSERT INTO public.platform_change_log (tenant_id, actor_id, category, action, summary, before_values, after_values)
  VALUES (
    p_tenant_id, auth.uid(), 'tenant', 'restore',
    left(coalesce(v_reason, 'platform_console_restore'), 500),
    jsonb_build_object('is_active', v_tenant.is_active, 'subscription_status', v_tenant.subscription_status::text,
                       'archived_at', v_tenant.archived_at, 'archive_reason', v_tenant.archive_reason),
    jsonb_build_object('is_active', true, 'subscription_status', v_status::text,
                       'branches_reactivated', to_jsonb(v_branch_ids),
                       'domains_replayed', v_domain_rows, 'subscriptions_replayed', v_subscription_rows,
                       'replayed_from_snapshot', v_snap IS NOT NULL));

  RETURN jsonb_build_object('restored', true, 'already_active', false, 'tenant_id', p_tenant_id,
    'subscription_status', v_status::text, 'branch_ids', to_jsonb(v_branch_ids),
    'domains_replayed', v_domain_rows, 'subscriptions_replayed', v_subscription_rows,
    'replayed_from_snapshot', v_snap IS NOT NULL, 'reason', v_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_archive_tenant(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_restore_tenant(uuid, text, uuid[], public.subscription_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_archive_tenant(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_restore_tenant(uuid, text, uuid[], public.subscription_status) TO authenticated;

COMMENT ON FUNCTION public.platform_archive_tenant(uuid, text) IS
  'System Owner lifecycle action: deactivates a tenant and its branches/domains without deleting clinical records, and records the before-state so platform_restore_tenant can replay it.';

COMMENT ON FUNCTION public.platform_restore_tenant(uuid, text, uuid[], public.subscription_status) IS
  'System Owner lifecycle action: replays the snapshot platform_archive_tenant recorded — chosen branches active, domains and subscription periods back to their recorded state, archive ledger cleared. Raises RESTORE_BRANCH_SELECTION_REQUIRED or RESTORE_SUBSCRIPTION_STATUS_REQUIRED rather than guessing for an archive that has no snapshot.';
