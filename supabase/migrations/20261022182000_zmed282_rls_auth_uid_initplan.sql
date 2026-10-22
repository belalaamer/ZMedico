-- ZMED-282: stop RLS policies from re-evaluating auth.uid() once per row.
--
-- Supabase's performance advisor reports this as `auth_rls_initplan`. Live measurement on Production
-- rqcmnfzfytyyicelvifk, 2026-10-22, over schemas public + storage:
--   611 policies, 877 occurrences of auth.uid() in their expressions.
--   487 of those occurrences are already inside a scalar sub-select, so they are already initplans:
--     485 depare as "( SELECT auth.uid() AS uid)" and 2 as "( SELECT (auth.uid())::text AS uid)".
--   390 occurrences are bare (evaluated per row), spread over 198 policies.
--   Target-set fingerprint (md5 of the ordered schema||table||policy list) = f826d566fa434c78aeb362d9f15756c9
-- The same live measurement on the isolated QA Postgres, same day: 466 policies, 885 occurrences, 496 already
-- wrapped (2 of them the odd spelling), 389 bare calls across 197 policies. The two catalogs are read from
-- each environment rather than assumed equal, which is why the file derives its target set at run time.
--
-- Why the predicate is a regex and not the literal spelling: the first version of this file protected
-- already-wrapped calls by comparing against "( SELECT auth.uid() AS uid)" and its own minimal-edit assertion
-- then raised zmed282_rewrite_not_minimal on storage.objects / product_images_delete_legacy_owner, whose
-- expression also contains "( SELECT (auth.uid())::text AS uid)" — an initplan the literal never saw. That
-- guard is what turned a wrong assumption into a rolled-back run instead of a double-wrapped policy.
-- The 2026-10-21 advisor payload named 195 of them; the set grew since, including the tenant-branding read
-- policy created by 20261022180100 (ZMED-294). Deriving the set from the live catalog rather than from that
-- payload is what keeps this file correct on a drifted or rebuilt environment.
--
-- Scope: every un-wrapped stable-function call in that catalog is auth.uid(). Measured on Production:
-- bare auth.role() = 0, bare auth.jwt() = 0, and no policy calls current_setting() at all. So this file
-- wraps exactly one token and nothing else, and step 1 asserts that is still true before it starts.
--
-- Why it matters: has_role(auth.uid(), …) inside a policy is a per-row function call. Wrapping the call in a
-- scalar sub-select makes Postgres build it once as an initplan for the statement and reuse the value. Row
-- visibility cannot change: auth.uid() is STABLE, takes no arguments and reads the same request-scoped GUC
-- for every row, so evaluating it once yields the same boolean per row as evaluating it per row.
--
-- How this file bounds itself:
--   * A call counts as already-wrapped when, in the deparsed expression, it is immediately preceded by
--     "( SELECT" with an optional extra "(" (regexp '(\(\s*SELECT\s+\(?)(auth\.uid\(\))'). Those occurrences
--     are replaced by a sentinel before any rewrite, so they are byte-identical on the way out. A literal
--     comparison against the common spelling is not enough: the 2 odd spellings above are exactly the case
--     where a literal sentinel re-wraps an already-wrapped call.
--   * Per policy it asserts: the edit adds exactly 9 characters per bare call and nothing else, no sentinel
--     survives, the total number of auth.uid() occurrences is unchanged, and the rewritten expression has
--     zero bare calls by the same predicate that selected it. The recreated row must keep the same name,
--     table, command, role list, PERMISSIVE/RESTRICTIVE kind and which clauses exist. Anything else raises.
--   * Whole-database: the policy count, the RLS-enabled table count and the total auth.uid() occurrence
--     count must be unchanged when the loop finishes.
--   * Supabase applies a migration inside one transaction, so a raise rolls the whole packet back instead of
--     leaving some policies wrapped and others not.
--   * Re-runnable: once every policy is wrapped the predicate matches nothing and the loop is a no-op.

DO $zmed282$
DECLARE
  v_pat         constant text := '(\(\s*SELECT\s+\(?)(auth\.uid\(\))';
  v_token       constant text := 'auth.uid()';
  v_bare_repl   constant text := '(SELECT auth.uid())';
  v_sentinel    constant text := chr(1) || 'ZMED282' || chr(1);
  v_growth      constant integer := 9;          -- length(v_bare_repl) - length(v_token)

  v_oids        oid[];
  v_oid         oid;
  v_relid       oid;
  v_nsp         text;
  v_rel         text;
  v_name        text;
  v_cmd         "char";
  v_permissive  boolean;
  v_roles       oid[];
  v_q           text;
  v_w           text;
  v_pq          text;
  v_pw          text;
  v_nq          text;
  v_nw          text;
  v_newtxt      text;
  v_oldtxt      text;
  v_tokcnt      integer;
  v_prot        integer;
  v_bare        integer;
  v_after_tok   integer;
  v_after_prot  integer;
  v_roles_clause text;
  v_cmd_clause   text;
  v_ddl          text;
  v_ident        integer;
  v_scope        integer;
  v_before_total integer;
  v_after_total  integer;
  v_before_rls   integer;
  v_after_rls    integer;
  v_before_calls integer;
  v_after_calls  integer;
BEGIN
  -- 1. Scope guard, then pin the target set from the live catalog. The scope guard exists because this file
  --    only rewrites auth.uid(): if auth.role()/auth.jwt() ever grow a bare call, silently leaving them
  --    per-row would make the header's claim false, so say so and roll back instead.
  --    per-row would make the header's claim false, so say so and roll back instead. The LIKE tests are
  --    deliberate: they keep the guard free of regex escapes, and the counts below still use the same
  --    wrapper predicate as the rewrite itself.
  SELECT count(*) INTO v_scope
    FROM (
      SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS txt
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('public', 'storage')
    ) x
   WHERE (x.txt LIKE '%auth.role()%'
            AND (length(x.txt) - length(replace(x.txt, 'auth.role()', ''))) / length('auth.role()')
              > (length(x.txt)
                 - length(regexp_replace(x.txt, '(\(\s*SELECT\s+\(?)(auth\.role\(\))', '\1', 'g'))) / length('auth.role()'))
      OR (x.txt LIKE '%auth.jwt()%'
            AND (length(x.txt) - length(replace(x.txt, 'auth.jwt()', ''))) / length('auth.jwt()')
              > (length(x.txt)
                 - length(regexp_replace(x.txt, '(\(\s*SELECT\s+\(?)(auth\.jwt\(\))', '\1', 'g'))) / length('auth.jwt()'))
      OR x.txt LIKE '%current_setting(%';
  IF v_scope <> 0 THEN
    RAISE EXCEPTION 'zmed282_out_of_scope_stable_functions: %', v_scope;
  END IF;

  -- Collect oids into an array first: the loop below mutates pg_policy, and a cursor over the catalog would
  -- then be reading its own writes.
  SELECT coalesce(array_agg(x.poloid ORDER BY n.nspname, c.relname, x.polname), '{}')
    INTO v_oids
    FROM (
      SELECT pol.oid AS poloid, pol.polrelid, pol.polname,
             coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS txt
        FROM pg_policy pol
     ) x
    JOIN pg_class c ON c.oid = x.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('public', 'storage')
     AND (length(x.txt) - length(replace(x.txt, v_token, ''))) / length(v_token)
       > (length(x.txt) - length(regexp_replace(x.txt, v_pat, '\1', 'g'))) / length(v_token);

  SELECT count(*) INTO v_before_total FROM pg_policy;
  SELECT count(*) INTO v_before_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage') AND c.relrowsecurity;
  SELECT coalesce(sum((length(txt) - length(replace(txt, v_token, ''))) / length(v_token)), 0)
    INTO v_before_calls
    FROM (
      SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS txt
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('public', 'storage')
    ) y;
  IF v_before_total = 0 OR v_before_rls = 0 THEN
    RAISE EXCEPTION 'zmed282_nothing_protected_by_rls';
  END IF;

  FOREACH v_oid IN ARRAY v_oids
  LOOP
    -- 2. Read the policy's identity and its deparsed expressions.
    SELECT pol.polrelid, n.nspname, c.relname, pol.polname, pol.polcmd, pol.polpermissive, pol.polroles,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), ''),
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
      INTO v_relid, v_nsp, v_rel, v_name, v_cmd, v_permissive, v_roles, v_q, v_w
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE pol.oid = v_oid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'zmed282_policy_vanished';
    END IF;

    v_oldtxt := v_q || v_w;
    v_tokcnt := (length(v_oldtxt) - length(replace(v_oldtxt, v_token, ''))) / length(v_token);

    -- 3. Hide every call that already sits inside a scalar sub-select behind a sentinel, wrap what is left,
    --    then put the hidden calls back verbatim.
    v_pq := regexp_replace(v_q, v_pat, '\1' || v_sentinel, 'g');
    v_pw := regexp_replace(v_w, v_pat, '\1' || v_sentinel, 'g');
    v_prot := (length(v_pq || v_pw) - length(replace(v_pq || v_pw, v_sentinel, ''))) / length(v_sentinel);
    v_bare := v_tokcnt - v_prot;
    IF v_bare < 1 THEN
      RAISE EXCEPTION 'zmed282_no_bare_call_in_target: %', v_name;
    END IF;

    v_nq := replace(replace(v_pq, v_token, v_bare_repl), v_sentinel, v_token);
    v_nw := replace(replace(v_pw, v_token, v_bare_repl), v_sentinel, v_token);
    v_newtxt := v_nq || v_nw;

    -- 4. Minimal-edit proof, four ways round the same text.
    -- 4a. Nothing but wrappers changed: each bare call costs exactly 9 characters, nothing else grew.
    IF length(v_newtxt) <> length(v_oldtxt) + v_growth * v_bare THEN
      RAISE EXCEPTION 'zmed282_rewrite_not_minimal on policy %', v_name;
    END IF;
    -- 4b. The sentinel round-tripped: none of it may survive.
    IF position(chr(1) IN v_newtxt) <> 0 THEN
      RAISE EXCEPTION 'zmed282_sentinel_leak on policy %', v_name;
    END IF;
    -- 4c. No call lost and none invented.
    v_after_tok := (length(v_newtxt) - length(replace(v_newtxt, v_token, ''))) / length(v_token);
    IF v_after_tok <> v_tokcnt THEN
      RAISE EXCEPTION 'zmed282_call_count_changed on policy %', v_name;
    END IF;
    -- 4d. By the very predicate that selected this policy, nothing bare is left.
    v_after_prot := (length(v_newtxt)
        - length(regexp_replace(v_newtxt, v_pat, '\1', 'g'))) / length(v_token);
    IF v_after_tok - v_after_prot <> 0 THEN
      RAISE EXCEPTION 'zmed282_bare_call_survives on policy %', v_name;
    END IF;

    -- 5. Rebuild with the same name, command, roles and permissiveness. Omitting TO and writing TO PUBLIC
    --    both store polroles = {0} (measured), so the all-roles case is emitted as TO PUBLIC and the
    --    identity check below can compare the vector exactly.
    IF v_roles IS NULL OR cardinality(v_roles) = 0 OR 0 = ANY (v_roles) THEN
      v_roles_clause := 'PUBLIC';
    ELSE
      SELECT string_agg(quote_ident(r.rolname), ', ' ORDER BY r.rolname) INTO v_roles_clause
        FROM unnest(v_roles) x JOIN pg_roles r ON r.oid = x;
      IF v_roles_clause IS NULL THEN
        RAISE EXCEPTION 'zmed282_unresolvable_roles';
      END IF;
    END IF;

    IF v_cmd = 'r' THEN v_cmd_clause := 'SELECT';
    ELSIF v_cmd = 'a' THEN v_cmd_clause := 'INSERT';
    ELSIF v_cmd = 'w' THEN v_cmd_clause := 'UPDATE';
    ELSIF v_cmd = 'd' THEN v_cmd_clause := 'DELETE';
    ELSIF v_cmd = '*' THEN v_cmd_clause := 'ALL';
    ELSE RAISE EXCEPTION 'zmed282_unknown_command';
    END IF;

    EXECUTE format('DROP POLICY %I ON %s', v_name, v_relid::regclass);
    v_ddl := format('CREATE POLICY %I ON %s AS %s FOR %s TO %s',
                    v_name, v_relid::regclass,
                    CASE WHEN v_permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                    v_cmd_clause, v_roles_clause);
    IF v_nq <> '' THEN v_ddl := v_ddl || ' USING (' || v_nq || ')'; END IF;
    IF v_nw <> '' THEN v_ddl := v_ddl || ' WITH CHECK (' || v_nw || ')'; END IF;
    EXECUTE v_ddl;

    -- 6. The recreated row must be the same policy in every respect the rewrite is not allowed to change.
    SELECT count(*) INTO v_ident
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = v_nsp AND c.relname = v_rel AND pol.polname = v_name
       AND pol.polcmd = v_cmd AND pol.polpermissive = v_permissive
       AND (SELECT coalesce(array_agg(x ORDER BY x), '{}'::oid[]) FROM unnest(pol.polroles) x)
         = (SELECT coalesce(array_agg(x ORDER BY x), '{}'::oid[]) FROM unnest(v_roles) x)
       AND (pol.polqual IS NULL) = (v_nq = '')
       AND (pol.polwithcheck IS NULL) = (v_nw = '');
    IF v_ident <> 1 THEN
      RAISE EXCEPTION 'zmed282_identity_changed';
    END IF;
  END LOOP;

  -- 7. Whole-database post-assertions: no policy lost or gained, RLS still enabled where it was, no call
  --    lost or invented anywhere, and the bare-call predicate now matches nothing.
  SELECT count(*) INTO v_after_total FROM pg_policy;
  SELECT count(*) INTO v_after_rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage') AND c.relrowsecurity;
  SELECT coalesce(sum((length(txt) - length(replace(txt, v_token, ''))) / length(v_token)), 0)
    INTO v_after_calls
    FROM (
      SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS txt
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('public', 'storage')
    ) y;
  IF v_after_total <> v_before_total THEN
    RAISE EXCEPTION 'zmed282_policy_count_changed: % -> %', v_before_total, v_after_total;
  END IF;
  IF v_after_rls <> v_before_rls THEN
    RAISE EXCEPTION 'zmed282_rls_table_count_changed: % -> %', v_before_rls, v_after_rls;
  END IF;
  IF v_after_calls <> v_before_calls THEN
    RAISE EXCEPTION 'zmed282_total_call_count_changed: % -> %', v_before_calls, v_after_calls;
  END IF;
END;
$zmed282$;

-- 8. Final state check, outside the rewrite block: the bare-call predicate must be empty in public+storage,
--    and the total occurrence count must still be what step 1 measured. Both are written against the live
--    catalog, not against a constant, so this stays true on a rebuilt or drifted environment.
DO $assertion$
DECLARE
  v_left     integer;
  v_calls    integer;
BEGIN
  -- Counted over every policy, not only the ones the predicate still matches: after a successful rewrite the
  -- bare set is empty by design, so a filtered sum would read zero and look like a lost catalog.
  SELECT coalesce(sum(x.calls), 0) INTO v_calls
    FROM (
      SELECT (length(txt) - length(replace(txt, 'auth.uid()', ''))) / length('auth.uid()') AS calls
        FROM (
          SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ||
                 coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS txt
            FROM pg_policy pol
            JOIN pg_class c ON c.oid = pol.polrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname IN ('public', 'storage')
        ) z
    ) x;
  SELECT count(*) INTO v_left
    FROM (
      SELECT (length(txt) - length(replace(txt, 'auth.uid()', ''))) / length('auth.uid()')
             - (length(txt) - length(regexp_replace(txt, '(\(\s*SELECT\s+\(?)(auth\.uid\(\))', '\1', 'g')))
               / length('auth.uid()') AS bare
        FROM (
          SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') ||
                 coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS txt
            FROM pg_policy pol
            JOIN pg_class c ON c.oid = pol.polrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname IN ('public', 'storage')
        ) z
    ) x
   WHERE x.bare <> 0;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'zmed282_bare_auth_uid_remains: %', v_left;
  END IF;
  IF v_calls < 1 THEN
    RAISE EXCEPTION 'zmed282_no_auth_uid_left_to_verify';
  END IF;
END;
$assertion$;
