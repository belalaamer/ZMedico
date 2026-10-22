-- ZMED-298: fail loudly when the Realtime privilege posture stops holding the things that make it safe.
--
-- Read-only and register-only. No publication membership is changed, no policy is created or dropped, no grant
-- is issued or revoked, no row is read or written. This adds one monitor function and one cron job, and nothing
-- else. The instruction was «صلاحيات Realtime», and the measurement below is why a guard — not an edit — is the
-- right response to what Production actually holds.
--
-- Measured on Production (ref rqcmnfzfytyyicelvifk) on 2026-10-23, entirely from the catalog, plus executed
-- probes on the owned QA Postgres (see outputs/ZMED-298-qa-receipt-*.json):
--
--   1. Publication membership. pg_publication_tables for 'supabase_realtime' holds exactly five tables:
--      physio_cases, physio_reassessments, physio_sessions, queue_alerts, queue_alert_runs. The app subscribes
--      to ten; appointments, notifications, products, inventory and stock_alerts are NOT published, so those
--      seven .on('postgres_changes') handlers never receive anything and only the 30-60s polling fallbacks move
--      those screens. Whether those row images should start being pushed to sockets is a product decision, not a
--      privilege defect, and this file deliberately does not make it. The per-table read paths that decision
--      needs are measured and reported separately in outputs/.
--   2. How narrowly the published set is safe. anon holds NO SELECT privilege on any published table: relacl for
--      all five is {postgres=..., authenticated=arwd/postgres, service_role=...}. Three of them nevertheless
--      carry permissive policies with polroles = {0} (PUBLIC) — physio_cases_select, plus the restrictive
--      rls_hardening_branch_scope on four tables. Those policies are inert for anon only because of the missing
--      table grant, not because of the policy. The first «GRANT ... TO anon ON <published table>» would turn a
--      PUBLIC SELECT policy into an anonymous read path with no further warning. Assertion 4 pins the grant,
--      because the grant is the load-bearing half.
--   3. Broadcast goes through realtime.messages, guarded by two project policies (zmedico_private_topic_read
--      FOR SELECT, zmedico_private_topic_send FOR INSERT, both TO authenticated) that evaluate
--      public.can_access_realtime_topic(realtime.topic()) — a SECURITY DEFINER helper, pinned to
--      search_path=public, REVOKEd from anon, which returns false when auth.uid() IS NULL, otherwise demands
--      branch membership / case access / recipient identity, and returns false for any topic shape it does not
--      know. Three independent layers: the table grant, the policy role list, the gate.
--   4. The grant layer there is NOT stable. supabase/migrations/20260827130000_write_delete_realtime_hardening.sql
--      did run on Production — its two policies exist — and it contains «REVOKE ALL ON TABLE realtime.messages
--      FROM anon» and «REVOKE UPDATE, DELETE ... FROM authenticated». Live relacl today is anon=arw,
--      authenticated=arw, service_role=arw, each with grantor supabase_realtime_admin: the platform re-issued
--      those grants after the migration, so the versioned file and Production disagree about realtime.messages
--      privileges. Re-revoking is not the fix — it would be undone the same way, it would remove anon broadcast
--      on the day the patient portal wants it, and it buys nothing, because RLS (assertion 1) and the policy role
--      list (assertion 2) are what actually deny anon. This file guards the two durable controls and reports the
--      grant state in its return text, so cron.job_run_details keeps a running history of the unstable half.
--
-- What is asserted, and why each failure is worth an alert:
--   1. realtime.messages keeps row security ON. relrowsecurity=false combined with the anon=arw grant above makes
--      every tenant's broadcast payload readable by anyone holding the publishable key, which is public by
--      design. This is the one assertion whose failure is a data leak rather than an outage.
--   2. No SELECT, INSERT or ALL policy on realtime.messages may name anon or PUBLIC. Both live policies are
--      authenticated-only, so an anon caller has no applicable policy and RLS denies by default. A future
--      "make the portal work" policy TO PUBLIC would silently open the whole broadcast stream — the same shape as
--      the storage.objects anon policy ZMED-294 removed and ZMED-297 now watches.
--   3. The topic gate is intact: can_access_realtime_topic(text) still exists, is still SECURITY DEFINER with a
--      pinned search_path, is still not executable by anon, and both named policies still exist with the right
--      command type and still reference the gate in their expression. A dropped function or policy makes the
--      policy expression error, which stops subscriptions loudly — that is exactly what an alert is for.
--   4. Every table in supabase_realtime keeps relrowsecurity=true AND keeps anon without SELECT. This is what
--      makes the PUBLIC-role policies on published tables inert. It checks the property, not the membership, so
--      adding appointments later, if the owner decides to, will not trip it — but publishing a table with RLS off,
--      or granting anon on one that is published, will.
--   It does NOT assert replica identity. physio_cases, physio_reassessments and physio_sessions are on REPLICA
--   IDENTITY DEFAULT, so their UPDATE events carry no old record and DELETE carries only the PK — that is P-2 of
--   the ZMED-280 audit. But no subscriber in src/ reads payload.old (measured: zero matches), so it costs nothing
--   today, and switching to FULL is a WAL-volume decision for the owner rather than a defect to alert on.
--
-- Delivery, mirroring ZMED-291 and ZMED-297: the anomaly is a RAISE EXCEPTION, so it lands in
-- cron.job_run_details as a failed run carrying the text, and public.assert_cron_health() (job 17, every 15
-- minutes) reports any job other than itself that failed inside 2 hours. So this job needs no new alerting
-- channel and is watched by the monitor that already watches the scheduler.
--
-- The function is SECURITY INVOKER and STABLE, like assert_cron_health() and assert_storage_exposure(). It reads
-- pg_class, pg_policy, pg_proc, pg_roles and pg_publication_tables — all world-readable catalogs — and calls
-- has_table_privilege()/has_function_privilege(), so it needs no elevated rights and grants none.

CREATE OR REPLACE FUNCTION public.assert_realtime_exposure()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_anomalies text[] := '{}';
  v_msgs      oid;
  v_msgs_rls  boolean;
  v_msgs_acl  text;
  v_gate      oid;
  v_secdef    boolean;
  v_cfg       text;
  v_anon      oid;
  v_pol       record;
  v_t         record;
  v_pub       text := '-';
  v_pub_n     int  := 0;
BEGIN
  v_anon := to_regrole('anon');
  IF v_anon IS NULL OR to_regrole('authenticated') IS NULL THEN
    RAISE EXCEPTION 'realtime exposure: anon or authenticated is absent, so no client-role privilege assertion can be evaluated';
  END IF;

  -- 1 + 2 + 3 all hang off realtime.messages, so locate it first. Absent is itself reportable: the platform
  -- owns this table, and a rename or drop means the broadcast authorization model went with it.
  SELECT c.oid, c.relrowsecurity, c.relacl::text
    INTO v_msgs, v_msgs_rls, v_msgs_acl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'realtime' AND c.relname = 'messages';

  IF v_msgs IS NULL THEN
    v_anomalies := array_append(v_anomalies,
      'realtime.messages is absent, so private-channel broadcast authorization (topic gate + RLS) cannot be evaluated at all');
  ELSE
    IF NOT v_msgs_rls THEN
      v_anomalies := array_append(v_anomalies,
        format('realtime.messages has row security disabled while anon holds %s on it, so any client with the publishable key can read every tenant''s broadcast payload',
               v_msgs_acl));
    END IF;

    -- 2. A policy naming anon or PUBLIC is the difference between "no applicable policy, RLS denies" and a
    -- readable or writable broadcast stream for anonymous callers.
    FOR v_pol IN
      SELECT p.polname, p.polcmd,
             (SELECT string_agg(coalesce(r.rolname, 'PUBLIC'), ',')
                FROM unnest(p.polroles) rid LEFT JOIN pg_roles r ON r.oid = rid) AS roles
        FROM pg_policy p
       WHERE p.polrelid = v_msgs
         AND p.polcmd IN ('r', 'a', '*')
         AND EXISTS (SELECT 1 FROM unnest(p.polroles) rid
                      WHERE rid = v_anon OR rid = 0::oid)
    LOOP
      v_anomalies := array_append(v_anomalies,
        format('policy %s (%s, roles=%s) on realtime.messages names anon or PUBLIC; both live broadcast policies are authenticated-only',
               v_pol.polname,
               CASE v_pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' ELSE 'ALL' END,
               v_pol.roles));
    END LOOP;

    -- 3. The gate. Each half fails differently: a missing function or a missing policy makes the policy
    -- expression error and subscriptions stop; an anon-executable gate, or a DEFINER with no pinned
    -- search_path, is a privilege hole.
    v_gate   := to_regprocedure('public.can_access_realtime_topic(text)');
    IF v_gate IS NULL THEN
      v_anomalies := array_append(v_anomalies,
        'public.can_access_realtime_topic(text) no longer exists, so per-topic scope on every private channel is gone');
    ELSE
      SELECT p.prosecdef, array_to_string(p.proconfig, ',')
        INTO v_secdef, v_cfg
        FROM pg_proc p WHERE p.oid = v_gate;

      IF has_function_privilege(v_anon, v_gate, 'execute') THEN
        v_anomalies := array_append(v_anomalies,
          'anon can EXECUTE public.can_access_realtime_topic(text); the topic gate was revoked from anon deliberately');
      END IF;
      IF NOT v_secdef THEN
        v_anomalies := array_append(v_anomalies,
          'public.can_access_realtime_topic(text) is no longer SECURITY DEFINER, so its membership lookups now run as the subscribing role and will fail closed');
      END IF;
      IF v_cfg IS NULL OR v_cfg NOT LIKE '%search_path=public%' THEN
        v_anomalies := array_append(v_anomalies,
          format('SECURITY DEFINER function public.can_access_realtime_topic(text) has no pinned search_path (proconfig=%s)',
                 coalesce(v_cfg, 'NULL')));
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_policy p
                      WHERE p.polrelid = v_msgs AND p.polname = 'zmedico_private_topic_read'
                        AND p.polcmd = 'r'
                        AND pg_get_expr(p.polqual, p.polrelid) LIKE '%can_access_realtime_topic%') THEN
        v_anomalies := array_append(v_anomalies,
          'policy zmedico_private_topic_read (SELECT, gated on can_access_realtime_topic) is missing or no longer references the topic gate');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policy p
                      WHERE p.polrelid = v_msgs AND p.polname = 'zmedico_private_topic_send'
                        AND p.polcmd = 'a'
                        AND pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%can_access_realtime_topic%') THEN
        v_anomalies := array_append(v_anomalies,
          'policy zmedico_private_topic_send (INSERT, gated on can_access_realtime_topic) is missing or no longer references the topic gate');
      END IF;
    END IF;
  END IF;

  -- 4. The published set. RLS off, or anon gaining SELECT, is what converts the PUBLIC-role SELECT policies on
  -- published tables from inert into an anonymous row-image feed.
  FOR v_t IN
    SELECT c.relname, c.oid, c.relrowsecurity, c.relacl::text AS acl,
           has_table_privilege(v_anon, c.oid, 'SELECT') AS anon_select
      FROM pg_publication_tables pt
      JOIN pg_namespace n ON n.nspname = pt.schemaname
      JOIN pg_class c ON c.relname = pt.tablename AND c.relnamespace = n.oid
     WHERE pt.pubname = 'supabase_realtime'
     ORDER BY c.relname
  LOOP
    v_pub_n := v_pub_n + 1;
    IF NOT v_t.relrowsecurity THEN
      v_anomalies := array_append(v_anomalies,
        format('table %s is in the supabase_realtime publication with row security disabled, so every image it decodes is broadcast unfiltered',
               v_t.relname));
    END IF;
    IF v_t.anon_select THEN
      v_anomalies := array_append(v_anomalies,
        format('table %s is published and anon holds SELECT on it (relacl=%s), so its PUBLIC-role SELECT policies are reachable anonymously',
               v_t.relname, v_t.acl));
    END IF;
  END LOOP;

  IF array_length(v_anomalies, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'realtime exposure: %', array_to_string(v_anomalies, ' | ');
  END IF;

  SELECT string_agg(relname, ',' ORDER BY relname) INTO v_pub
    FROM (SELECT c.relname
            FROM pg_publication_tables pt
            JOIN pg_namespace n ON n.nspname = pt.schemaname
            JOIN pg_class c ON c.relname = pt.tablename AND c.relnamespace = n.oid
           WHERE pt.pubname = 'supabase_realtime') s;

  RETURN format(
    'realtime published=%s (%s), messages rls=%s policies=%s (anon=0), gate=can_access_realtime_topic(secdef=%s, anon_execute=false), messages anon_grants=[select=%s insert=%s update=%s delete=%s] authenticated=[select=%s insert=%s] (RLS and the authenticated-only policies, not the grant, are what deny anon here)',
    v_pub_n, coalesce(v_pub, '-'), v_msgs_rls::text,
    (SELECT count(*) FROM pg_policy WHERE polrelid = v_msgs),
    v_secdef::text,
    has_table_privilege(v_anon, v_msgs, 'SELECT')::text,
    has_table_privilege(v_anon, v_msgs, 'INSERT')::text,
    has_table_privilege(v_anon, v_msgs, 'UPDATE')::text,
    has_table_privilege(v_anon, v_msgs, 'DELETE')::text,
    has_table_privilege('authenticated', v_msgs, 'SELECT')::text,
    has_table_privilege('authenticated', v_msgs, 'INSERT')::text);
END;
$function$;

-- A health probe is not a client API. Same shape as assert_cron_health() and assert_storage_exposure(): off
-- PUBLIC, anon and authenticated, reachable by service_role so an operator can run it on demand.
REVOKE ALL ON FUNCTION public.assert_realtime_exposure() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_realtime_exposure() TO service_role;

DO $zmed298$
DECLARE
  v_job_id   bigint;
  v_schedule text;
  v_command  text;
  v_cmd      text := 'SELECT public.assert_realtime_exposure();';
  v_sched    text := '*/30 * * * *';
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'zmed298_pg_cron_missing: cron.job is not present in this database';
  END IF;
  IF to_regprocedure('public.assert_realtime_exposure()') IS NULL THEN
    RAISE EXCEPTION 'zmed298_function_missing: assert_realtime_exposure() was not created';
  END IF;

  SELECT jobid, schedule, command INTO v_job_id, v_schedule, v_command
    FROM cron.job WHERE jobname = 'realtime-exposure-sentry' LIMIT 1;

  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('realtime-exposure-sentry', v_sched, v_cmd);
  ELSIF v_command IS DISTINCT FROM v_cmd OR v_schedule IS DISTINCT FROM v_sched THEN
    -- Pin it to this file rather than letting a half-edited job keep running a different check.
    PERFORM cron.alter_job(job_id := v_job_id, schedule := v_sched, command := v_cmd);
  END IF;

  SELECT count(*) INTO v_job_id
    FROM cron.job
   WHERE jobname = 'realtime-exposure-sentry' AND active AND username = 'postgres'
     AND schedule = v_sched AND command = v_cmd;
  IF v_job_id <> 1 THEN
    RAISE EXCEPTION 'zmed298_job_not_registered_correctly: found % of 1', v_job_id;
  END IF;

  RAISE NOTICE 'zmed298 done sentry_job=% cron_jobs=% anon_client_execute=%',
    (SELECT jobid FROM cron.job WHERE jobname = 'realtime-exposure-sentry'),
    (SELECT count(*) FROM cron.job),
    has_function_privilege('authenticated', 'public.assert_realtime_exposure()', 'execute');
END
$zmed298$;
