# Production Deployment Guide

**Project:** ZMedico (belalaamer.com)
**Prepared by:** Release Manager / QA Lead
**Date:** 2026-07-12
**Status Basis:** Production Score 87/100, 0 Critical, 0 High

This is the single source of truth for launching ZMedico into production. It supersedes ad-hoc launch notes.

---

## 1. Release Checklist (Platform)

| Area | Item | Expected State | Owner |
|------|------|----------------|-------|
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` in project `.env` | Present, non-empty, points to prod backend | Eng |
| Env vars | No `service_role` key anywhere in `src/*` | Confirmed via grep | Eng |
| Backend | Lovable Cloud project attached and active | Backend view shows green | Eng |
| Backend | RLS enabled on every user-facing table | Verified in Sprint 1 audit | Eng |
| Backend | `SECURITY DEFINER` least-privilege grants | Verified in Sprint 1 Task 2 report | Eng |
| Edge Functions | `admin-create-user`, `admin-delete-user`, `admin-reset-password`, `admin-export`, `send-reminder`, `detect-queue-alerts`, `enqueue-winback` deployed | Latest revisions live | Eng |
| Edge Functions | `verify_jwt` matches audit classification (admin/authenticated/cron) | Per `docs/security/SPRINT1_EDGE_FUNCTIONS_HARDENING.md` | Eng |
| Edge Functions | `SUPABASE_SERVICE_ROLE_KEY` only used inside functions | Confirmed | Eng |
| Secrets | `CRON_SECRET` set for `detect-queue-alerts` | Present in runtime secrets | Ops |
| Secrets | Reminder provider secrets (WhatsApp / SMS) set if reminders enabled | Present or feature disabled | Ops |
| Database | Automatic daily backups enabled (Lovable Cloud default) | Confirmed in Backend view | Ops |
| Database | Point-in-time snapshot taken immediately before cut-over | Snapshot ID recorded | Ops |
| Cron | `detect-queue-alerts` schedule active | Cron entry present, last-run recent | Ops |
| Cron | Email queue `process-email-queue` on-demand wake trigger active (if email enabled) | Present or emails disabled | Ops |
| Auth | Email/password enabled; Google OAuth configured with production redirect URIs | `belalaamer.com`, `www.belalaamer.com`, published preview URL all listed | Eng |
| Auth | Password HIBP check enabled | Toggled on | Eng |
| Auth | No anonymous sign-ups; no auto-confirm | Confirmed | Eng |
| Auth | Session persistence `localStorage` (Supabase default) — accepted risk L3 | Accepted | Eng |
| Storage | Buckets used by app (if any) have RLS policies | Verified | Eng |
| Email | Sender domain (if branded email enabled) status = `active`; SPF/DKIM/MX verified | Verified in Cloud → Emails | Ops |
| SMS / WhatsApp | Provider credentials configured; test message succeeds | Confirmed | Ops |
| Monitoring | M1 (Sentry/PostHog) — deferred per Sprint 3 report | Deferred, tracked | Eng |
| Logging | Edge function logs reachable via Backend view | Confirmed | Ops |
| Alerts | Cron-failure alert channel (email/Slack) subscribed to `detect-queue-alerts` | Subscribed | Ops |
| DNS | `belalaamer.com` A → 185.158.133.1; `www` A → 185.158.133.1; `_lovable` TXT verified | Verified | Ops |
| DNS | Email subdomain NS delegation intact (if branded email in use) | Verified | Ops |
| HTTPS | SSL certificates active on `belalaamer.com` and `www.belalaamer.com` | Verified in Domains view | Ops |
| Domain | Primary domain set to `belalaamer.com`; `www` redirects to primary | Confirmed | Ops |
| CDN | Lovable edge / Cloudflare proxy mode (if used) configured | As designed | Ops |
| Browser | Latest Chrome, Edge, Safari, Firefox smoke-tested on desktop and iOS Safari + Android Chrome | Passed manual QA §3 | QA |

---

## 2. Operational Checklist (Launch Day)

### 2.1 First deployment (T-0)

1. Freeze code: no merges until go-live confirmed.
2. Take a manual database snapshot; record snapshot ID and timestamp.
3. Confirm all items in §1 are green.
4. Deploy frontend via **Publish** button in Lovable (Update).
5. Confirm edge functions are on latest revision (already auto-deployed on save).
6. Verify custom domain resolves to the new build (hard-refresh `belalaamer.com`).
7. Run smoke tests §2.3.
8. Announce go-live to ops channel with build hash and timestamp.

### 2.2 Rollback

**Frontend rollback:**
1. In Lovable → Project → Version history, select the previous known-good version.
2. Publish that version.
3. Verify `belalaamer.com` serves the previous build (check footer/version tag or browser dev-tools bundle hash).

**Edge function rollback:**
1. In the Backend view → Edge Functions, roll back the affected function to the previous revision.
2. Confirm via a synthetic call (e.g. `send-reminder` with a test payload).

**Database rollback:**
1. Restore from the pre-deployment snapshot recorded in §2.1 step 2.
2. Data written between snapshot and rollback will be lost — communicate window to stakeholders before restoring.
3. Only proceed if a Critical data-integrity issue is confirmed.

### 2.3 Smoke tests (run within 15 min of go-live)

1. Load `https://belalaamer.com` → auth page renders, no console errors, no 4xx/5xx in network tab for critical assets.
2. Sign in with an admin test account → dashboard loads within 3 s.
3. Open Patients, Invoices, Medical Records, Queue → each list paginates without error.
4. Create a test appointment → visible in Calendar and Queue.
5. Create a test invoice → detail view opens, PDF export downloads.
6. Trigger a reminder from Reminders page → edge function returns 2xx.
7. Sign out → redirected to `/auth`.
8. Delete the test data.

### 2.4 Health checks

- Backend view: green.
- Edge function logs: no 5xx spikes in the last 15 minutes.
- Cron `detect-queue-alerts`: last-run timestamp fresh.
- Domain status: `Active`.

### 2.5 Monitoring after deployment (first 24 h)

- On-call engineer reviews edge function logs every 2 h during business hours.
- Track database CPU and connection count in the Backend view.
- Watch for any new user reports in the support channel.

### 2.6 Incident response

| Severity | Definition | Response time | Action |
|----------|-----------|--------------|--------|
| SEV-1 | App down, auth broken, data loss | 15 min | Roll back frontend; escalate to eng lead; open incident channel. |
| SEV-2 | A single business flow broken (invoicing, queue, reminders) | 1 h | Toggle feature off if possible; hot-fix or roll back the specific edge function. |
| SEV-3 | Cosmetic or non-blocking bug | Next business day | File ticket; batch with next release. |

### 2.7 Backup verification

- Within 24 h of launch, perform a test restore of the daily backup into a scratch environment; verify row counts on `patients`, `invoices`, `medical_records`. Do not restore into production.
- Repeat quarterly.

---

## 3. Manual QA Checklist (Tester-Executable)

Perform each scenario end-to-end. Reset test data after every run. Use a dedicated QA tenant/branch.

### 3.1 Authentication
1. Navigate to `/auth`. Sign up with a new email + password → email verification enforced.
2. Sign in with wrong password → error message displayed, no crash.
3. Sign in with correct credentials → redirected to dashboard.
4. Click "Forgot password" → reset email arrives → complete reset → sign in with new password.
5. Sign in with Google → account linked, dashboard loads.
6. Refresh page while logged in → session persists (no redirect flash).
7. Sign out → `/auth` reached; back button does not restore session.

### 3.2 Patients
1. Create a new patient with all required fields → appears in list.
2. Search by name and by phone → correct result.
3. Open patient profile → all tabs (dental, medical, invoices) load.
4. Edit patient contact info → save → refresh → change persists.
5. Paginate list past page 1 → results load; pager shows correct total.
6. Attempt patient action without permission (as `receptionist` for a doctor-only action) → action denied gracefully.

### 3.3 Appointments & Calendar
1. Create an appointment for a patient with a specific doctor and time.
2. View in Calendar (day/week/month) → appointment visible.
3. Drag/reschedule (if enabled) → time updates and persists.
4. Cancel appointment → status changes; audit log records action.
5. Create conflicting appointment for same doctor same slot → warning displayed.

### 3.4 Queue
1. Check patient in from appointment → appears in queue.
2. Call next patient → status advances.
3. Trigger queue alert threshold (long wait) → alert appears; `detect-queue-alerts` cron logs entry.
4. Complete visit → patient exits queue.

### 3.5 Medical Records
1. Start a consultation from queue → editor opens.
2. Add diagnosis, medication, procedure → save.
3. Print/export prescription PDF → downloads cleanly, contains all entered data.
4. Re-open record → all data present.
5. Attempt access as an unauthorized role → blocked.

### 3.6 Invoices
1. Create invoice with multiple line items, discount, tax → totals correct.
2. Apply insurance contract → co-pay computed per contract rules.
3. Save → invoice appears in list with correct status.
4. Export invoice PDF → downloads; layout intact for both LTR (EN) and RTL (AR).
5. Void invoice → status changes; audit recorded.
6. Paginate invoices list; filter by date range and status → results correct.

### 3.7 Payments
1. Record a full payment against an invoice → invoice marked paid.
2. Record a partial payment → remaining balance correct; appears under Outstanding Debts.
3. Record payment across multiple invoices (batch) → all invoices updated.
4. Refund a payment → treasury balance adjusted.

### 3.8 Treasury
1. View Treasury dashboard → cash/bank balances match sum of transactions.
2. Create a transfer between accounts → balances update.
3. Run Daily Close → totals for the day match manual sum of invoices + expenses.
4. Export Treasury report to Excel → downloads cleanly.

### 3.9 Reports
1. Open Financial, Operational, Medical, HR, Inventory reports → each renders within 5 s.
2. Change date range → data refreshes.
3. Export at least one report to Excel and one to PDF → downloads cleanly.
4. Open Doctor Commissions and Doctor Performance → numbers tie to invoices/appointments.

### 3.10 HR
1. Create a department and a position → visible in lists.
2. Create a staff record and link to a user account → login works with assigned role.
3. Record attendance (manual + GPS check if enabled).
4. Submit a leave request → appears in Leaves list.
5. Run payroll for the period → totals correct; commissions included.

### 3.11 User Management
1. Admin creates a new user via edge function → welcome email sent (if enabled) → user can sign in.
2. Change user role → permissions update on next session refresh.
3. Reset user password via admin action → user receives reset email.
4. Delete a user → user cannot sign in; audit log records deletion.

### 3.12 Notifications / Reminders
1. Schedule a reminder → appears in Scheduled Reminders.
2. Trigger `send-reminder` → recipient receives message via configured channel.
3. Verify no reminder is sent to a suppressed recipient.

### 3.13 Settings
1. Change general settings (clinic name, currency, working hours) → reflected across app after refresh.
2. Change language EN ↔ AR → direction flips (LTR ↔ RTL); no layout break.
3. Configure a new payment method / service / insurance company → usable in invoicing.
4. Update Role Permissions for a non-admin role → change enforced immediately for new sessions.

### 3.14 Backups
1. Open Backup / Export page → last backup timestamp shown.
2. Trigger manual export → downloads (or streams) without error.
3. Confirm daily backup ran (via Backend view).

---

## 4. Production Configuration Review (Confirmed Findings Only)

Scanned for debug/dev leftovers. **Confirmed issues:**

- **None.**
  - No `TODO`/`FIXME`/`XXX` markers in `src/` or `supabase/functions/` (outside test files).
  - No hardcoded `localhost` / `127.0.0.1` in production code paths. The single `localhost` reference in `supabase/functions/send-reminder/index.ts` is inside an SSRF guard that *rejects* localhost hosts — a security feature, not a dev leftover.
  - No `debugger;` statements.
  - No placeholder secrets (no `xxxx.yyyy.zzzz`, no `changeme`, no `TODO_SECRET`).
  - No `service_role` key referenced from `src/*`.
  - Dead `src/pages/Placeholder.tsx` was removed in Sprint 3.

`console.info`/`console.warn` calls exist in auth hooks (prefixed `[auth-debug]`) and are informational — they do not expose tokens, passwords, or PII beyond user IDs already present in the session. Acceptable for production; tracked as low-priority cleanup with M2.

**No production-blocking configuration issues confirmed.**

---

## 5. Deployment Risks

| # | Risk | Likelihood | Impact | Mitigation | Rollback |
|---|------|:----------:|:------:|-----------|----------|
| R1 | Custom-domain DNS not fully propagated at cut-over | Low | Med | Verify propagation via DNSChecker before publishing; keep Lovable staging URL as fallback | Wait for propagation; no code rollback needed |
| R2 | Google OAuth redirect URI missing for production domain | Med | High (login broken) | Pre-add `https://belalaamer.com/*` and `https://www.belalaamer.com/*` to OAuth allow-list | Add URI and re-verify; no code change |
| R3 | Edge function 5xx spike from unhandled input | Low | Med | Sprint 1 hardening added JWT check + audit log; monitor logs first 24 h | Roll back function to previous revision |
| R4 | Cron `detect-queue-alerts` fails silently | Low | Med | Cron secret set; alert on missing recent run | Re-trigger manually via secret; investigate logs |
| R5 | Missing error monitoring (M1 deferred) delays incident detection | High | Low-Med | Manual log review in first 24 h; on-call rota | N/A — operational mitigation only |
| R6 | Reminder / WhatsApp provider quota exhausted | Low | Med | Rate-limit and batch cap already in `send-reminder`; monitor daily send count | Disable reminder cron; investigate quota |
| R7 | Database backup untested until quarterly cycle | Low | High | Perform test restore into scratch environment within 24 h of launch | If restore fails, escalate to backend provider before real incident |
| R8 | RTL/Arabic layout regression on a rarely-used page | Med | Low | Manual QA §3 covers language toggle on core flows | Cosmetic — patch in next release |
| R9 | Large lists (>10k rows) surface as slow on non-paginated pages (queue, inventory categories, coupons) | Med | Low | Sprint 2 already paginated top pages; monitor slow-query logs | Add server pagination in Sprint 4 |
| R10 | Auth session in `localStorage` (L3, accepted) exposed via a future XSS | Low | High | Keep dependencies patched; CSP deferred but Radix/shadcn sanitize by default | Force session revocation via admin; issue password resets |
| R11 | Publish button not clicked after a frontend hot-fix (frontend only deploys on Publish) | Med | Med | Post-merge checklist: always click Publish after visual changes | Re-publish latest known-good version |
| R12 | Preview URL leaked externally | Low | Low | Preview requires Lovable login by default; use Share preview for external review | Rotate share link |

No Critical or High-likelihood-with-High-impact risks. Every risk has a defined mitigation and rollback path.

---

## 6. Go / No-Go Decision

### Decision: **GO WITH MONITORING**

### Reasoning

- All Sprint 1 (Security), Sprint 2 (Performance Phase 1 + 2), Edge Function Hardening, and Sprint 3 Final Hardening reports show 0 Critical, 0 High findings.
- Production Readiness Audit closed at 87/100; every remaining Medium/Low item is classified Safe-to-Defer with recorded rationale and none block launch.
- Build passes cleanly; no debug code, dev URLs, placeholder secrets, or TODO blockers confirmed in §4.
- Every identified deployment risk (§5) has a defined mitigation and rollback plan.
- The only material operational gap is **M1 error monitoring is not yet integrated**, which is why the recommendation is "GO WITH MONITORING" rather than a plain "GO": the on-call engineer must manually review edge function logs and Backend metrics during the first 24 h, and daily for the first week, until Sentry (or equivalent) is landed in a follow-up sprint.
- Rollback paths are proven: version history for frontend, edge-function revision rollback in the Backend view, and pre-deployment snapshot for database.

**Proceed with launch. Enforce the monitoring cadence in §2.5 for the first 7 days. Schedule the M1 monitoring integration within 30 days of go-live.**

---

*End of guide.*