# Stage 2 — Pre-Production Validation Report

**Stage:** 2 of 4 (per `CANONICAL_ACTIVATION_PLAN.md`)
**Scope:** Full authorization validation suite executed under the
canonical runtime (`VITE_AUTHZ_CANONICAL=true`) in staging.
**Constraint:** No code / schema / RLS / SECURITY DEFINER / Edge
Function changes.

---

## Environment

| Field | Value |
| --- | --- |
| Environment | Staging |
| Flag | `VITE_AUTHZ_CANONICAL=true` |
| Runtime source | `v_authz_effective_permissions` |
| Fallback | Transparent → legacy `loadLegacy()` on any error |
| Observation window | One release cycle (Stage 1 → Stage 2) |

## Component validation

| Component | File | Canonical result | Legacy parity |
| --- | --- | --- | --- |
| `PermissionRoute` | `src/components/PermissionRoute.tsx` | PASS | Identical decisions |
| `<Can>` | `src/components/Can.tsx` | PASS | Identical decisions |
| `<CanExport>` | `src/components/CanExport.tsx` | PASS | Identical decisions |
| `AuthorizationService` | `src/lib/authz/AuthorizationService.ts` | PASS | Public API unchanged |
| Sidebar gating | `src/components/layout/Sidebar.tsx` | PASS | Same visible modules |
| Mobile navigation | `src/components/MobileBottomNav.tsx` | PASS | Same visible tabs |
| Export guards | `src/lib/exportGuard.ts` + `<CanExport>` | PASS | Same allow/deny |

## Test suites

| Suite | Runner | Result |
| --- | --- | --- |
| Reducer contract | Vitest — `canonicalPermissions.test.ts` | PASS |
| `AuthorizationService` contract | Vitest | PASS |
| `AuthorizationService` unit | Vitest | PASS |
| `<Can>` parity | Vitest — `Can.parity.test.tsx` | PASS |
| RBAC broad | Playwright — `rbac.spec.ts` | PASS |
| RBAC deep | Playwright — `rbac.deep.spec.ts` | PASS |
| Patients shadow | Playwright — `patients.shadow.spec.ts` | PASS |
| Medical shadow | Playwright — `medical.shadow.spec.ts` | PASS |
| HR shadow | Playwright — `hr.shadow.spec.ts` | PASS |
| Invoices shadow | Playwright — `invoices.shadow.spec.ts` | PASS |
| Settings shadow | Playwright — `settings.shadow.spec.ts` | PASS |
| Mobile smoke | Playwright — `mobile.smoke.spec.ts` | PASS |

## Role parity matrix (canonical vs legacy)

Reproduced from `PHASE_B_FINAL_VALIDATION.md` after Phase B.1 repair:

| Role | Legacy count | Canonical count | Parity |
| --- | --- | --- | --- |
| admin | bypass | bypass (informational) | 100% (bypass) |
| manager | 33 | 33 | 100% |
| doctor | 20 | 20 | 100% |
| nurse | 10 | 10 | 100% |
| receptionist | 10 | 10 | 100% |
| accountant | 25 | 25 | 100% |
| hr | 12 | 12 | 100% |
| staff | 4 | 4 | 100% |

## Shadow probe drift

Zero drift across all five slices for the entire Stage 2 window.

## Fallback verification

Simulated canonical fetch failure by forcing `v_authz_effective_permissions`
to error for a single session. Result: `usePermissions` transparently
returned legacy grants; no user was locked out, no elevated access
granted. Behavior matches `usePermissions.ts` contract.

## Exit criteria (per `CANONICAL_ACTIVATION_PLAN.md` Stage 2)

- [x] Zero drift for the full window.
- [x] No canonical-specific incidents.
- [x] No RLS or Edge Function authorization regressions.
- [x] KPI dashboard within targets (`AUTHORIZATION_KPIS.md`).

**Stage 2: COMPLETE.** Proceed to Stage 3 (production activation).
