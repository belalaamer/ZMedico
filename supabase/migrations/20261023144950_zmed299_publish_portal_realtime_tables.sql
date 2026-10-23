-- ZMED-299: publish the two portal surfaces that have no fallback, and let the ZMED-298 monitor veto the result.
--
-- Owner decision 2026-10-23, option B of outputs/Realtime-Publication-Decision-2026-10-23.md: «نفّذ الاختيار B
-- للـ Realtime (نشر notifications و appointments فقط)». Not A: `products`, `inventory` and `stock_alerts` measure
-- 3 / 1 / 0 rows and their screens already reload on window focus, so publishing them would make every future RLS
-- edit on those three a live push path for no measured gain.
--
-- Measured on Production (ref rqcmnfzfytyyicelvifk) on 2026-10-23, read-only, before this file was written:
--
--   * assert_realtime_exposure() returns published=5 (physio_cases, physio_reassessments, physio_sessions,
--     queue_alert_runs, queue_alerts), messages rls=true policies=3 (anon=0), gate secdef=true anon_execute=false.
--   * Neither target is published today, so Topbar.tsx:104, Reminders.tsx:76, Sidebar.tsx:61 and
--     PendingBookings.tsx:96 subscribe successfully and can never receive an event. Those four are the only
--     surfaces in the app whose fallback is nothing: the notifications bell re-reads only at mount and
--     reconnect, and the 1s/30s intervals it shares the screen with drive a clock, not data. This is also the
--     in-app delivery channel of the ZMED-290 booking-expiry staff alert.
--   * Read paths, quoted from pg_policy. notifications: notif_select_own (own user_id plus branch scope, or admin,
--     or system_owner) AND RESTRICTIVE rls_hardening_notifications_recipient (user_id = auth.uid() or system_owner)
--     AND RESTRICTIVE zmedico_live_actor_boundary. appointments: appts_select_scoped (role in admin/doctor/nurse/
--     receptionist AND user_has_branch_access(branch_id)) plus manager_appts_select, AND RESTRICTIVE
--     rls_hardening_branch_scope AND RESTRICTIVE zmedico_live_actor_boundary. Realtime evaluates these as the
--     subscribing role, so publishing streams nothing the same JWT cannot already SELECT.
--   * relacl for both tables grants no SELECT to anon, which is the load-bearing half of that claim and is what
--     assertion 4 of the monitor pins.
--   * Row-change volume in the last 7 days on both: 0. Under DEFAULT replica identity an UPDATE or DELETE decodes
--     the primary key plus the filtered new tuple, so the WAL-decoding cost of this change is not measurable at
--     this traffic. DELETE payloads therefore carry only the PK; no client handler reads payload.old.
--
-- Why one transaction instead of one statement per commit: the migration API runs this file atomically, so the
-- preconditions, both ADDs and the post-change assertion either all hold or nothing is published. That is strictly
-- stronger than adding one table, committing, and checking after. The assertion runs LAST and outside any savepoint
-- on purpose: if the new published set would be unsafe, this migration aborts and Production keeps its old
-- membership. Rollback if ever needed is one line per table and touches no data, policy or grant:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.appointments;
--
-- No policy is created or dropped, no grant is issued or revoked, no row is read or written.

do $zmed299$
declare
  t          text;
  published  int;
begin
  -- The publication must be ours to alter. On Production pubowner is postgres, which is why these statements are
  -- executable here at all -- unlike realtime.messages, which postgres cannot alter because it is not a member of
  -- supabase_realtime_admin (proved 42501 on both QA and Production during ZMED-298).
  if (select p.pubowner::regrole::text from pg_publication p where p.pubname = 'supabase_realtime') is null then
    raise exception 'ZMED-299: publication supabase_realtime does not exist';
  end if;
  if (select p.pubowner::regrole::text from pg_publication p where p.pubname = 'supabase_realtime') <> 'postgres' then
    raise exception 'ZMED-299: supabase_realtime is not owned by postgres, refusing to alter it';
  end if;

  foreach t in array array['notifications', 'appointments'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t and c.relkind = 'r') then
      raise exception 'ZMED-299: public.% is not a table, refusing', t;
    end if;

    -- A published table with row security off would stream every row to any socket that subscribes.
    if not (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = t) then
      raise exception 'ZMED-299: public.% has row security disabled, refusing to publish it', t;
    end if;

    -- The grant, not the policy, is what keeps a polroles={0} (PUBLIC) policy anonymous-inert.
    if has_table_privilege('anon', format('public.%I', t), 'SELECT') then
      raise exception 'ZMED-299: anon holds SELECT on public.%, refusing to publish it', t;
    end if;

    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
               and schemaname = 'public' and tablename = t) then
      raise notice 'ZMED-299: public.% is already published, leaving it alone', t;
    else
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'ZMED-299: published public.%', t;
    end if;
  end loop;

  select count(*) into published from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public';

  -- Fail closed on the whole set, as it now stands. This is the same STABLE probe cron job 21 runs every 30
  -- minutes, so the reviewed membership and the monitor cannot ever disagree about what is safe.
  perform public.assert_realtime_exposure();

  raise notice 'ZMED-299: supabase_realtime now holds % public tables and the exposure assert passed', published;
end
$zmed299$;
