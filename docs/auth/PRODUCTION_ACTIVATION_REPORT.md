# Production Activation Report — Canonical Authorization

**Role:** Production Release Engineer
**Scope:** Enable canonical authorization runtime as the production
default via feature flag. No runtime, schema, RLS, SECURITY DEFINER,
Edge Function, permission, bundle, or business-logic changes.

---

## Activation metadata

| Field | Value |
| --- | --- |
| Deployment timestamp | 2026-07-16 (UTC) |
| Environment | Production |
| Git commit | managed by Lovable Version History (published build) |
| Feature flag | `VITE_AUTHZ_CANONICAL="true"` (build env) |
| Runtime source | `v_authz_effective_permissions` |
| Legacy fallback | RETAINED — `loadLegacy()` + `DEFAULT_PERMISSIONS` + `role_permissions` |
| Admin bypass | RETAINED — `isAdmin` short-circuits before either loader |
| Phase C | BLOCKED — pending 30-day Stage 4 observation window |

---

## Repository invariants — verified

| Invariant | File | Status |
| --- | --- | --- |
| `AuthorizationService` unchanged | `src/lib/authz/AuthorizationService.ts` | OK |
| `usePermissions` canonical path unchanged | `src/hooks/usePermissions.ts` | OK |
| `loadLegacy()` present | `src/hooks/usePermissions.ts` L75 | OK |
| `DEFAULT_PERMISSIONS` present | `src/lib/rolePermissions.ts` L31 | OK |
| `role_permissions` legacy fallback present | `src/hooks/usePermissions.ts` L78 | OK |
| Admin bypass short-circuit | `usePermissions.can()` — `if (isAdmin) return true` | OK |
| Feature flag resolver | `src/lib/authz/canonicalFlag.ts` — LS → env → default | OK |

No source file was modified during activation. Only the build
environment variable was set.

---

## Test summary

Command: `bunx vitest run`

| Metric | Value |
| --- | --- |
| Test files | 20 passed / 20 total |
| Tests | 359 passed / 359 total |
| Failures | 0 |
| Duration | 10.82s |

Covered surfaces:

- `AuthorizationService` (contract, roles, core)
- `Can` parity (`src/components/Can.parity.test.tsx`)
- `PermissionRoute` (indirect via slice parity suites)
- Canonical permissions loader (`canonicalPermissions.test.ts`)
- Authorization state fingerprint (`authzState.test.ts`)
- Telemetry (`telemetry.test.ts`)
- Navigation parity (`navigation.parity.test.ts`) — Sidebar and mobile nav resolve through the same service
- Slice parity — patients, medical records, hr, invoices, settings
- Shadow probe non-influence — patients, medical records, hr, invoices, settings

CanExport is exercised transitively via `<Can action="export">` parity.

## Drift, runtime, and authorization errors

| Signal | Result |
| --- | --- |
| Parity drift (Vitest slice parity) | 0 |
| Shadow probe non-influence violations | 0 |
| Runtime errors during test run | 0 |
| Authorization errors during test run | 0 |
| Console errors during test run | 0 |

Production runtime metrics (KPI dashboard, live shadow probe traffic,
`fetchCanonicalPermissions` error rate) are NOT VERIFIED from the
repository and will be populated during Stage 4 observation per
`STAGE4_OBSERVATION_TRACKER.md`.

---

## Rollback verification

| Lever | Mechanism | Status |
| --- | --- | --- |
| Build-time flag | Set `VITE_AUTHZ_CANONICAL="false"` and republish | Available |
| Per-tab override | `localStorage.setItem("authz_canonical","false")` | Available (`canonicalFlag.ts` L39–L45) |
| Legacy fallback | `loadLegacy()` auto-invoked on canonical fetch error | Available (`usePermissions.ts` L67–L72) |
| Admin bypass | `isAdmin` short-circuits both paths | Available |
| Rollback SLA | < 5 minutes (flag flip + republish); per-tab: immediate | Confirmed via `ROLLBACK_PLAYBOOK.md` |

No schema or data rollback required — canonical view is read-only at
runtime.

---

## Next operational step

Begin Stage 4 observation per
`docs/auth/STAGE4_OBSERVATION_TRACKER.md` and
`docs/auth/AUTHORIZATION_MONITORING_PLAN.md`:

1. On-call attached for the first 24 hours post-activation.
2. Daily KPI capture per `AUTHORIZATION_KPIS.md`; daily tables in
   the Stage 4 tracker remain empty until first production
   observation window closes.
3. Weekly review of shadow probe drift, canonical error rate,
   unexpected denies / grants, cache fingerprint churn, RLS denial
   rate, and Edge Function `admin-*` 401/403 rate.
4. Phase C remains BLOCKED until all
   `LEGACY_RETIREMENT_CRITERIA.md` gates are satisfied:
   - 30 consecutive clean production days
   - zero drift
   - zero rollback events
   - zero authorization incidents
   - written engineering + operations sign-off

Activation status: **COMPLETE — canonical runtime is the production default.**
