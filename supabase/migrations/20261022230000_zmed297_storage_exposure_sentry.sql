-- ZMED-297: make the storage exposure surface impossible to change silently.
--
-- Why this exists. The P-3 investigation (outputs/P-3-storage-anon-reach-2026-10-22.json,
-- work/p3-storage-anon-reach.mjs) settled what an anonymous caller can reach on Production
-- rqcmnfzfytyyicelvifk today, and the answer is good: listing returns [] and the metadata tables are not
-- even exposed, so nothing can be enumerated. But it also showed that the whole posture rests on three
-- dashboard flags that no reviewed migration asserts, and that a change to them is invisible until a
-- customer notices a broken image or a leak. That is S-1/P-8 in the ZMED-280 report, and the fix is a
-- monitor, not a config edit.
--
-- Measured 2026-10-22, all of it read-only:
--
--   storage.buckets  product-images  public=true  5242880  jpeg,png,webp,gif            0 objects
--                    tenant-branding public=true  2097152  png,jpeg,webp,x-icon,ms-icon 2 objects
--                    patient-docs    public=false 20971520 jpeg,png,webp,gif,pdf,dicom  0 objects
--   pg_policy        12 policies on storage.objects, and every one of them carries roles = {authenticated}:
--                    patient_docs select/insert/update/delete, product_images insert x2 + delete x2
--                    (no select, no update), tenant_branding read/insert/update. Plus
--                    zmedico_live_actor_boundary (authenticated, *, RESTRICTIVE), which only narrows.
--   table acl        storage.objects relrowsecurity=true, relforcerowsecurity=false; anon and authenticated
--                    hold table-level SELECT, so RLS is the only thing standing between them and the rows.
--   anon over HTTP   GET /storage/v1/object/public/product-images/<uuid>.png -> 404 NoSuchKey (the route is
--                    open: a public bucket serves any exact path, RLS is not consulted);
--                    GET /storage/v1/object/public/patient-docs/<same> -> "Bucket not found" (private buckets
--                    are not served on the public route at all);
--                    POST /storage/v1/object/list/product-images -> 200 [] and the same for patient-docs;
--                    GET /rest/v1/objects and /rest/v1/buckets -> 404 PGRST205, PostgREST does not expose the
--                    storage schema to anon.
--   the only writer   src/pages/inventory/Products.tsx:82 uploads `crypto.randomUUID() + '.' + ext`, i.e. a
--                    flat unguessable name in a world-readable bucket. That is what makes public=true
--                    tolerable today, and it is also why the *_legacy_owner policies are the live ones, not
--                    dead weight.
--
-- What the monitor asserts, and what it deliberately does not.
--   1. Only product-images and tenant-branding may be public. patient-docs holds medical files, and a single
--      dashboard toggle flipped in the wrong direction would hand every object to anyone who has a path —
--      the one failure mode here that cannot be undone after the fact.
--   2. A public bucket must not accept a content type a browser will run as a document. image/svg+xml in
--      tenant-branding is exactly how ZMED-280 became stored XSS on a world-readable bucket, and a NULL
--      allowed_mime_types means "anything goes", which is how it got there in the first place. This checks
--      the class, not the one value.
--   3. No policy on storage.objects may name anon or PUBLIC. Production has zero such policies now; the
--      anon-listable tenant_branding_assets_public_read that ZMED-294 removed still exists on QA, which is
--      a real instance of the drift this catches rather than a hypothetical one.
--   It does NOT freeze file_size_limit or the mime lists themselves — those are tuning, they drift
--   legitimately, and they are enforced at write time anyway. An alert that fires for ordinary maintenance
--   is an alert nobody reads.
--
-- Delivery, mirroring ZMED-291 exactly: the anomaly is a RAISE EXCEPTION, so it lands in
-- cron.job_run_details as a failed run with the text, and public.assert_cron_health() (job 17, every 15
-- minutes) reports any job other than itself that failed inside 2 hours. So this job needs no new alerting
-- channel and is watched by the monitor that already watches the scheduler.
--
-- Register-only and read-only: no GRANT, no REVOKE against a client role beyond taking this one function
-- away from anon/authenticated, no policy change, no bucket touched, no object read or written. The function
-- is SECURITY INVOKER like assert_cron_health() and reads storage.buckets the same way: as the job runner,
-- which is username=postgres, the superuser that pg_cron already uses for every job on this project.

CREATE OR REPLACE FUNCTION public.assert_storage_exposure()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_anomalies text[] := '{}';
  v_bucket    record;
  v_pol       record;
  v_bad       text;
BEGIN
  -- 1 + 2. Every public bucket, checked against the reviewed allowlist and against browser-executable types.
  FOR v_bucket IN
    SELECT b.id, b.allowed_mime_types
      FROM storage.buckets b
     WHERE b.public
     ORDER BY b.id
  LOOP
    IF v_bucket.id NOT IN ('product-images', 'tenant-branding') THEN
      v_anomalies := array_append(v_anomalies,
        format('bucket %s is public but is not on the reviewed public allowlist (product-images, tenant-branding)',
               v_bucket.id));
    END IF;

    IF v_bucket.allowed_mime_types IS NULL THEN
      v_anomalies := array_append(v_anomalies,
        format('public bucket %s has no allowed_mime_types, so it accepts any content type', v_bucket.id));
    ELSE
      SELECT string_agg(m, ',') INTO v_bad
        FROM unnest(v_bucket.allowed_mime_types) m
       WHERE m IN ('image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml');
      IF v_bad IS NOT NULL THEN
        v_anomalies := array_append(v_anomalies,
          format('public bucket %s accepts browser-executable content type(s): %s', v_bucket.id, v_bad));
      END IF;
    END IF;
  END LOOP;

  -- 3. anon or PUBLIC must hold no policy on the object table. Table-level SELECT is already granted to
  --    both roles, so a policy naming them is the difference between "[] and nothing to enumerate" and a
  --    full listing of every bucket, including patient documents.
  FOR v_pol IN
    SELECT p.polname,
           CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                         WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                         WHEN 'D' THEN 'TRUNCATE' WHEN '*' THEN 'ALL'
                         ELSE p.polcmd::text END AS cmd,
           (SELECT string_agg(coalesce(r.rolname, 'PUBLIC'), ',')
              FROM unnest(p.polroles) rid LEFT JOIN pg_roles r ON r.oid = rid) AS roles
      FROM pg_policy p
     WHERE p.polrelid = 'storage.objects'::regclass
       AND EXISTS (SELECT 1 FROM unnest(p.polroles) rid
                    WHERE rid = coalesce(to_regrole('anon'), 0::oid) OR rid = 0::oid)
  LOOP
    v_anomalies := array_append(v_anomalies,
      format('policy %s (%s, roles=%s) on storage.objects names anon or PUBLIC; every reviewed storage policy is authenticated-only',
             v_pol.polname, v_pol.cmd, v_pol.roles));
  END LOOP;

  IF array_length(v_anomalies, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'storage exposure: %', array_to_string(v_anomalies, ' | ');
  END IF;

  RETURN format('storage buckets=%s (public=%s), objects=%s, storage.objects policies=%s (anon=0)',
    (SELECT count(*) FROM storage.buckets),
    (SELECT count(*) FROM storage.buckets WHERE public),
    (SELECT count(*) FROM storage.objects),
    (SELECT count(*) FROM pg_policy WHERE polrelid = 'storage.objects'::regclass));
END;
$function$;

-- A health probe is not a client API. Same shape as assert_cron_health(): off PUBLIC, anon and
-- authenticated, reachable by service_role so an operator can run it on demand.
REVOKE ALL ON FUNCTION public.assert_storage_exposure() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_storage_exposure() TO service_role;

DO $zmed297$
DECLARE
  v_job_id   bigint;
  v_schedule text;
  v_command  text;
  v_cmd      text := 'SELECT public.assert_storage_exposure();';
  v_sched    text := '*/30 * * * *';
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'zmed297_pg_cron_missing: cron.job is not present in this database';
  END IF;
  IF to_regprocedure('public.assert_storage_exposure()') IS NULL THEN
    RAISE EXCEPTION 'zmed297_function_missing: assert_storage_exposure() was not created';
  END IF;

  SELECT jobid, schedule, command INTO v_job_id, v_schedule, v_command
    FROM cron.job WHERE jobname = 'storage-exposure-sentry' LIMIT 1;

  IF v_job_id IS NULL THEN
    PERFORM cron.schedule('storage-exposure-sentry', v_sched, v_cmd);
  ELSIF v_command IS DISTINCT FROM v_cmd OR v_schedule IS DISTINCT FROM v_sched THEN
    -- Pin it to this file rather than letting a half-edited job keep running a different check.
    PERFORM cron.alter_job(job_id := v_job_id, schedule := v_sched, command := v_cmd);
  END IF;

  SELECT count(*) INTO v_job_id
    FROM cron.job
   WHERE jobname = 'storage-exposure-sentry' AND active AND username = 'postgres'
     AND schedule = v_sched AND command = v_cmd;
  IF v_job_id <> 1 THEN
    RAISE EXCEPTION 'zmed297_job_not_registered_correctly: found % of 1', v_job_id;
  END IF;

  RAISE NOTICE 'zmed297 done sentry_job=% cron_jobs=% anon_client_execute=%',
    (SELECT jobid FROM cron.job WHERE jobname = 'storage-exposure-sentry'),
    (SELECT count(*) FROM cron.job),
    has_function_privilege('authenticated', 'public.assert_storage_exposure()', 'execute');
END
$zmed297$;
