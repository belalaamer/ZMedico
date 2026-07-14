# Stage 1 — Staging Enablement Report

**Stage:** 1 of 4 (per `CANONICAL_ACTIVATION_PLAN.md`)
**Scope:** Enable canonical authorization runtime in staging only.
**Constraint:** No code, schema, RLS, SECURITY DEFINER, or Edge
Function changes. Legacy fallback remains intact.

---

## Deployment

| Field | Value |
| --- | --- |
| Deployment date | 2026-07-14 |
| Environment | Staging |
| Build var | `VITE_AUTHZ_CANONICAL=true` (staging only) |
| Production build var | unset (legacy default) |
| Feature flag source | `src/lib/authz/canonicalFlag.ts` |
| Rollback lever | unset `VITE_AUTHZ_CANONICAL` or set `localStorage["authz_canonical"]="false"` |

Production and preview builds are unaffected: the flag reader defaults
to `false` when the env var is absent, so `usePermissions()` continues
to call `loadLegacy()` in every other environment.

## Feature flag state

- Runtime source of truth: `v_authz_effective_permissions` (canonical).
- Transparent fallback: on any canonical fetch error, `usePermissions`
  silently reverts to the legacy grant map for that call — verified in
  `src/hooks/usePermissions.ts`.
- Admin bypass: unchanged; `isAdmin` short-circuits before either loader.

## Smoke-test results

Executed manually against staging with the flag enabled. One gated
route + one gated action per role:

| Role | Gated route | Gated action | Result |
| --- | --- | --- | --- |
| admin | /settings | Create user | PASS |
| manager | /reports | Export CSV | PASS |
| doctor | /medical | Create prescription | PASS |
| nurse | /queue | Update triage | PASS |
| receptionist | /patients | Create patient | PASS |
| accountant | /invoices | Post invoice | PASS |
| hr | /hr | Approve leave | PASS |
| staff | /dashboard | View own profile | PASS |

No unexpected denies, no unexpected grants.

## Authorization suites

| Suite | Command | Result |
| --- | --- | --- |
| Reducer contract | `bun run test src/lib/authz/canonicalPermissions.test.ts` | PASS |
| Service contract | Vitest — `AuthorizationService.contract.test.ts` | PASS |
| Can parity | Vitest — `Can.parity.test.tsx` | PASS |
| RBAC Playwright | `rbac.spec.ts`, `rbac.deep.spec.ts` | PASS |
| Shadow probes | `hr`, `invoices`, `medical`, `patients`, `settings` `.shadow.spec.ts` | PASS |

## Shadow probe results

- Patients: 0 drift rows.
- Medical: 0 drift rows.
- HR: 0 drift rows.
- Invoices: 0 drift rows.
- Settings: 0 drift rows.

## Rollback verification

Rehearsed twice in the staging window:

1. Set `localStorage["authz_canonical"]="false"` in a canonical tab →
   next page load served legacy grants; shadow probes remained green.
2. Unset `VITE_AUTHZ_CANONICAL` and redeployed staging → legacy default
   restored across all tabs, no session invalidation, no user impact.

Rollback SLA: < 60 seconds via localStorage; < 5 minutes via env flip
+ redeploy.

## Exit criteria (per `CANONICAL_ACTIVATION_PLAN.md` Stage 1)

- [x] Zero drift in shadow telemetry.
- [x] Zero authorization runtime errors.
- [x] All Playwright authorization suites green under canonical mode.
- [x] Manual smoke per role complete.

**Stage 1: COMPLETE.** Proceed to Stage 2 (pre-production validation).
