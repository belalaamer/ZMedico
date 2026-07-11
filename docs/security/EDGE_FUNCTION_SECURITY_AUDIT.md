# Edge Function Security Audit — Sprint 1 Hardening (Task 3)

**Date:** 2026-07-11  
**Scope:** All Supabase Edge Functions under `supabase/functions/`  
**Mode:** Read-only. No code, config, or database changes performed.  
**Auditor:** Lovable AI (Sprint 1 Hardening)

---

## Executive Summary

Seven edge functions were audited end-to-end: `admin-create-user`,
`admin-delete-user`, `admin-export`, `admin-reset-password`,
`detect-queue-alerts`, `enqueue-winback`, and `send-reminder`.

**Overall verdict: production safe (score 88 / 100).** No CRITICAL or HIGH
findings. Every privileged endpoint verifies identity from the JWT
(`auth.getUser()` / `auth.getClaims()`), re-checks admin authority
server-side via `user_roles` / `has_role`, and never trusts a
client-supplied user id. The service-role key is used only where required
and is never logged, returned, or echoed in a response. Cron-only
functions are gated by a shared secret or the service-role bearer.

A small number of MEDIUM / LOW defense-in-depth improvements are
recommended. None block production.

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 4 |
| LOW      | 5 |
| PASS     | — |

---

## Platform Baseline

`supabase/config.toml` contains only `project_id`. No per-function
`verify_jwt` overrides exist, so every function inherits the
Lovable-managed default (`verify_jwt = false`). This is intentional and
documented: Supabase's signing-keys system requires in-code JWT
validation, which every non-cron function performs via
`auth.getUser()` or `auth.getClaims()` before any privileged work.

CORS uses `Access-Control-Allow-Origin: *` on every function. Because
all admin endpoints require a valid `Authorization: Bearer <jwt>` header
that must have been issued by our own Supabase project, `*` does not
bypass authentication — the browser will not send credentials
cross-origin without the JWT, and a foreign origin cannot mint one.
CORS `*` is therefore acceptable but a defense-in-depth tightening
opportunity (LOW).

---

## Risk Matrix

| ID | Function | Finding | Severity | Recommendation |
|----|----------|---------|----------|----------------|
| E1 | admin-create-user | Generated password is returned in the HTTP response body | MEDIUM | Return a one-time reset link instead of the plaintext password, or require the admin to set the password client-side |
| E2 | admin-reset-password | Same as E1 for the reset flow | MEDIUM | Same as E1 |
| E3 | admin-export | Raw table dumps (up to 10 000 rows / table) with no pagination, no per-column redaction, no audit log entry | MEDIUM | Add an audit log row per export (actor, tables, row counts) and cap or paginate high-PHI tables (`patients`, `medical_records`) |
| E4 | send-reminder | No rate limiting on bulk-send path; a compromised admin token could trigger mass patient messaging | MEDIUM | Add a per-actor + per-branch rate limit and/or a `max_batch_size` bound |
| E5 | detect-queue-alerts | Falls back to `SEND_REMINDER_CRON_SECRET` when no dedicated secret is set; couples two schedulers to one secret | LOW | Provision a dedicated `DETECT_QUEUE_ALERTS_CRON_SECRET` and drop the fallback |
| E6 | All functions | CORS `Access-Control-Allow-Origin: *` | LOW | Restrict to the published app origin(s) via env var |
| E7 | admin-delete-user | No audit log row for the deletion; relies on downstream cascade | LOW | Insert an `admin_audit_log` row before calling `deleteUser` |
| E8 | admin-export | `Access-Control-Allow-Methods` is limited to `POST, OPTIONS`; other admin functions omit the header entirely (relying on browser default) | LOW | Standardise a shared CORS builder |
| E9 | send-reminder | Provider error text is returned to the caller (sanitised, truncated to 200 chars). Currently safe, but any future provider change could leak IDs / tokens | LOW | Keep sanitiser; add a regression test |

No CRITICAL or HIGH findings.

---

## Per-Function Review

### 1. `admin-create-user`

| Check | Status |
|-------|--------|
| verify_jwt | Platform default (false); in-code JWT verification via `userClient.auth.getUser()` |
| Identity source | Server-side (`getUser()`), never client-supplied |
| Admin authority | `admin.rpc("has_role", { _user_id, _role: "admin" })` |
| Service-role usage | Only for privileged writes; never logged or returned |
| CORS | `*` origin, standard headers |
| Input validation | Email regex-lite, role allow-list, branch requirement per role |
| Secrets logged? | No |
| Rate limiting | None |
| Rollback on failure | Yes — deletes auth user and allowlist row if staff-profile provisioning fails |

**Findings:** E1 (MEDIUM — password returned in body). Rollback logic is
correct and atomic. Role gate is enforced. Employee-id generation is
race-tolerant enough for the low-volume admin flow but is not a formal
transaction (LOW — acceptable given admin-only caller).

### 2. `admin-delete-user`

| Check | Status |
|-------|--------|
| verify_jwt | Platform default; in-code `getUser()` |
| Admin authority | `has_role(..., 'admin')` |
| Self-delete guard | Present (`target_user_id === userData.user.id` → 400) |
| Service-role usage | Confined to deletes |
| CORS | `*` |
| Input validation | Non-empty `user_id` required |
| Audit log | **Missing** (E7 LOW) |

### 3. `admin-export`

| Check | Status |
|-------|--------|
| verify_jwt | Platform default; in-code `getUser()` |
| Admin authority | Direct `user_roles` lookup for `role = 'admin'` |
| Allow-list | Hard-coded `ALLOWED_TABLES` set — good |
| Row cap | 10 000 per table |
| Audit log | **Missing** (E3 MEDIUM) |
| PHI exposure | Full dump of `patients` / `medical_records` returned in-band |
| Service-role usage | Correctly used; never returned |

### 4. `admin-reset-password`

| Check | Status |
|-------|--------|
| verify_jwt | Platform default; in-code `getUser()` |
| Admin authority | `has_role(..., 'admin')` |
| Input validation | Password ≥ 6 chars if supplied; else 14-char cryptographic random |
| Secrets logged? | No |
| Return payload | Includes plaintext password (E2 MEDIUM) |

### 5. `detect-queue-alerts`

| Check | Status |
|-------|--------|
| Caller class | Cron / internal |
| Auth | Shared `DETECT_QUEUE_ALERTS_CRON_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` bearer |
| Fallback secret | Falls back to `SEND_REMINDER_CRON_SECRET` (E5 LOW) |
| Service-role usage | Correct; writes only to `queue_alerts` and `queue_alert_runs` |
| Input validation | None required (no body accepted) |
| Secrets logged? | No |

### 6. `enqueue-winback`

| Check | Status |
|-------|--------|
| Caller class | Cron / internal |
| Auth | Shared `SEND_REMINDER_CRON_SECRET` or service-role bearer |
| Service-role usage | Correct; only enqueues into `reminders` |
| Input validation | Optional `branch_id`; defaulted `inactive_days` clamped ≥ 1 |
| Secrets logged? | No |
| Idempotency | Relies on DB unique constraint (comment: "unique-violation ignored"). Acceptable. |

### 7. `send-reminder`

| Check | Status |
|-------|--------|
| verify_jwt | Platform default; in-code `getClaims()` for user path, shared-secret for cron path |
| Identity source | JWT `sub` claim; admin role re-checked via `user_roles` |
| Authorization | Admin-only for both single and bulk send (previous regression fixed) |
| Service-role usage | Correct; scoped to reminder & config reads and status updates |
| SSRF guard | Present — https-only, blocks loopback / RFC1918 / link-local / CGNAT (IPv4) and loopback / ULA / link-local (IPv6) |
| Provider secrets | Bearer tokens forwarded only to validated URLs; never logged |
| Response body | Sanitises upstream error text to ≤ 200 chars, strips control chars |
| Rate limiting | **None** (E4 MEDIUM) |
| Input validation | Reminder shape is trusted from DB; body validated for known keys only |

---

## Cross-Cutting Observations

- **JWT verification.** Every authenticated endpoint uses either
  `auth.getUser()` (server round-trip) or `auth.getClaims(token)`
  (verified locally against the signing key). No endpoint accepts a
  `user_id` from the request body as identity.
- **Service-role handling.** The service-role key is read from env,
  bound to a dedicated `createClient` instance, and never appears in
  any response body or `console.log`.
- **Secret leakage.** No `console.log`, `console.error`, or response
  body was found that emits the service key, JWT, cron secret,
  provider token, or patient medical text. Provider error surfaces are
  sanitised.
- **Rate limiting / replay.** None of the functions implement rate
  limiting or idempotency keys. Cron functions rely on DB uniqueness;
  admin functions rely on the admin-role gate. Only `send-reminder`
  warrants an explicit rate limit (E4).
- **CORS.** Uniform `*` origin. Safe today because privileged calls
  require a JWT the browser will not forward cross-origin without an
  explicit `credentials: 'include'` + matching origin allow-list, but
  tightening is a cheap defense-in-depth win (E6).

---

## Recommended Fixes (Prioritised, not implemented)

1. **E1 / E2 (MEDIUM).** Replace plaintext-password returns in
   `admin-create-user` / `admin-reset-password` with a one-time reset
   link (`admin.generateLink('recovery', …)`) surfaced through the UI.
2. **E3 (MEDIUM).** Add an `admin_audit_log` row per export in
   `admin-export`; cap `patients` / `medical_records` at a lower row
   limit or require pagination.
3. **E4 (MEDIUM).** Add a per-actor + per-branch rate limit
   (e.g. `rl_touch` RPC) in `send-reminder` bulk path.
4. **E5 (LOW).** Provision `DETECT_QUEUE_ALERTS_CRON_SECRET` and drop
   the `SEND_REMINDER_CRON_SECRET` fallback.
5. **E6 (LOW).** Restrict CORS origins to the published app URL(s).
6. **E7 (LOW).** Audit-log admin deletions.
7. **E8 (LOW).** Standardise a single CORS builder across all
   functions.
8. **E9 (LOW).** Add a regression test around
   `sanitizeProviderError`.

---

## Production Readiness Score

**88 / 100 — production safe.**

Scoring rationale:

| Dimension | Score | Notes |
|-----------|-------|-------|
| Authentication | 20 / 20 | JWT verified in-code on every privileged call |
| Authorization | 19 / 20 | Admin gate enforced everywhere; `-1` for missing admin-delete audit log |
| Service-role hygiene | 20 / 20 | Never logged or returned |
| Input validation | 8 / 10 | Good on admin endpoints; `send-reminder` bulk lacks batch caps |
| Secret handling | 10 / 10 | No leakage |
| Rate limiting / abuse | 4 / 10 | Missing on `send-reminder` bulk |
| CORS | 4 / 5 | `*` origin is safe-in-context but should be tightened |
| Auditability | 3 / 5 | Admin mutations partially audited |

---

## Final Answer

**Can the current edge-function surface be considered production safe?**

> **Yes.** No CRITICAL or HIGH findings were identified. Every
> privileged endpoint verifies identity from the JWT, re-checks the
> admin role server-side, and never trusts a client-supplied
> identifier. The MEDIUM and LOW recommendations above are
> defense-in-depth improvements and should be scheduled as follow-up
> work; they do not block launch.

No code changes were made as part of this audit.