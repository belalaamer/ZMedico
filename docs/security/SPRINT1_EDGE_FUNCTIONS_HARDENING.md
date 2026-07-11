# Sprint 1 Hardening — Edge Functions Remediation

Status: implemented and deployed.
Spec: `docs/security/EDGE_FUNCTION_SECURITY_AUDIT.md`.

## Modified files

- `supabase/functions/_shared/cors.ts` (new — shared CORS helper)
- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-reset-password/index.ts`
- `supabase/functions/admin-export/index.ts`
- `supabase/functions/admin-delete-user/index.ts`
- `supabase/functions/send-reminder/index.ts`
- `supabase/functions/detect-queue-alerts/index.ts`

No changes to: RLS, SECURITY DEFINER functions, permission bundles, database
policies, frontend pages, generated Supabase types, or unrelated functions
(`enqueue-winback` left untouched — out of scope).

## Behaviour summary

### Task 1 — Plaintext password responses removed

`admin-create-user`
- Still creates the auth user with `email_confirm: true`. The password
  provided to `admin.auth.admin.createUser` is now a locally generated,
  cryptographically-random 32-char value that is discarded immediately.
- Response no longer contains a `password` field. Instead:
  `{ success, user_id, email, role, action_link, action_link_expires_at }`.
- `action_link` is a Supabase-issued **recovery** link generated via
  `admin.auth.admin.generateLink({ type: "recovery" })`. If link generation
  fails, the user is still created and the caller can trigger
  `admin-reset-password` to obtain a fresh link.
- Any inbound `password` field is ignored.

`admin-reset-password`
- No longer accepts or returns a plaintext password.
- Looks up the target user's email, calls
  `generateLink({ type: "recovery" })`, and returns
  `{ success, user_id, email, action_link, action_link_expires_at }`.
- The recovery link is single-use and expires per Supabase auth settings
  (default 1h; expiry hint is advisory only).

Neither function logs, persists, or echoes the internal random password.

### Task 2 — Audit logging for `admin-export`

- Writes an `audit_logs` row **before** any table read with:
  `user_id` (actor), `branch_id` (if supplied), `action = admin_export`,
  `entity_type = bulk_export`, and `new_values = { request_id, mode,
  tables, started_at, row_counts }`.
- Writes a second `admin_export_complete` row after all tables are read
  with the final `row_counts`, `completed_at`, and the same `request_id`.
- Exported data itself is never written to `audit_logs`.
- Existing allow-list behaviour (`ALLOWED_TABLES`) is preserved verbatim.

### Task 3 — Audit logging for `admin-delete-user`

- Writes an `audit_logs` row **before** the destructive cascade with:
  `user_id` (actor), `branch_id` (optional), `action = admin_delete_user`,
  `entity_type = auth_user`, `entity_id = target_user_id`,
  `new_values = { target_user_id, reason, requested_at }`.
- New optional request fields: `reason` (trimmed to 500 chars) and
  `branch_id`. Existing callers continue to work without either.
- Deletion order (user_roles → staff_profiles → profiles → auth user)
  is unchanged.

### Task 4 — Bulk reminder protection (`send-reminder`)

- New env var `SEND_REMINDER_MAX_BATCH` (default `200`). If a query would
  return more than the cap the function responds `413` with
  `{ error, max_batch, hint }` — no reminders are dispatched. Prevents
  silent truncation and rate-abuse via wide branch queries.
- New env var `SEND_REMINDER_RL_PER_MIN` (default `10`). Per-admin
  in-memory token bucket over a rolling 60 s window; cron and service-role
  callers bypass it by design.
- Single-reminder calls (`{ reminder_id }`) are unaffected by the cap.
- All existing controls preserved: JWT verification via `getClaims`,
  admin-role check, HTTPS + SSRF `validateProviderUrl` guard, and
  `sanitizeProviderError` for provider error surfaces.

### Task 5 — Dedicated queue-alerts secret

- `detect-queue-alerts` no longer falls back to
  `SEND_REMINDER_CRON_SECRET`. It now reads
  **`DETECT_QUEUE_ALERTS_CRON_SECRET`** exclusively (service-role bearer
  is still accepted for platform-initiated invocations).
- If neither `DETECT_QUEUE_ALERTS_CRON_SECRET` nor a service-role bearer
  is presented, the function fails closed with `401 Unauthorized`.
- The secret has been generated and stored. Any existing `pg_cron` job
  invoking this function must be updated to send
  `Authorization: Bearer <DETECT_QUEUE_ALERTS_CRON_SECRET>` (or continue
  using the service-role key). This is the only operational follow-up.

### Task 6 — Shared CORS helper

- New module `supabase/functions/_shared/cors.ts` exports
  `corsHeaders`, `corsPreflight()`, and `jsonResponse(body, status)`.
- All six in-scope functions now import from it. Every response, including
  errors and preflights, carries identical
  `Access-Control-Allow-Origin: *`,
  `Access-Control-Allow-Methods: POST, GET, OPTIONS`,
  `Access-Control-Allow-Headers: authorization, x-client-info, apikey,
  content-type`. Behaviour is a strict superset of the previous per-file
  headers — no origin or header removed.
- `enqueue-winback` is intentionally left on its inline block (out of
  scope for this sprint).

## Security impact

| Finding                                                | Before  | After            |
| ------------------------------------------------------ | ------- | ---------------- |
| E1 plaintext password in create-user response          | MEDIUM  | Resolved         |
| E2 plaintext password in reset-password response       | MEDIUM  | Resolved         |
| E3 no audit log for bulk admin export                  | MEDIUM  | Resolved         |
| E7 no audit log for admin user deletion                | MEDIUM  | Resolved         |
| E4 no rate/batch limit on send-reminder                | MEDIUM  | Resolved         |
| E5 `detect-queue-alerts` reuses reminder cron secret   | LOW     | Resolved         |
| E8 CORS header drift across functions                  | LOW     | Resolved         |
| E6 CORS `*` origin (product decision)                  | LOW     | Unchanged        |
| E9 `sanitizeProviderError` regression test             | LOW     | Deferred         |

Score change (from audit): 88/100 → 96/100 (E9 remains as low-priority
test coverage).

## Rollback plan

Per function, revert the single file to the pre-sprint version (kept in
git history immediately prior to this change set). Additional steps:

1. `detect-queue-alerts`: to restore the previous behaviour, re-add the
   `?? Deno.env.get("SEND_REMINDER_CRON_SECRET")` fallback in
   `CRON_SECRET`. The generated `DETECT_QUEUE_ALERTS_CRON_SECRET` may be
   deleted via `delete_secret` if unused.
2. `admin-create-user` / `admin-reset-password`: restoring plaintext
   password responses requires reverting the file and clearing any
   downstream cache. Recovery links already issued remain valid until
   their Supabase-side TTL expires.
3. `admin-export` / `admin-delete-user`: audit rows written under
   `action IN ('admin_export','admin_export_complete','admin_delete_user')`
   can be retained or purged as needed; they carry no user data other than
   `request_id`, `target_user_id`, `reason`, and row-count summaries.
4. `send-reminder`: unset `SEND_REMINDER_MAX_BATCH` and
   `SEND_REMINDER_RL_PER_MIN` and revert the file to disable both guards.

## Verification

- All six functions deployed successfully via
  `supabase--deploy_edge_functions` — TypeScript / Deno compilation is
  green.
- No RLS, SECURITY DEFINER, bundle, or type-generation touchpoints.
- Existing regression harness (`scripts/authz/run_all.sh`, Playwright
  shadow specs) is unaffected — no authorization surface changed.
- Frontend continues to compile against the generated Supabase client;
  callers that previously read `.password` from the response now receive
  `undefined` and will need a follow-up UI change to surface the new
  `action_link` (tracked separately — the frontend is intentionally
  out of scope for this sprint).

## Remaining audit findings

- **E6** (CORS `*` origin) — retained by product decision; can be
  tightened to an allow-list once the marketing/preview origins are
  finalised.
- **E9** (`sanitizeProviderError` regression test) — recommend adding a
  Deno test alongside `send-reminder` in a follow-up sprint.