# Production Cutover Checklist

**Project:** ZMedico (`belalaamer.com`, `www.belalaamer.com`)
**Basis:** Final Release Sign-off — GO WITH MONITORING (87/100)
**Companion docs:** `PRODUCTION_DEPLOYMENT_GUIDE.md`, `FINAL_RELEASE_SIGNOFF.md`
**Scope:** Documentation only. No code, schema, RLS, DEFINER, edge function, dependency, or config change.

Use this document as the tick-sheet on cut-over day. Each row must be signed (initials + timestamp) before proceeding to the next section.

---

## 1. Pre-Launch Verification (T-24 h → T-0)

### 1.1 Environment variables
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 1 | `.env` contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, all non-empty | Eng | Present | ☐ |
| 2 | No `service_role` key referenced anywhere under `src/*` | Eng | grep clean | ☐ |
| 3 | Env values point to the **production** backend (not staging) | Eng | Confirmed | ☐ |

### 1.2 Backend connection (Lovable Cloud)
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 4 | Backend view shows project active and healthy | Ops | Green | ☐ |
| 5 | RLS enabled on every user-facing public table | Eng | Verified in Sprint 1 | ☐ |
| 6 | `SECURITY DEFINER` least-privilege grants intact | Eng | Verified in Sprint 1 Task 2 | ☐ |

### 1.3 Edge Function secrets
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 7 | `CRON_SECRET` (used by `detect-queue-alerts`) present in runtime secrets | Ops | Present | ☐ |
| 8 | Reminder provider secrets (WhatsApp / SMS) present, OR reminder feature explicitly disabled | Ops | Present or disabled | ☐ |
| 9 | `SUPABASE_SERVICE_ROLE_KEY` available to functions that need it (`admin-*`, `send-reminder`) | Ops | Present | ☐ |
| 10 | Latest revisions of `admin-create-user`, `admin-delete-user`, `admin-reset-password`, `admin-export`, `send-reminder`, `detect-queue-alerts`, `enqueue-winback` are deployed | Ops | Confirmed | ☐ |

### 1.4 Cron jobs
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 11 | `detect-queue-alerts` scheduled and last-run timestamp fresh | Ops | Fresh | ☐ |
| 12 | Email queue `process-email-queue` on-demand wake trigger present (if branded email enabled) | Ops | Present or N/A | ☐ |

### 1.5 Authentication providers
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 13 | Email/password enabled | Eng | On | ☐ |
| 14 | Google OAuth configured; redirect URIs include `https://belalaamer.com/*` and `https://www.belalaamer.com/*` | Eng | Present | ☐ |
| 15 | Password HIBP check enabled | Eng | On | ☐ |
| 16 | Anonymous sign-ups disabled | Eng | Off | ☐ |
| 17 | Auto-confirm email disabled | Eng | Off | ☐ |

### 1.6 Storage policies
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 18 | Every storage bucket in use has an explicit RLS policy | Eng | Verified per bucket | ☐ |
| 19 | No public bucket unless intentional (e.g. logos, invoice-PDF cache) | Eng | Verified | ☐ |

### 1.7 Backups
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 20 | Automatic daily backups enabled | Ops | Confirmed | ☐ |
| 21 | Retention window meets the customer's data policy | Ops | Confirmed | ☐ |

### 1.8 DNS
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 22 | A `@` → `185.158.133.1` for `belalaamer.com` | Ops | Resolves | ☐ |
| 23 | A `www` → `185.158.133.1` | Ops | Resolves | ☐ |
| 24 | `_lovable` TXT verification record present | Ops | Verified | ☐ |
| 25 | DNS propagation checked via DNSChecker | Ops | Global green | ☐ |
| 26 | If branded email in use: NS delegation for email subdomain intact | Ops | Verified or N/A | ☐ |

### 1.9 HTTPS
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 27 | SSL certificate active on `belalaamer.com` | Ops | Valid | ☐ |
| 28 | SSL certificate active on `www.belalaamer.com` | Ops | Valid | ☐ |
| 29 | No CAA record blocks Let's Encrypt | Ops | OK | ☐ |

### 1.10 Domain configuration
| # | Check | Owner | Expected | Done |
|---|-------|-------|----------|:----:|
| 30 | Primary domain set to `belalaamer.com` | Ops | Confirmed | ☐ |
| 31 | `www.belalaamer.com` redirects to primary | Ops | Confirmed | ☐ |
| 32 | Domain status shows `Active` in Domains view | Ops | Active | ☐ |

**Gate:** No item above may remain unchecked before proceeding to §2.

---

## 2. Launch Sequence (Cut-over Day)

Execute in strict order. Do not parallelize. Record the timestamp for each step.

| Step | Action | Owner | Timestamp | Rollback trigger |
|:----:|--------|-------|-----------|------------------|
| 1 | **Freeze code.** Announce cut-over start; no merges until §2.7 sign-off. | Eng lead | | — |
| 2 | **Database snapshot.** Take a manual pre-deployment snapshot; record snapshot ID. | Ops | | If snapshot fails: STOP; do not proceed. |
| 3 | **Verify runtime secrets.** Re-confirm §1.3 items 7–10 in the Backend view. | Ops | | If any missing: STOP; add and retry. |
| 4 | **Deploy frontend.** In Lovable, click **Publish → Update**. Wait for deploy confirmation. | Eng | | If publish errors: retry once; if still failing, STOP. |
| 5 | **Verify backend health.** Backend view green; no 5xx spikes in edge function logs for the last 5 min. | Ops | | If red or spiking 5xx: roll back per §5. |
| 6 | **Execute smoke tests.** Run all 8 smoke tests from Deployment Guide §2.3. | QA | | If any smoke test fails: roll back per §5. |
| 7 | **Enable production traffic.** DNS is already live; simply announce go-live in the ops channel with build hash + timestamp. | Ops | | — |
| 8 | **Begin monitoring.** Start §3 First 24 h Monitoring immediately. | On-call | | — |

**Cut-over complete when steps 1–8 are signed.**

---

## 3. First 24 Hours Monitoring

On-call engineer reviews every 2 h during business hours; every 4 h off-hours. Record findings in the incident log even if all green.

| # | Check | Where | Threshold | Escalation |
|---|-------|-------|-----------|------------|
| 1 | Edge Function 5xx count (all functions) | Backend → Functions → Logs | < 1 % of total invocations, no single-minute spike > 10 | SEV-2 if breached |
| 2 | `admin-*` function errors | Function logs, search `error` | Zero unexpected errors | SEV-1 if auth-related |
| 3 | `send-reminder` failure rate | Function logs | < 5 % failures over rolling 15 min | SEV-2; consider disabling cron |
| 4 | `detect-queue-alerts` cron ran on schedule | Backend → Cron | Last run within expected interval | SEV-2 if missed twice in a row |
| 5 | Auth failure rate (sign-in errors) | Backend → Auth logs | No sustained spike > baseline | SEV-1 if login broken for real users |
| 6 | Database error log (constraint / permission / timeout) | Backend → Database → Logs | Zero new error classes | SEV-2 if new class appears |
| 7 | Slow queries (pg_stat_statements top 10) | Backend → Database → Query performance | No new query > 1 s mean | Investigate; SEV-3 unless UX-blocking |
| 8 | Bounce / suppressed email count (if branded email in use) | Cloud → Emails | No spike vs. baseline | SEV-3 |
| 9 | User-reported issues | Support channel | Zero new SEV-1/2 reports | Triage per Deployment Guide §2.6 |
| 10 | Backend health | Backend view | Green | SEV-1 if red |

**End-of-24 h sign-off:** on-call engineer files a short summary in the ops channel.

---

## 4. First 7 Days Monitoring

Daily review, 15 minutes, same time each day. Owner: on-call engineer of the day.

| Day | Focus | Checks | Sign-off |
|:---:|-------|--------|:--------:|
| D+1 | Post-launch stabilization | Re-run all §3 checks over last 24 h; verify backup ran overnight; skim support tickets. | ☐ |
| D+2 | Auth & permissions | Auth error trend; any RBAC-related tickets; verify Google OAuth still healthy. | ☐ |
| D+3 | Data integrity | Spot-check row counts on `patients`, `invoices`, `payments`, `medical_records` vs. D+2; investigate anomalies. | ☐ |
| D+4 | Edge functions & reminders | Reminder delivery rate over week-to-date; `admin-*` audit-log entries reasonable. | ☐ |
| D+5 | Performance | Review pg_stat_statements top 10 for regressions vs. baseline; frontend load time on primary flows. | ☐ |
| D+6 | **Backup restore verification** | Test-restore latest daily backup into a scratch environment; verify row counts on `patients`, `invoices`, `medical_records`. Do **not** restore into production. | ☐ |
| D+7 | Weekly wrap-up | Summarize week's incidents, ticket volume, and any residual watch-items. Decide whether monitoring cadence can relax to weekly. Confirm M1 (Sentry) integration ticket is scheduled within 30 days of go-live. | ☐ |

**End-of-week sign-off:** Release Manager files a short weekly-recap note referencing this checklist.

---

## 5. Rollback Plan

### 5.1 Frontend rollback
1. Open Lovable → Project → **Version history**.
2. Select the previous known-good version (recorded in §2 step 4 predecessor).
3. Click **Publish** on that version.
4. Hard-refresh `https://belalaamer.com` and verify the previous build is served (check the bundle hash in browser dev tools; it should match the prior version's hash).
5. Announce rollback complete in the ops channel with the reverted build hash and timestamp.

**Rollback SLA:** < 10 minutes from decision to completion.

### 5.2 Edge function rollback
1. Open the Backend view → **Edge Functions** → select the offending function.
2. Open the revision history and choose the previous known-good revision.
3. Redeploy that revision.
4. Trigger a synthetic call to verify (e.g. invoke `send-reminder` with a test payload; check the response and logs).
5. Record the reverted revision ID in the incident log.

**Rollback SLA:** < 15 minutes per function.

### 5.3 Database restore procedure (reference)

**Only invoke on a confirmed SEV-1 data-integrity incident.** Data written between the pre-deployment snapshot and the restore moment will be lost — communicate the loss window to stakeholders **before** restoring.

1. Identify the pre-deployment snapshot ID recorded in §2 step 2.
2. Notify stakeholders of the imminent restore and the data-loss window.
3. Initiate the restore from the Backend view's backup interface using the recorded snapshot ID.
4. Wait for restore completion; verify the row counts on `patients`, `invoices`, `payments`, `medical_records` against a pre-incident baseline.
5. Re-run the smoke tests from Deployment Guide §2.3.
6. Announce restore complete with the snapshot ID, restore timestamp, and data-loss window.

**Rollback SLA:** dependent on backup provider restore time (typically < 60 minutes for a fresh daily snapshot).

### 5.4 Decision matrix

| Symptom | First response |
|---------|----------------|
| Auth broken / app blank | Frontend rollback (§5.1) |
| Single business flow crashing (invoicing, queue, reminders) | Edge function rollback for that function (§5.2), or frontend rollback if the fault is in the UI |
| Data corruption or destructive migration side-effect | Frontend + edge function rollback first; database restore (§5.3) only if data loss is confirmed and unrecoverable by code fix |
| Cosmetic / non-blocking bug | **Do not roll back.** File ticket; batch with next release. |

---

## Sign-off

| Section | Owner | Signed | Timestamp |
|---------|-------|:------:|-----------|
| §1 Pre-Launch Verification | Ops + Eng | ☐ | |
| §2 Launch Sequence | Eng lead | ☐ | |
| §3 First 24 h Monitoring — closed | On-call | ☐ | |
| §4 First 7 Days Monitoring — closed | Release Manager | ☐ | |

*End of cut-over checklist.*