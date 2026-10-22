-- F-6 (ZMED-278/282 follow-up): version the public-booking throttle that Production has always
-- run and the repository has never contained.
--
-- STATUS OF THIS FILE: staged only. It has NOT been applied to Production and does not need to
-- be — Production already holds every object below. It is written so a rebuilt environment
-- produces the same objects, and so the existing published history becomes replayable.
--
-- Why the version number is 20261018140000, i.e. deliberately *older* than several applied
-- Production migrations: the published tip file
-- `20261018142245_enforce_live_actor_data_boundary.sql` ends with
--     create policy zmedico_live_actor_boundary on "public"."public_booking_rate_limits"
--       as restrictive for all to authenticated ...
-- and `public_booking_rate_limits` is created by **no** migration (tip-wide `git grep` for
-- `public_booking_rate_limits` returns that one file, and for `consume_public_booking_rate_limit`
-- returns nothing). So on a fresh database, replaying the repo's own history aborts at
-- 20261018142245 with `relation "public.public_booking_rate_limits" does not exist`. This file
-- must sort before it for that history to run at all. Applying it to Production is a no-op by
-- construction (every statement is guarded), but it should still be reviewed by name before any
-- `supabase db push` — bulk replay remains prohibited by the standing brief.
--
-- Everything here is copied from live Production `rqcmnfzfytyyicelvifk` reads taken
-- 2026-10-22, not from a design document:
--   pg_get_functiondef  -> the function body verbatim, SECURITY DEFINER, search_path='public'
--   pg_attribute        -> 4 columns, all NOT NULL, defaults clock_timestamp()/0/clock_timestamp()
--   pg_constraint       -> PRIMARY KEY (key_hash), CHECK (attempt_count >= 0)
--   pg_indexes          -> the pkey plus public_booking_rate_limits_updated_at_idx (btree on
--                          updated_at), which job `cleanup-public-booking-rate-limits` needs to
--                          delete 48-h-old rows without a sequential scan
--   pg_class.relacl     -> {postgres=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--   pg_proc.proacl      -> {postgres=X/postgres, service_role=X/postgres}
--   pg_class            -> relrowsecurity = true, relforcerowsecurity = false
--
-- Two measured notes that contradict an earlier draft of the F-6 finding, recorded so nobody
-- re-reports them:
--   1. There is NO `anon` or `authenticated` EXECUTE grant on this function. The live ACL is
--      exactly the two entries above, so the throttle is not reachable from PostgREST; only a
--      service-role caller (the `public-booking-submit` Edge Function) can invoke it.
--   2. The restrictive policy attached by 20261018142245 targets `authenticated`, a role that
--      holds no table privilege here, so it can never be exercised — RLS narrows an existing
--      grant, it never creates one. It is reproduced below only because it is what Production
--      actually holds; it is not load-bearing.
--
-- `key_hash` is a misnomer and this migration does not fix it: the function inserts `p_key`
-- unchanged (`VALUES (p_key, v_now, 1, v_now)`), so whatever the caller passes is persisted in
-- plain text and is the unique key. Renaming or hashing it changes behaviour and is a separate,
-- authorized decision.

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = 'public_booking_rate_limits' AND c.relkind = 'r') THEN
    CREATE TABLE public.public_booking_rate_limits (
      key_hash text NOT NULL,
      window_started_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
      attempt_count integer NOT NULL DEFAULT 0,
      updated_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT public_booking_rate_limits_pkey PRIMARY KEY (key_hash),
      CONSTRAINT public_booking_rate_limits_attempt_count_check CHECK (attempt_count >= 0)
    );
    CREATE INDEX public_booking_rate_limits_updated_at_idx
      ON public.public_booking_rate_limits USING btree (updated_at);
  END IF;
END
$migration$;

-- Owner, RLS flags and ACL, re-stated idempotently. ALTER DEFAULT PRIVILEGES in this project
-- hands new tables to anon/authenticated/service_role, so the revoke has to run after the
-- create rather than trusting whatever the environment seeded.
ALTER TABLE public.public_booking_rate_limits OWNER TO postgres;
ALTER TABLE public.public_booking_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_booking_rate_limits NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_booking_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.public_booking_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_public_booking_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_count integer;
BEGIN
  IF p_key IS NULL OR length(p_key) < 16
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.public_booking_rate_limits AS r (
    key_hash, window_started_at, attempt_count, updated_at
  )
  VALUES (p_key, v_now, 1, v_now)
  ON CONFLICT (key_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN r.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        THEN v_now
      ELSE r.window_started_at
    END,
    attempt_count = CASE
      WHEN r.window_started_at + make_interval(secs => p_window_seconds) <= v_now
        THEN 1
      ELSE r.attempt_count + 1
    END,
    updated_at = v_now
  RETURNING attempt_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_public_booking_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_booking_rate_limit(text, integer, integer) TO service_role;
