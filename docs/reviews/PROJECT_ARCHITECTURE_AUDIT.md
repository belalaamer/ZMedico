# Project Architecture, Security, Performance & Production Readiness Audit

**Date:** 2026-07-11
**Auditor:** Engineering (read-only review)
**Baseline:** post Migration 2 (Settings data-plane cutover) + final HR identity-write hardening
**Scope:** entire repository. No code, migrations, or database objects modified.

---

## 1. Executive Summary

The project is a multi-branch clinic management SaaS built on React 18 + Vite + TypeScript with Lovable Cloud (Supabase) as the backend. The codebase is substantial (~24 top-level page domains, ~110 tables, 7 edge functions, 106 SECURITY DEFINER functions) and has recently completed a disciplined 5-slice authorization migration with shadow-parity gating, CI invariants, and a canonical `AuthorizationService`.

**Overall verdict:** Production-ready with caveats. The authorization model is the strongest part of the system and can be shipped as-is. Primary residual risks: (a) large surface area of SECURITY DEFINER functions not individually audited outside the identity path, (b) unpaginated queries in several list pages, (c) no error-monitoring integration, (d) limited automated test coverage outside the authorization slice.

**Overall Engineering Quality Score: 78 / 100.**

---

## 2. Strengths

1. Three-layer authorization model (UI advisory → route advisory → RLS authoritative) is explicit, documented, and CI-enforced via `completedSlices.invariant.test.ts`.
2. Minimum-privilege SECURITY DEFINER surface for identity writes: only `settings_assign_user_role` and `settings_save_role_permissions`. HR unlink/replace routes through the same RPC — no per-flow DEFINER sprawl.
3. Roles stored in dedicated `user_roles` table with `SECURITY DEFINER has_role()` helper — matches best practice, avoids recursive RLS.
4. Shadow-migration methodology (per-slice probes + parity tests + non-influence tests) gives strong regression protection.
5. Auto-generated Supabase client and types kept untouched.
6. Strong documentation base (`docs/architecture`, `docs/governance`, `docs/execution`, `docs/security`).
7. i18n (Arabic/English + RTL) integrated from day one.
8. Feature-domain folder structure makes slice ownership obvious.
9. Playwright + Vitest coexist, wired into per-slice GitHub Actions.

---

## 3. Weaknesses

1. No error-monitoring integration (Sentry/Datadog/PostHog).
2. No route-level code splitting — every page eagerly imported in `src/App.tsx`.
3. Limited unit-test coverage outside authorization.
4. 106 SECURITY DEFINER functions not individually reviewed post-migration.
5. List pages fetch without pagination.
6. Client-side aggregation of financial data in Treasury/Reports.
7. Auth session persisted in `localStorage` — XSS token-theft surface.
8. No CSP header.
9. Shadow framework still ships in production bundles.
10. `(supabase as any)` casts scattered across hooks/pages.

---

## 4. Risk Matrix

| # | Risk | Likelihood | Impact | Severity |
|---|------|-----------|--------|----------|
| R1 | Unaudited SECURITY DEFINER function has weak caller check | Medium | High | High |
| R2 | Unpaginated list query on large tenant → OOM/timeout | High | Medium | High |
| R3 | XSS → localStorage token exfiltration | Low | High | Medium |
| R4 | Missing error monitoring → silent production failures | High | Medium | Medium |
| R5 | Edge function without JWT verification exposes admin op | Low | Critical | Medium |
| R6 | Regression in business logic (untested) | Medium | Medium | Medium |
| R7 | Bundle size regression hurts LCP on mobile | Medium | Low | Low |
| R8 | Shadow telemetry PII leakage | Low | Medium | Low |

---

## 5. Security Findings

### Critical
None identified. Identity-write path funnels through two audited DEFINER RPCs; direct writes to `user_roles`, `role_permissions`, `employee_id_counter` are zero across the frontend and CI-guarded.

### High
- **H1. SECURITY DEFINER breadth (106 functions).** Only the two Settings RPCs are formally reviewed post-migration. Every DEFINER function must (a) `SET search_path = public, pg_temp`, (b) validate caller with `auth.uid()` + `has_role`, (c) not return rows the caller could not read via RLS. Extend `scripts/authz/compliance_definer.py` to enumerate offenders.
- **H2. Edge-function JWT verification.** Verify `supabase/config.toml` sets `verify_jwt = true` for every `admin-*` function. Any admin function publicly invocable without JWT is a privilege escalation vector.
- **H3. `admin-export` data exposure.** Confirm server-side admin role re-check, not JWT presence alone.

### Medium
- **M1. No CSP.** Add restrictive CSP meta in `index.html`.
- **M2. `localStorage` session storage.** Documented Supabase default; mitigate with strict CSP and dependency hygiene.
- **M3. Client-side gating is advisory** — verify every mutating call site has a matching RLS policy (currently only spot-verified per slice).
- **M4. `audit_logs` should be append-only.** Verify no UPDATE/DELETE grants.
- **M5. Multi-tenant isolation.** Confirm every tenant-scoped table has a `tenant_id` RLS predicate (not enumerated across all 110 tables in this audit).

### Low
- **L1.** `(supabase as any)` casts can hide typo'd column filters if RLS ever loosens.
- **L2.** `withTimeout` fallback returns empty data — safe here, but future callers may confuse timeout with empty result.
- **L3.** Reset-password flow: verify OTP replay + rate limiting.

### Informational
- Rotate publishable anon key periodically.
- Threat model partially captured in `docs/architecture/AUTHORIZATION_ARCHITECTURE.md`.

---

## 6. Performance Findings

| ID | Finding | Impact | Effort |
|----|---------|--------|--------|
| P1 | `src/App.tsx` imports every page eagerly — no `React.lazy` | High (initial bundle, TTI) | S |
| P2 | List pages fetch without server-side pagination / `range()` | High at scale | M |
| P3 | `usePermissions` re-fetches on every role change; no query cache | Low | S |
| P4 | Reports pages aggregate on client — push to SQL views | Medium | M |
| P5 | Missing indexes on `patient_id`, `appointment_date`, `invoice_id`, `branch_id` — verify with `slow_queries` | Medium | S |
| P6 | Shadow probes run in prod on every session | Low (~2–3% JS) | Trivial to gate |
| P7 | Global search may issue N queries across modules | Medium | M |
| P8 | Images not routed through `vite-imagetools` (WebP/AVIF) | Low | S |
| P9 | No `React.memo` / virtualization on long tables | Medium | M |

First perf sprint: P1 + P2 + P5 delivers the largest perceived-latency win.

---

## 7. Architecture Findings

**Strengths**
- Feature-first folder layout with clear vertical slices.
- Explicit authz layer (`src/lib/authz`) with a service abstraction.
- Contexts (`AuthContext`, `BranchContext`, `I18nContext`) minimal and well-scoped.

**Smells**
- **A1. Dual permission representations.** `rolePermissions.ts` defaults + DB `role_permissions` + authz bundles — three sources converge in `usePermissions`.
- **A2. Presentation ↔ data mixing.** Pages issue Supabase queries directly instead of via a data hook or service.
- **A3. No global data-fetch library** (React Query/SWR). Every hook re-implements loading/timeout logic.
- **A4. `src/lib/*` is inconsistently pure** — some functions call Supabase, others don't; hard to unit-test.
- **A5. Shadow telemetry** coupled to the runtime authz path with no scheduled owner date for removal.

---

## 8. Code Quality Findings

- Duplication: near-identical shadow probes per slice — consolidate into a factory.
- Dead code: `Placeholder.tsx` and residual pre-slice checks (small).
- Naming: consistent overall; DB `snake_case` bleeds into TS via generated types (expected).
- Over-engineering hotspot: authz bundle-versioning framework has heavy governance vs. current business surface. Appropriate for compliance-driven products, possibly overweight otherwise.
- JSDoc excellent on authz surfaces, thin elsewhere.

---

## 9. Database Findings

- Well-normalized schema (110 tables, discrete counters, dedicated join tables).
- **D1.** Confirm every `public.*` table has explicit `GRANT`s per Supabase Data API requirement.
- **D2.** `_counter` tables should be mutated only inside DEFINER RPCs — verify.
- **D3.** No trigger inventory available in this audit — recommend `pg_trigger` dump.
- **D4.** Foreign-key completeness — sample-audit only; run repo-wide check.
- **D5.** Reporting would benefit from materialized views.

---

## 10. Testing Findings

- Strong on authz (parity, non-influence, invariant, 5 Playwright shadow suites in GH Actions).
- Weak elsewhere: no tests for `invoicePdf`, `queueAlerts`, `branchSchedule`, `insuranceContracts`, prescriptions, treasury logic.
- Suggested target: 30% coverage on `src/lib/*` within one sprint.

---

## 11. Production Readiness

**Verdict: ready to ship, with the classification below.**

### Critical blockers
None.

### Recommended before scale (>1k tenants or >10k rows/tenant)
- P1 route-level code-splitting.
- P2 pagination on list pages.
- H1 scripted audit of the 106 DEFINER functions.
- H2 confirm `verify_jwt = true` for every admin edge function.
- Add error monitoring (Sentry).

### Optional
- CSP meta tag.
- Consolidate permission sources of truth.
- Introduce React Query.
- Image pipeline (WebP/AVIF).
- Retire shadow probes after one stable release.

---

## 12. Technical Debt (ranked)

| Rank | Item | Effort | Business Impact | Tech Risk |
|------|------|--------|-----------------|-----------|
| 1 | Route-level lazy loading | S | High | Low |
| 2 | Server-side pagination on list pages | M | High | Low |
| 3 | Full DEFINER audit + `search_path` enforcement | M | Medium | High if skipped |
| 4 | Adopt React Query | M | Medium | Low |
| 5 | Business-logic unit tests | M | Medium | Low |
| 6 | Shadow-framework retirement | S | Low | Low |
| 7 | Consolidate rolePermissions defaults + DB + bundles | L | Low | Medium |
| 8 | Replace `(supabase as any)` casts | M | Low | Low |
| 9 | CSP + security headers | S | Medium | Low |
| 10 | Error monitoring integration | S | High | Low |

---

## 13. Prioritized Action Plan

**Sprint 1 — hardening (1 week):**
1. Confirm `verify_jwt` for all `admin-*` edge functions (H2).
2. Scripted DEFINER `search_path` audit (H1).
3. Add Sentry.
4. Add CSP meta.

**Sprint 2 — performance (1–2 weeks):**
1. Route-level `React.lazy` in `src/App.tsx` (P1).
2. Pagination + `range()` on top 5 list pages (P2).
3. Add indexes surfaced by `slow_queries` (P5).

**Sprint 3 — quality (2 weeks):**
1. React Query for authz + list pages.
2. Business-logic unit tests: invoicePdf, queueAlerts, insuranceContracts.
3. Retire shadow probes and telemetry.

**Sprint 4 — backlog:**
- Consolidate permission representations.
- Materialized views for reports.
- Table virtualization.

---

## 14. Scores

| Dimension | Score | Justification |
|-----------|------:|---------------|
| Architecture | 82 | Clear vertical slices, explicit authz layer; some data/presentation mixing and dual permission sources. |
| Security | 80 | Excellent identity-write hygiene, RLS-first model; unaudited DEFINER breadth and missing CSP/error monitoring cap the score. |
| Performance | 68 | No lazy routes, no pagination, no image pipeline; not blocking at current scale. |
| Maintainability | 78 | Strong docs, feature folders; duplication in shadow probes; authz governance heavy for team size. |
| Scalability | 72 | Multi-tenant schema sound; unpaginated queries and client aggregation are the ceiling. |
| Code Quality | 78 | Consistent style, good typing except deliberate escape hatches. |
| Testing | 65 | Authz fortress-grade; business logic bare. |
| Production Readiness | 82 | Shippable today; recommended items are risk-reducers, not blockers. |
| **Overall Engineering Quality** | **78** | Above-average engineering rigor; ready for controlled production rollout after Sprint 1 hardening. |

---

## 15. Final Recommendation

**Ship it, with Sprint 1 as a launch gate.** The authorization migration is complete, invariant-guarded, and well-documented. Remaining findings are ordinary operational hardening and performance runway, not architectural defects. Prioritize the DEFINER audit and edge-function JWT verification before opening to untrusted tenants; sequence everything else against real user load.

*End of report.*
