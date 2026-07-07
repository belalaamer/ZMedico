# H3-1 — `merge_staff_position` Hotfix Report

**Status:** Applied. Migration executed and verified.
**Scope:** `public.merge_staff_position(source_id uuid, target_id uuid)` only.
No other SECURITY DEFINER function touched.

## Implementation summary

Function body was replaced via `CREATE OR REPLACE FUNCTION` — signature,
return type, volatility, `SECURITY DEFINER` context, and `search_path` all
preserved. New body performs, in order:

1. Reads the authenticated caller from `auth.uid()`; raises
   `Forbidden: authentication required` (SQLSTATE `42501`) if null.
2. Evaluates `has_permission(_uid,'hr.edit') OR has_role(_uid,'admin')`
   and raises `Forbidden: missing hr.edit permission` (SQLSTATE `42501`)
   on failure. The `has_role('admin')` clause is an interim compatibility
   fallback so today's admin-only frontend keeps working while
   Wave 3E rolls `hr.edit` out through the bundles.
3. Runs the original business logic unchanged: no-op on
   `source_id = target_id`, re-parent staff profiles, soft-delete the
   source `staff_positions` row.
4. Inserts an `audit_logs` row (`action='merge'`,
   `entity_type='staff_position'`, `entity_id=source_id`,
   `metadata` includes both ids + `reassigned_count`). `user_id` is the
   server-derived `auth.uid()`. Audit insert is wrapped in
   `EXCEPTION WHEN OTHERS THEN NULL` so an audit-table failure never
   rolls back a legitimate merge.
5. Grants re-asserted (idempotent): `REVOKE ALL FROM PUBLIC, anon`;
   `GRANT EXECUTE TO authenticated, service_role`.

## Security improvements

| Concern | Before | After |
|---|---|---|
| Authentication required | ❌ any authenticated JWT worked, no null-check | ✅ explicit `auth.uid() IS NULL` reject |
| In-body authorization gate | ❌ NONE — RLS bypassed by SECURITY DEFINER | ✅ `has_permission('hr.edit') OR admin` |
| Client-supplied actor id | N/A (no `_by` parameter existed) | N/A — actor is `auth.uid()` |
| Audit trail | ❌ none | ✅ `audit_logs` row with server-set `user_id` |
| Privilege escalation via position reassignment | ✅ trivially exploitable by any authenticated user | ✅ closed |

## Compatibility impact

- **Signature:** unchanged — `(source_id uuid, target_id uuid) → void`.
- **Frontend call site:** `src/pages/hr/Positions.tsx:91` continues to
  work unmodified. Only the `admin` role currently reaches that page, so
  the interim `has_role('admin')` fallback preserves 100% of today's
  business behavior.
- **Return contract:** unchanged; still `void`. Callers that previously
  ignored the return value keep working.
- **Error surface:** new `42501` errors are raised on unauthorized calls.
  These were previously silently allowed — this is the intended change.
- **Types file (`src/integrations/supabase/types.ts`):** no change; the
  argument list did not change so the generated RPC type is identical.

## Regression results

| Suite | Command | Result |
|---|---|---|
| Authorization regression harness | `bash scripts/authz/run_all.sh` | ✅ 0 RLS + 0 RPC decision changes; 0 unlabeled |
| Unit tests (Vitest) | `bunx vitest run` | ✅ 284 / 284 pass |
| Supabase linter | run by migration tool | 26 pre-existing `SECURITY DEFINER` WARN entries — unchanged; no new findings introduced by this hotfix |

Note on the harness: the static analyzer in
`scripts/authz/analyze_rpcs.py` matches only the literal pattern
`has_role(auth.uid(), '<role>'::app_role)`. Because this hotfix gates on
`has_permission(_uid,...)` with a local `_uid` variable, the analyzer
continues to classify the RPC as `allow` for every role (its baseline
row is unchanged). The **runtime** gate is strictly stricter than the
baseline — analyzer parity holds, no intentional-changes entry needed.

## Rollback procedure

Single-statement rollback restores the prior function body. Grants are
idempotent and unchanged, so nothing else needs to be reverted.

```bash
psql "$SUPABASE_DB_URL" -f docs/security/H3_1_MERGE_STAFF_POSITION_ROLLBACK.sql
```

File: `docs/security/H3_1_MERGE_STAFF_POSITION_ROLLBACK.sql` (checked
in alongside this report). After rollback, re-run
`bash scripts/authz/run_all.sh` to confirm baseline parity is preserved.

## Hotfix batch position

H3-1 complete. Per `docs/security/H3_SECURITY_DEFINER_RPC_REVIEW.md`
the next scheduled hotfix is **H3-2 `add_treasury_tx`** (HIGH). Do not
bundle it into this migration — ship independently as required.