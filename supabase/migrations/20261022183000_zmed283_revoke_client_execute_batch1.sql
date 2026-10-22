-- ZMED-283 batch 1: stop handing SECURITY DEFINER RPCs to the browser for paths the browser never calls.
--
-- Supabase security advisors report this as `authenticated_security_definer_function_executable`: Supabase grants
-- EXECUTE to `authenticated` for a function unless a migration says otherwise, so each of these is a live /rpc/
-- endpoint any signed-in user of ANY tenant can invoke, with whatever the definer body lets them read or write.
-- These 8 are the ones no client path needs.
--
-- How the 8 were picked (2026-10-22, measured on Production rqcmnfzfytyyicelvifk, not assumed):
--   135 public plpgsql/sql functions are executable by anon or authenticated. A token scan of every surface whose
--   expressions Postgres evaluates with CLIENT privileges -- RLS policies (all schemas), column defaults, check
--   constraints, SECURITY INVOKER function bodies (all schemas), views, materialized views, rewrite rules, pg_cron
--   commands -- kept 122 of them. The 13 leftovers were then checked against the artifacts that actually run: the
--   deployed browser bundle (273 files served from zmedico2.belalaamer.workers.dev, scanned for the exact word;
--   positive controls admin_archive_branch, hr_manage_staff_user_link, authz_has_permissions,
--   public_booking_slots_for_tenant, get_public_tenant_branding and patient_portal_snapshot all matched), src/ and
--   supabase/functions/ excluding the generated src/integrations/supabase/types.ts (it names every function in the
--   database, so it proves nothing), the eight deployed Edge Function sources pulled from Production, the pgTAP
--   suite and scripts/authz. Five of the 13 were dropped by that review and are NOT touched here:
--     authz_has_permissions                    -- called at src/lib/authz/createShadowProbe.ts:75
--     hr_manage_staff_user_link                -- called at src/lib/staffAccountLifecycle.ts:22
--     platform_approve_subscription_request    -- supabase/tests/subscription_request_provisioning.sql asserts
--                                                authenticated EXECUTE
--     authz_current_version, authz_current_versions -- scripts/authz/intentional_changes.txt entry
--                                                "rpc:authz_current_version,-,authenticated,-,allow"
--   The 23 trigger functions stayed in the keep set for a later batch: their names appear in other INVOKER bodies
--   in that coarse token scan, so none of them was individually reviewed.
--
-- Four privilege behaviours decide where that line sits. All four were executed on the isolated QA Postgres on
-- 2026-10-22, with controls (work/zmed-283-semantics-probe.mjs, receipt
-- outputs/ZMED-283-semantics-probe-2026-10-22.json, controls_ok=true, everything created by it rolled back):
--   A. The trigger manager fires a trigger body WITHOUT checking EXECUTE for the invoking role, while a direct
--      client call to the same function becomes 42501. A trigger function CAN be revoked.
--   B. A SECURITY INVOKER trigger body's inner calls ARE checked against the client role. Callees of INVOKER
--      triggers must keep EXECUTE -- which is why INVOKER bodies are an abort surface below.
--   C. A SECURITY DEFINER body's inner calls are checked against the OWNER, and these owners are `postgres`,
--      which keeps its grant. Revoking a function reachable only from definer bodies breaks nothing.
--   D/E. RLS policy expressions and column defaults ARE checked against the client role, so a function appearing
--      in either must keep EXECUTE. This file aborts if one ever does.
--   F. `REVOKE ... FROM PUBLIC, anon, authenticated` leaves `postgres` (the owner) and `service_role` intact.
--
-- Live catalog state for all 8 on Production and on QA the same day, which steps 3-6 below re-verify rather than
-- assume: owner=postgres, prosecdef=true, anon=false, PUBLIC=false, authenticated=true, service_role=true,
-- EXECUTE grantees = {postgres, service_role, authenticated}, used by no trigger, and zero mentions on any
-- client-privilege surface. The only callers anywhere in the catalog are definer bodies owned by postgres, which
-- is case C and therefore unaffected:
--   booking_resource_is_eligible <- enforce_booking_resource_capacity, public_booking_slots_for_tenant,
--                                   _create_booking_for_patient
--   meta_ads_admin_access        <- get_meta_ads_connection_status
-- The other six have no caller in the catalog at all. docs/execution/FINAL_AUTHORIZATION_AUDIT.md:141 still claims
-- realtime_topic_branch_allowed is "called from RLS/Realtime/Storage hooks. Required."; that is stale. Measured
-- live: zero policies and zero function bodies mention it. Realtime authorization goes through
-- can_access_realtime_topic, asserted by supabase/tests/write_delete_realtime_hardening.sql.
--
-- Scope: function-level GRANT/REVOKE only. No function body, definer flag, owner, other-role ACL, policy,
-- trigger, cron job, Edge Function or bundle changes. Re-runnable: after a successful run authenticated=false,
-- step 6 takes the no-op branch, and every post-assertion still holds.

DO $zmed283$
DECLARE
  v_sig     text[] := array[
    'public.admin_force_delete_branch(uuid)',
    'public.admin_override_medical_record(uuid,text,uuid)',
    'public.booking_resource_is_eligible(uuid,uuid,text)',
    'public.get_meta_ads_connection_status(uuid)',
    'public.list_doctors()',
    'public.meta_ads_admin_access(uuid)',
    'public.patient_portal_set_password_ready()',
    'public.realtime_topic_branch_allowed(text)'];
  v_name_arr text[] := array[
    'admin_force_delete_branch','admin_override_medical_record','booking_resource_is_eligible',
    'get_meta_ads_connection_status','list_doctors','meta_ads_admin_access',
    'patient_portal_set_password_ready','realtime_topic_branch_allowed'];

  v_oid       oid;
  v_name      text;
  v_hits      int;
  v_grantees  text;
  v_i         int;
  v_before    bigint;
  v_after     bigint;
  v_proc_cnt  bigint;
  v_proc_cnt2 bigint;
  v_pol_cnt   bigint;
  v_pol_cnt2  bigint;
  v_revoked   int := 0;
  v_noop      int := 0;
  v_hits_map  jsonb;
BEGIN
  -- 1. Invariants recorded up front so the end of the run can prove nothing but these ACLs moved. anon OR
  --    authenticated, exactly the advisor's predicate and the predicate the 135-function inventory was counted
  --    with; PUBLIC is checked per target in step 6 instead of folded into this count.
  SELECT count(*) INTO v_proc_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public';
  SELECT count(*) INTO v_pol_cnt FROM pg_policy;
  SELECT count(*) INTO v_before
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND l.lanname IN ('plpgsql','sql')
     AND (has_function_privilege('anon', p.oid, 'execute')
       OR has_function_privilege('authenticated', p.oid, 'execute'));

  -- 2. The client-privilege surface, tokenised, counted once for all 8 targets. SECURITY DEFINER bodies are
  --    deliberately absent: case C shows their inner calls are checked against the owner, and three of the
  --    targets are called only from such a body, so including them would abort a provably safe revoke.
  --    Tokens come from the maximal-munch split on [a-zA-Z_][a-zA-Z0-9_]*, so tok = 'list_doctors' cannot be
  --    satisfied by list_doctors_for_service; that is what makes an exact comparison the right word boundary.
  WITH tgt(fname) AS (SELECT unnest(v_name_arr)),
       corpus(txt) AS (
         SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
                coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
           FROM pg_policy pol
         UNION ALL SELECT coalesce(pg_get_expr(a.adbin, a.adrelid), '') FROM pg_attrdef a
         UNION ALL SELECT coalesce(pg_get_constraintdef(o.oid), '') FROM pg_constraint o
         UNION ALL SELECT definition FROM pg_views
         UNION ALL SELECT definition FROM pg_matviews
         UNION ALL SELECT pg_get_ruledef(r.oid) FROM pg_rewrite r
         UNION ALL SELECT coalesce(j.command, '') FROM cron.job j
         UNION ALL SELECT pg_get_functiondef(p.oid) FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           JOIN pg_language l ON l.oid = p.prolang
          WHERE NOT p.prosecdef AND l.lanname IN ('plpgsql','sql')
       ),
       tok(w) AS (SELECT m[1] FROM (SELECT regexp_matches(txt, '[a-zA-Z_][a-zA-Z0-9_]*', 'g') AS m
                                      FROM corpus) s)
  SELECT jsonb_object_agg(t.fname, (SELECT count(*) FROM tok WHERE tok.w = t.fname))
    INTO v_hits_map FROM tgt t;
  IF v_hits_map IS NULL OR v_hits_map = '{}'::jsonb THEN
    RAISE EXCEPTION 'zmed283_surface_scan_empty';
  END IF;

  FOR v_i IN 1 .. array_length(v_sig, 1)
  LOOP
    v_name := v_name_arr[v_i];

    -- 3. Resolve the pinned signature. to_regprocedure is the whole guard against a rename, a drop or an
    --    argument change: it resolves to exactly this function or the run aborts instead of revoking a look-alike.
    v_oid := to_regprocedure(v_sig[v_i]);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'zmed283_function_missing: %', v_sig[v_i];
    END IF;
    IF (SELECT count(*) FROM pg_proc WHERE proname::text = v_name
          AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) <> 1 THEN
      RAISE EXCEPTION 'zmed283_overload_ambiguous: %', v_name;
    END IF;

    -- 4. It must still be the kind of object this batch was reviewed as. Each abort here means the argument
    --    behind the revoke no longer applies, so the target needs a fresh review, not a silent extra revoke.
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION 'zmed283_not_security_definer: %', v_sig[v_i];
    END IF;
    IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = v_oid) <> 'postgres' THEN
      RAISE EXCEPTION 'zmed283_owner_changed: %', v_sig[v_i];
    END IF;
    IF (SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = v_oid)
       NOT IN ('plpgsql','sql') THEN
      RAISE EXCEPTION 'zmed283_unexpected_language: %', v_sig[v_i];
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgfoid = v_oid) THEN
      RAISE EXCEPTION 'zmed283_trigger_class_deferred: %', v_sig[v_i];
    END IF;

    -- 5. Case B/D/E: nothing on a client-privilege surface may mention the name.
    v_hits := coalesce((v_hits_map ->> v_name)::int, -1);
    IF v_hits = -1 THEN
      RAISE EXCEPTION 'zmed283_surface_scan_missing_target: %', v_name;
    END IF;
    IF v_hits <> 0 THEN
      RAISE EXCEPTION 'zmed283_referenced_by_client_surface: % hits=%', v_sig[v_i], v_hits;
    END IF;

    -- 6. Before-state must be what was measured. anon or PUBLIC holding EXECUTE would be the anon advisor class
    --    -- a different finding with a different review -- and must not be folded in here by accident.
    IF has_function_privilege('anon', v_oid, 'execute') THEN
      RAISE EXCEPTION 'zmed283_anon_can_execute_review_separately: %', v_sig[v_i];
    END IF;
    IF has_function_privilege('public', v_oid, 'execute') THEN
      RAISE EXCEPTION 'zmed283_public_can_execute_review_separately: %', v_sig[v_i];
    END IF;

    -- The set of roles holding EXECUTE, compared as a sorted name list rather than as proacl text: aclitem
    -- output order is not something this file should depend on. aclexplode reports PUBLIC as oid 0, which has
    -- no pg_roles row, so it renders as PUBLIC here rather than disappearing.
    SELECT coalesce(string_agg(x.rolname, ',' ORDER BY x.rolname), 'none') INTO v_grantees
      FROM (SELECT DISTINCT coalesce(r.rolname::text, 'PUBLIC') AS rolname
              FROM pg_proc p
              CROSS JOIN LATERAL aclexplode(p.proacl) a
              LEFT JOIN pg_roles r ON r.oid = a.grantee
             WHERE p.oid = v_oid AND a.privilege_type = 'EXECUTE') x;

    IF NOT (has_function_privilege('postgres', v_oid, 'execute')
        AND has_function_privilege('service_role', v_oid, 'execute')) THEN
      RAISE EXCEPTION 'zmed283_privilege_already_lost: % grantees=%', v_sig[v_i], v_grantees;
    END IF;
    IF v_grantees NOT IN ('postgres,service_role', 'authenticated,postgres,service_role') THEN
      RAISE EXCEPTION 'zmed283_unexpected_grantee_set: % grantees=%', v_sig[v_i], v_grantees;
    END IF;

    IF has_function_privilege('authenticated', v_oid, 'execute') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_oid::regprocedure);
      v_revoked := v_revoked + 1;

      -- 7. Same transaction, same snapshot: the /rpc/ door is shut and the two roles that must keep working did.
      IF has_function_privilege('authenticated', v_oid, 'execute') THEN
        RAISE EXCEPTION 'zmed283_revoke_did_not_land: %', v_sig[v_i];
      END IF;
      IF NOT (has_function_privilege('postgres', v_oid, 'execute')
          AND has_function_privilege('service_role', v_oid, 'execute')) THEN
        RAISE EXCEPTION 'zmed283_privilege_collateral_loss: %', v_sig[v_i];
      END IF;
    ELSE
      v_noop := v_noop + 1;
    END IF;

    SELECT coalesce(string_agg(x.rolname, ',' ORDER BY x.rolname), 'none') INTO v_grantees
      FROM (SELECT DISTINCT coalesce(r.rolname::text, 'PUBLIC') AS rolname
              FROM pg_proc p
              CROSS JOIN LATERAL aclexplode(p.proacl) a
              LEFT JOIN pg_roles r ON r.oid = a.grantee
             WHERE p.oid = v_oid AND a.privilege_type = 'EXECUTE') x;
    IF v_grantees <> 'postgres,service_role' THEN
      RAISE EXCEPTION 'zmed283_final_grantee_set_unexpected: % grantees=%', v_sig[v_i], v_grantees;
    END IF;
  END LOOP;

  -- 8. Nothing else moved, and the client-executable count fell by exactly the number revoked.
  SELECT count(*) INTO v_proc_cnt2 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public';
  SELECT count(*) INTO v_pol_cnt2 FROM pg_policy;
  SELECT count(*) INTO v_after
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND l.lanname IN ('plpgsql','sql')
     AND (has_function_privilege('anon', p.oid, 'execute')
       OR has_function_privilege('authenticated', p.oid, 'execute'));
  IF v_proc_cnt2 <> v_proc_cnt THEN
    RAISE EXCEPTION 'zmed283_function_count_changed: % -> %', v_proc_cnt, v_proc_cnt2;
  END IF;
  IF v_pol_cnt2 <> v_pol_cnt THEN
    RAISE EXCEPTION 'zmed283_policy_count_changed: % -> %', v_pol_cnt, v_pol_cnt2;
  END IF;
  IF v_after <> v_before - v_revoked THEN
    RAISE EXCEPTION 'zmed283_surface_count_unexpected: before=% after=% revoked=% noop=%',
      v_before, v_after, v_revoked, v_noop;
  END IF;
  IF v_revoked + v_noop <> array_length(v_sig, 1) THEN
    RAISE EXCEPTION 'zmed283_target_count_unexpected: revoked=% noop=%', v_revoked, v_noop;
  END IF;

  RAISE NOTICE 'zmed283_batch1 revoked=% noop=% client_executable_public_funcs=% -> %',
    v_revoked, v_noop, v_before, v_after;
END;
$zmed283$;

-- Intended end state for each of the 8, and the measured state of the rest of the catalog:
--   anon           -> no EXECUTE (was already the case; asserted, so an anon-side finding cannot hide here)
--   authenticated  -> no EXECUTE (previously granted by Supabase default; removed here)
--   PUBLIC         -> no EXECUTE (was already the case; asserted)
--   postgres       -> EXECUTE kept (function owner; every definer caller of these 8 runs as this role)
--   service_role   -> EXECUTE kept (server-side paths, pg_cron and Edge adminClient calls are untouched)
--   Other 127 client-executable public functions -> unchanged by this file, including all 23 trigger functions
--   and every function named by a policy, default, constraint, view, rule, cron command or INVOKER body.
