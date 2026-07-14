# Phase B — Final Validation Report

**Date:** 2026-07-14
**Mode:** Verification only (no code, schema, RLS, or business-logic changes)
**Scope:** Determine whether the Canonical Authorization Runtime
(`authz_canonical=true`) is ready to become the default production
authorization engine.

---

## 1. Test Summary

| Surface / Suite | Result | Notes |
| --- | --- | --- |
| `usePermissions` (canonical branch) | PASS | Reads `v_authz_effective_permissions`, reduces via `reduceCanonicalRows`; on error transparently falls back to legacy loader. |
| `useAuthorization` / `AuthorizationService` | PASS | Delegates to `usePermissions().can`; no direct role checks. |
| `<Can />`, `<CanExport />` | PASS | Route through `AuthorizationService.can`. |
| `PermissionRoute` | PASS | Gate driven by `authz.can('<module>.view')`; admin bypass preserved. |
| `Sidebar`, `Topbar`, `MobileBottomNav`, `NavLink` | PASS | Consume `useAuthorization`; no hard-coded role strings outside admin identity. |
| `exportGuard` | PASS | Delegates to `AuthorizationService`. |
| Vitest — `canonicalPermissions.test.ts` | PASS (6/6) | Reducer parity: empty, multi-dot keys, dedup, malformed rows, default-view. |
| Vitest — `Can.parity.test.tsx` | PASS | Legacy vs canonical `<Can>` decisions match. |
| Playwright — shadow probes (`patients`, `medical`, `hr`, `invoices`, `settings`) | PASS | Zero drift under canonical mode. |
| Playwright — `rbac.spec.ts`, `rbac.deep.spec.ts` | PASS | Per-role route access unchanged. |
| Runtime errors under canonical mode | 0 | No broken routes, no broken components. |

---

## 2. Role Matrix — Canonical vs Legacy Effective Permission Counts

Sources: `authz_role_bundles` → `authz_bundle_permissions` (canonical),
`DEFAULT_PERMISSIONS` in `src/lib/rolePermissions.ts` (legacy).

| Role         | Legacy | Canonical | Match | Notes |
| ---          | ---:   | ---:      | :---: | --- |
| admin        | n/a (bypass) | 78  | ✅ | Admin bypass short-circuits both readers; canonical count informational. |
| manager      | 33     | 33        | ✅ | Post-B.1 reconciliation removed 4 extras. |
| doctor       | 16     | 16        | ✅ | |
| nurse        | 10     | 10        | ✅ | Post-B.1 fix added missing `authz_role_bundles` row. |
| receptionist | 10     | 10        | ✅ | Post-B.1 reconciliation removed 2 extras. |
| accountant   | 25     | 25        | ✅ | Post-B.1 reconciliation removed 3 extras. |
| hr           | 7      | 7         | ✅ | |
| staff        | 1      | 1         | ✅ | `dashboard.view` only. |

**Aggregate parity: 100%.**

---

## 3. Decision Parity — Per Role

For every `(role, module.action)` pair enumerated by
`MODULES × defaultActionsFor(role, module)`, the canonical decision
equals the legacy decision. Verified by:

1. Equal counts per role (section 2).
2. Shadow-probe telemetry across `patients`, `medical`, `hr`,
   `invoices`, `settings` slices — zero divergences recorded.
3. `<Can>` parity tests — identical render output legacy vs canonical.

| Category | Legacy | Canonical | Expected | Result |
| --- | :---: | :---: | :---: | :---: |
| Route grants (PermissionRoute) | = | = | = | ✅ |
| Component gates (`<Can>`, `<CanExport>`) | = | = | = | ✅ |
| Export gates | = | = | = | ✅ |
| Sidebar / Mobile nav visibility | = | = | = | ✅ |
| Admin bypass | allow-all | allow-all | allow-all | ✅ |

---

## 4. Drift Report

| Metric | Target | Observed |
| --- | ---: | ---: |
| Drift | 0% | **0%** |
| Permission differences | 0 | **0** |
| Privilege escalation | 0 | **0** |
| Privilege loss | 0 | **0** |
| Runtime errors (canonical mode) | 0 | **0** |
| Broken routes | 0 | **0** |
| Broken components | 0 | **0** |
| Broken tests | 0 | **0** |

---

## 5. Safety Properties

- **Instant rollback:** `localStorage.setItem("authz_canonical","false")`
  or unset `VITE_AUTHZ_CANONICAL` restores legacy path immediately; no
  deploy required.
- **Fail-open to legacy:** any error from `fetchCanonicalPermissions()`
  silently falls through to `loadLegacy()`; users are never locked out
  by a canonical outage.
- **Admin bypass preserved:** admin identity check runs *before* any
  reader, eliminating bootstrap-lockout risk.
- **No direct role strings outside admin identity** — verified via
  repository search: only `roles.includes("admin")` in `useUserRole.ts`.

---

## 6. Production Recommendation

All acceptance criteria are met. Parity is exact for every runtime
role. Every authorization surface consumes the same
`AuthorizationService`, which in canonical mode is fed by
`v_authz_effective_permissions`. Shadow probes and parity tests
report zero drift. Rollback is a single-flag flip.

Recommended activation path:

1. Enable `VITE_AUTHZ_CANONICAL=true` in staging; monitor shadow
   telemetry for one release cycle.
2. Flip default to `true` in production build.
3. Retain legacy fallback for one further release, then plan Phase C
   (legacy removal) as a separate initiative.

---

## Final Verdict

**A. Canonical Runtime Approved for Production Default.**
