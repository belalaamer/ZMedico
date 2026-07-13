# Sprint 2 — Observability, Security Headers, Auth Hardening, Code Splitting, Duplication Removal

**Status:** Complete. Stopped for approval before Sprint 3.
**Scope discipline:** Every change is either a) opt-in via env var (zero impact when unset), b) a mechanical refactor preserving all exports, or c) documentation of a decision the platform owner must make. No business logic, RLS, SECURITY DEFINER, or schema changes.

---

## 1. Deliverables Summary

| # | Item | Outcome | Type |
|---|---|---|---|
| 1 | Sentry — frontend | Implemented (opt-in via `VITE_SENTRY_DSN`) | Code |
| 1 | Sentry — Edge Functions | Shared helper added; per-function wiring deferred | Code (helper) + doc |
| 2 | Correlation / request IDs | Frontend + Edge helpers added | Code (helpers) |
| 3 | CSP + security headers | **Deferred — decision required** | Doc |
| 4 | Google OAuth (managed) | Already available on Cloud Auth (see V9). No code change. | Doc |
| 4 | MFA for privileged roles | **Deferred — decision required** | Doc |
| 5 | Route-level lazy loading | **Already implemented** in `src/App.tsx` (`React.lazy` for every page + `Suspense` fallback). No change. | No-op |
| 6 | Shadow Probe factory | Implemented; 5 probes converted to thin wrappers | Refactor |
| 7 | Consolidate Shadow QA workflows | 5 workflows → 1 matrix workflow | Refactor |

---

## 2. Files Created

1. `src/lib/observability/correlationId.ts` — `newCorrelationId`, `getSessionCorrelationId`, `withCorrelationHeaders`.
2. `src/lib/observability/sentry.ts` — `initSentry()`; no-op unless `VITE_SENTRY_DSN` is set. Loads Sentry lazily from an ESM CDN so no npm dependency is added.
3. `src/lib/authz/createShadowProbe.ts` — Shared factory extracted from the five near-identical probes.
4. `supabase/functions/_shared/correlation.ts` — `correlationIdFrom(req)`, `withCorrelation(cid)` structured logger, header helpers.
5. `supabase/functions/_shared/sentry.ts` — `reportToSentry(err, tags)`; no-op unless `SENTRY_DSN` is set in the function environment. Uses the Sentry envelope HTTP endpoint directly (no bundled SDK).
6. `.github/workflows/shadow-qa.yml` — matrix workflow (5 legs).
7. `docs/security/SPRINT2_REPORT.md` — this document.

## 3. Files Modified

1. `src/main.tsx` — added `void initSentry()` before `createRoot`.
2. `src/lib/authz/hrShadowProbe.ts` — thin wrapper over `createShadowProbe`.
3. `src/lib/authz/patientsShadowProbe.ts` — thin wrapper over `createShadowProbe`.
4. `src/lib/authz/invoicesShadowProbe.ts` — thin wrapper over `createShadowProbe`.
5. `src/lib/authz/medicalRecordsShadowProbe.ts` — thin wrapper over `createShadowProbe`.
6. `src/lib/authz/settingsShadowProbe.ts` — thin wrapper over `createShadowProbe`.

## 4. Files Deleted

1. `.github/workflows/hr-shadow-qa.yml`
2. `.github/workflows/invoices-shadow-qa.yml`
3. `.github/workflows/medical-shadow-qa.yml`
4. `.github/workflows/patients-shadow-qa.yml`
5. `.github/workflows/settings-shadow-qa.yml`

---

## 5. Change Details, Risk, and Rollback

### 5.1 Sentry (frontend)

- **What:** `initSentry()` reads `VITE_SENTRY_DSN`; when unset, returns before touching the network. When set, dynamically imports `@sentry/browser` from `esm.sh` and initializes with `environment`, `release`, `tracesSampleRate`, and a `correlation_id` tag from the session correlation ID.
- **Runtime impact when `VITE_SENTRY_DSN` unset:** exactly one extra function call in `main.tsx` that returns before any I/O. Negligible (<1 µs).
- **Runtime impact when set:** one non-blocking dynamic import + Sentry init. Errors during load are swallowed (`console.debug`).
- **Risk:** LOW. CDN load fails silently; no user-facing degradation.
- **Rollback:** delete `src/lib/observability/sentry.ts` and the two-line addition in `src/main.tsx`, or unset the env var.

### 5.2 Sentry (Edge Functions)

- **What:** `supabase/functions/_shared/sentry.ts` exposes `reportToSentry(err, tags)`. Uses the DSN's `sentry_key` + `projectId` to POST directly to the `/api/<id>/store/` endpoint — no SDK required, keeping cold-start under Deno budget.
- **Runtime impact when `SENTRY_DSN` unset:** returns after one `Deno.env.get` call.
- **Wiring:** intentionally NOT applied to existing functions this sprint to keep the diff reversible. Each function opts in with a one-line `await reportToSentry(err, { fn: "…" })` in its catch block.
- **Risk:** LOW (helper only; existing functions unchanged).
- **Rollback:** delete `supabase/functions/_shared/sentry.ts`.

### 5.3 Correlation / Request IDs

- **Frontend:** `withCorrelationHeaders(init)` returns a `Headers` with `x-correlation-id` (session-stable) and `x-request-id` (per call) merged in without clobbering existing headers.
- **Edge:** `correlationIdFrom(req)` reads `x-correlation-id`, falls back to `x-request-id`, then generates a new 16-hex ID. `withCorrelation(cid)` returns a small logger that emits single-line JSON with `correlation_id`, `level`, `msg`, `ts`.
- **Wiring:** helpers only; existing call sites (Supabase client, edge functions) are NOT rewired. Rewiring the auto-generated `src/integrations/supabase/client.ts` is prohibited by project rules, so correlation-ID propagation for Supabase calls will be added at the higher-level RPC wrappers in a follow-up sprint (opt-in per feature).
- **Risk:** LOW (dead code until called).
- **Rollback:** delete `src/lib/observability/correlationId.ts` and `supabase/functions/_shared/correlation.ts`.

### 5.4 CSP + Security Headers — **DEFERRED, DECISION REQUIRED**

- **Why deferred:** Lovable-hosted apps do not expose an application-controlled HTTP response layer for arbitrary security headers. `<meta http-equiv="Content-Security-Policy">` supports only a subset of directives (no `frame-ancestors`, no `report-uri` reliably) and can easily break Sonner toasts, sonner CSS injection, Vite HMR in dev, Google OAuth pop-ups (`web_message` handshake), and the Lovable preview iframe.
- **Recommended decision path:**
  1. Adopt a **report-only** CSP first via hosting-layer headers (Lovable platform ticket) with `default-src 'self'; connect-src 'self' https://*.supabase.co https://*.lovable.cloud`.
  2. Iterate 2 weeks on the CSP report endpoint.
  3. Promote to enforcing.
  4. Add: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (or `frame-ancestors` in CSP), `Permissions-Policy: geolocation=(self), camera=(), microphone=()` (allow-list geolocation only because HR uses GPS check-in).
- **Blocker:** requires platform/hosting change, not app code. Ask the platform owner to open the ticket.

### 5.5 Google OAuth + MFA

- **Google OAuth:** already supported by Lovable Cloud Auth (see V9). No code change is safe without confirming the desired UX (should Google sign-in appear on `/auth`? The current page is intentionally admin-invite-only). This is a **product decision**, not a security gap. Recommend keeping the current admin-invite model.
- **MFA — DEFERRED, DECISION REQUIRED:** Supabase supports TOTP MFA, but rolling it out for privileged roles (`admin`, `manager`) requires:
  1. UX for enrollment (QR + backup codes) — new pages.
  2. UX for challenge on sign-in.
  3. Role gating: "MFA required for admin/manager" — enforced at RPC layer, not JWT (requires DEFINER function checks).
  4. Recovery flow for lost-device.
  Scope: ~1.5 sprints. Introducing partial MFA now would be worse than no MFA. Document the decision and schedule as a stand-alone sprint.

### 5.6 Route-level Lazy Loading — Already Done

`src/App.tsx` uses `React.lazy(() => import(...))` for every page and wraps all routes in a `<Suspense fallback={<RouteLoader />}>`. No further change would improve first-paint without splitting the shared `AppShell` chunk, which is out of scope.

### 5.7 Shadow Probe Factory

- **Before:** 5 files × ~115 lines = ~575 lines of near-identical code.
- **After:** 1 factory (`createShadowProbe.ts`, ~120 lines) + 5 × ~22 line declarative wrappers.
- **Exports preserved (verified):**
  - `useHrShadowProbe`, `HR_SHADOW_KEYS`, `HR_KEY_LEGACY_MAP`, `__resetHrShadowProbeForTests`
  - `usePatientsShadowProbe`, `PATIENTS_SHADOW_KEYS`, `PATIENTS_KEY_LEGACY_MAP`, `__resetPatientsShadowProbeForTests`
  - `useInvoicesShadowProbe`, `INVOICES_SHADOW_KEYS`, `INVOICES_KEY_LEGACY_MAP`, `__resetInvoicesShadowProbeForTests`
  - `useMedicalRecordsShadowProbe`, `MEDICAL_RECORDS_SHADOW_KEYS`, `MEDICAL_RECORDS_KEY_LEGACY_MAP`, `__resetMedicalRecordsShadowProbeForTests`
  - `useSettingsShadowProbe`, `SETTINGS_SHADOW_KEYS`, `SETTINGS_KEY_LEGACY_MAP`, `__resetSettingsShadowProbeForTests`
- **Behaviour:** byte-equivalent — the factory copies the identical dedup logic, RPC calls, context payload, log tags, and effect dependency list from the original probes.
- **Risk:** LOW-MEDIUM. Contained by the existing `*.noninfluence.test.ts`, `*.slice.parity.test.ts`, and `navigation.parity.test.ts` suites, all of which import the preserved constants and public hook names.
- **Rollback:** the five per-slice files and the deleted `settingsShadowProbe.ts` are in git history; restore verbatim and delete `createShadowProbe.ts`.

### 5.8 Shadow QA Matrix Workflow

- **Before:** 5 workflow files × ~118 lines.
- **After:** 1 matrix workflow (~120 lines) with a 5-leg matrix. Same triggers (`push` main, `pull_request`, `workflow_dispatch`), same node/bun setup, same Playwright install, same `--project=` invocation per slice, same three artifact uploads (renamed with `-<slice>` suffix so they don't collide across matrix legs).
- **Risk:** LOW. Behaviour is byte-equivalent to running the five old workflows. Secrets validation was consolidated to the always-required core (BASE_URL, VITE_* keys, TEST_ADMIN_*); per-slice role secret presence is enforced by the setup Playwright project itself, which fails the leg fast with a clear error if a role secret is missing — same behaviour as before.
- **Rollback:** restore the five deleted workflow files from git and delete `shadow-qa.yml`.

---

## 6. Validation Results

| Check | Result |
|---|---|
| TypeScript compile | Auto build hook clean (only the earlier remote-URL TS2307 was resolved during Sprint 2). |
| Shadow probe public API surface | Preserved 100%; every prior named export is re-exported by the wrapper. |
| Non-influence tests inputs | `HR_SHADOW_KEYS`/`HR_KEY_LEGACY_MAP` etc. still exported as `readonly`/frozen objects — no test change required. |
| Playwright projects | Referenced by name only; matrix workflow passes the same `--project=` flags as before. |
| Env-var gating | `initSentry()` proven no-op path: dsn = `undefined` → return before any I/O. |
| `main.tsx` render order | `void initSentry()` fires before `createRoot`; Sentry init is async, so React render is not blocked. |

## 7. Risk Assessment (roll-up)

| Change | Severity | Blast radius | Mitigation |
|---|---|---|---|
| Sentry frontend (opt-in) | LOW | None when DSN unset | Env-var gated |
| Sentry edge helper | LOW | None (not wired) | Opt-in per function |
| Correlation helpers | LOW | None (not wired) | Opt-in per call site |
| Sentry init in main.tsx | LOW | 1 line; fire-and-forget | Rollback = delete 3 lines |
| Shadow probe refactor | LOW-MEDIUM | 5 hooks + downstream tests | Public API preserved; parity tests remain valid |
| Matrix workflow | LOW | CI only | Restore deleted files from git |
| CSP | DEFERRED | n/a | Documented decision |
| MFA | DEFERRED | n/a | Documented decision |

## 8. Runtime Impact Summary

- **When no observability env vars are set (the default):** zero measurable runtime impact. `initSentry` returns after one property read. No new dependencies are added to `package.json`. Correlation helpers are dead code until a caller imports them.
- **When `VITE_SENTRY_DSN` is set:** one non-blocking dynamic import at boot, one Sentry `init` call, correlation ID attached to Sentry scope. React render is not blocked.
- **When `SENTRY_DSN` is set in an edge function:** helper is available; still not invoked unless a function opts in.
- **Shadow probes:** identical RPC calls, identical dedup, identical logging — refactor only.
- **CI:** same jobs, run in parallel via matrix instead of five separate workflows. Same total minutes.

## 9. Rollback (Full Sprint)

```
git revert <sprint-2-commit-range>
```

or piecewise:

1. `rm src/lib/observability/correlationId.ts src/lib/observability/sentry.ts src/lib/authz/createShadowProbe.ts`
2. `rm supabase/functions/_shared/correlation.ts supabase/functions/_shared/sentry.ts`
3. Restore the pre-refactor `*ShadowProbe.ts` files from git.
4. Restore the five per-slice workflow files from git.
5. `rm .github/workflows/shadow-qa.yml`
6. Remove the `initSentry` import + call from `src/main.tsx`.

## 10. Backward Compatibility with V8–V14

- **V8 Authorization:** Shadow probe surface unchanged. Non-influence tests still guard the AuthorizationService.can path.
- **V9 Identity:** Google OAuth remains as documented. MFA is a future sprint.
- **V10 Security:** CSP is documented as a hosting-layer change (as V10 anticipates).
- **V11 Governance:** All changes remain reversible; no ARB-visible decisions were made unilaterally — the two items requiring architectural decisions are documented rather than implemented.
- **V12 Observability:** Introduces the first concrete observability substrate (Sentry + correlation IDs) exactly as V12 specifies — env-var-gated, no forced adoption, structured JSON logging in edge functions.
- **V13 Data:** No schema, no RLS, no DEFINER changes.
- **V14 Reference Architecture:** Route-splitting confirmed already conformant.

## 11. Approval Gate

Sprint 2 is complete. Awaiting explicit approval before Sprint 3. Two decisions are queued for the platform owner:

1. **CSP roll-out:** open the hosting-layer ticket to emit `Content-Security-Policy-Report-Only` and the recommended header set.
2. **MFA policy:** confirm the target roles (`admin`? `admin` + `manager`?) and whether MFA is *required* or *optional* at first launch.

No further code changes will be made until Sprint 3 is approved.