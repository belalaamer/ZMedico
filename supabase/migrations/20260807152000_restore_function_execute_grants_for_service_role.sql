-- Applied live 2026-08-07 as migration restore_function_execute_grants_for_service_role.
--
-- Deleting a staff member, or a user from User Management, failed with
-- "Edge Function returned a non-2xx status code". The cause is mine.
--
-- On 2026-08-03 I restored the table privileges that had been wiped from this
-- database (migration restore_baseline_table_grants). That migration granted
-- TABLE privileges only. The wipe had also removed FUNCTION execute grants, and
-- I did not restore those. 117 of 149 functions in public were left not
-- executable by service_role.
--
-- admin-delete-user runs this with the service key:
--
--     const { data: isAdmin } = await admin.rpc("has_role", {...});
--     if (!isAdmin) return jsonResponse({ error: "Forbidden: admin only" }, 403);
--
-- service_role had no EXECUTE on has_role, so the RPC errored, `data` came back
-- null, isAdmin was falsy, and the function returned 403 -- before it wrote its
-- pre-deletion audit row. That matched every observation: the auth log showed the
-- function's own getUser() calls (so it ran), no audit row existed for the failed
-- attempts (so it stopped before that insert), and the last successful delete was
-- 2026-07-18, before the grants were lost.
--
-- The check itself was never wrong; it could not run. A permission check that
-- errors and is read as "false" fails closed, which is the safe direction, but it
-- is indistinguishable from a real refusal -- which is why this looked like an
-- authorization problem rather than a missing grant.
--
-- Restoring EXECUTE to service_role does NOT widen what any end user can do:
-- service_role is the server-side key held only by Edge Functions, never shipped
-- to a browser. Row-level security and every SECURITY DEFINER guard are unchanged.
-- Verified after applying, as service_role: has_role(owner,'admin') = true,
-- has_role(receptionist,'admin') = false. The gate still refuses the right people.

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Keep it that way for functions added from here on, so the same gap cannot
-- reopen silently the next time someone writes a function.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
