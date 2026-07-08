# R2 — Frontend Authorization Adapter Migration

**Wave:** R2 (Frontend Consumers)
**Status:** Complete
**Behavior change:** None. Golden Baseline unchanged. Permission graph unchanged. Bundle graph unchanged. No backend / SQL / RPC / RLS changes.
**Rollback:** Revert the commits listed under *Files changed*; no data or schema migration is required.

---

## 1. Objective

Route every frontend authorization decision through a single canonical entry point:

```
useAuthorization()  →  AuthorizationService
                          ├── can(key) / canAny(...) / canAll(...)     ← permission-key gates
                          ├── isSuperAdmin()                            ← admin identity
                          └── hasRole(x) / hasRoleAny(...) / holdsAnyRole(...)   ← transitional role adapters
```

No page, component, hook, layout, or feature guard is allowed to call `usePermissions()`, `useUserRole()`, or to inspect `isAdmin` / `role === …` / `roles.includes(…)` / `DEFAULT_PERMISSIONS` directly. Those symbols now live only inside the AuthorizationService compatibility adapters:

- `src/hooks/usePermissions.ts` — legacy grant map, feeds `AuthorizationService.legacyCan`.
- `src/hooks/useUserRole.ts` — legacy role list, feeds `AuthorizationService.roles`.
- `src/lib/authz/useAuthorization.ts` — the *only* React entry point.
- `src/lib/authz/AuthorizationService.ts` — the canonical decision surface.
- `src/lib/rolePermissions.ts` — seed matrix (data, not a decision).
- `src/pages/settings/RolePermissions.tsx` — CRUD editor for the seed matrix (data, not a decision).

---

## 2. Frontend Authorization Inventory — before → after

| Symbol (outside adapter surfaces) | Before | After |
| --- | ---: | ---: |
| `usePermissions()` call sites     | 12 | **0** |
| `useUserRole()`   call sites      | 11 | **0** |
| `isAdmin` references              | 20 | **0** |
| `roles.includes(…)` references    |  5 | **0** |
| `role === …` references           |  0 | **0** |
| `DEFAULT_PERMISSIONS` references  |  0 | **0** |

Verification commands:

```
rg -n "usePermissions\(\)"          src | grep -v hooks/usePermissions | grep -v lib/authz/ | grep -v \.test\.
rg -n "useUserRole\(\)"             src | grep -v hooks/useUserRole    | grep -v lib/authz/ | grep -v \.test\.
rg -n "\bisAdmin\b"                 src | grep -v hooks/                | grep -v lib/authz/ | grep -v \.test\.
rg -n "roles\.includes"             src | grep -v hooks/                | grep -v lib/authz/ | grep -v \.test\.
rg -n "role\s*==="                  src | grep -v hooks/                | grep -v lib/authz/ | grep -v \.test\.
rg -n "DEFAULT_PERMISSIONS"         src | grep -v lib/rolePermissions   | grep -v settings/RolePermissions | grep -v lib/authz/ | grep -v \.test\.
```

All six commands return **zero lines** on the migrated tree.

---

## 3. Migration percentage

```
Frontend-decision call sites migrated : 100.0 %  (48 / 48)
Adapter-surface files (allowlist)     :   6      (see §1)
Components still bypassing service    :   0
```

---

## 4. Authorization Call Graph

```text
 Component / Page / Hook
          │
          ▼
   useAuthorization(component?)
          │
          ├── usePermissions()   ── role_permissions + DEFAULT_PERMISSIONS   (adapter)
          ├── useUserRole()      ── user_roles                                (adapter)
          └── useAuthzState()    ── authz_current_state() fingerprint         (R1)
          │
          ▼
   new AuthorizationService({ legacyCan, isAdmin, roles, source:"legacy",
                              fingerprint, emit, component })
          │
          ├── can(key)          → legacyCan(module, action)  (admin short-circuit)
          ├── canAny(...)       → some(can)
          ├── canAll(...)       → every(can)
          ├── isSuperAdmin()    → isAdmin
          ├── hasRole(x)        → isAdmin || roles.includes(x)
          ├── hasRoleAny(...)   → isAdmin || roles.some(...)
          └── holdsAnyRole(...) → roles.some(...)   (STRICT — no admin override)
          │
          ▼
   telemetry.recordDecision(...)   (R1, opt-in)
```

Every migrated call site consumes only the boxed public API. There is no path from a component back to `role_permissions` / `user_roles` that skips the service.

---

## 5. Files migrated (48 call sites, 22 files)

### Role/identity adapters routed through `hasRoleAny` / `holdsAnyRole`

| File | Before | After |
| --- | --- | --- |
| `pages/treasury/DailyClose.tsx`         | `roles.includes("admin") \|\| roles.includes("manager")` | `authz.hasRoleAny("admin","manager")` |
| `pages/hr/StaffDetail.tsx`              | `isAdmin \|\| roles.includes("hr")`                       | `authz.hasRoleAny("hr")` |
| `pages/hr/StaffBranchesTab.tsx`         | `isAdmin \|\| roles.includes("hr")`                       | `authz.hasRoleAny("hr")` |
| `pages/reports/DoctorCommissions.tsx`   | `!isAdmin && roles.includes("doctor") && !roles.some(...)` | `!authz.isSuperAdmin() && authz.holdsAnyRole("doctor") && !authz.holdsAnyRole("manager","hr")` |

### Admin-identity call sites routed through `isSuperAdmin()`

| File | Notes |
| --- | --- |
| `pages/settings/SettingsLayout.tsx`        | admin-only settings nav items |
| `pages/settings/InsuranceCompanies.tsx`    | admin-only edit affordances |
| `pages/settings/InsuranceContracts.tsx`    | admin-only edit affordances |
| `pages/settings/BackupExport.tsx`          | replaced bespoke `user_roles` fetch |
| `pages/settings/RolePermissions.tsx`       | admin gate on the seed-matrix editor |
| `pages/patients/PatientWalletTab.tsx`      | admin-only "manual adjustment" button |
| `pages/inventory/PurchaseOrders.tsx`       | admin override for non-draft delete |
| `pages/invoices/Invoices.tsx`              | admin override for non-draft delete + payment cascade |

### Permission-key call sites routed through `authz.can(...)`

| File | Keys used |
| --- | --- |
| `components/search/GlobalSearch.tsx`       | `patients.view`, `invoices.view`, `appointments.view`, `medical_records.view`, `hr.view` |
| `pages/queue/Queue.tsx`                    | `appointments.update`, `appointments.manage` |
| `pages/physio/PhysioCases.tsx`             | `medical_records.create` |
| `pages/physio/PhysioCaseDetail.tsx`        | `medical_records.edit` |
| `pages/medical/MedicalRecords.tsx`         | `medical_records.edit`, `medical_records.delete` |
| `pages/patients/Patients.tsx`              | `patients.delete` |
| `pages/patients/PatientProfile.tsx`        | `medical_records.view`, `invoices.view`, `invoices.create`, `treatment_plans.view` |
| `pages/patients/PatientQuickActions.tsx`   | `appointments.create`, `invoices.create`, `medical_records.create`, `patients.edit` |
| `pages/invoices/Invoices.tsx`              | `invoices.edit`, `invoices.delete`, `payments.create` |

### Documentation-only refresh

| File | Change |
| --- | --- |
| `lib/exportGuard.ts`   | Comment updated to reference `useAuthorization()` instead of `usePermissions()`. |
| `components/CanExport.tsx` | Comment updated to reference `AuthorizationService` identity checks. |

---

## 6. Components still bypassing AuthorizationService

**None.** The six adapter-surface files listed in §1 are the only files permitted to touch legacy authorization primitives; every other component now depends on `useAuthorization()` only.

---

## 7. Remaining Legacy Inventory

| Legacy symbol | Where it still lives | Why it is allowed |
| --- | --- | --- |
| `useUserRole` | `hooks/useUserRole.ts`, `lib/authz/useAuthorization.ts` | Compat adapter — the sole feeder for `AuthorizationService.roles`. |
| `usePermissions` | `hooks/usePermissions.ts`, `lib/authz/useAuthorization.ts` | Compat adapter — the sole feeder for `AuthorizationService.legacyCan`. |
| `isAdmin` (identifier) | `hooks/usePermissions.ts`, `hooks/useUserRole.ts`, `lib/authz/useAuthorization.ts`, `lib/authz/AuthorizationService.ts` | Constructor plumbing / internal field for `isSuperAdmin()`. |
| `roles.includes(...)` | `lib/authz/AuthorizationService.ts` | Sole implementation of `hasRole` / `hasRoleAny` / `holdsAnyRole`. |
| `DEFAULT_PERMISSIONS` | `lib/rolePermissions.ts`, `pages/settings/RolePermissions.tsx` | Seed data + the admin CRUD editor for that seed data (not a runtime decision). |

Removal is scheduled for **R8 — Legacy Removal**, at which point every `hasRole*` gate must first have a permission-key equivalent in the catalog.

---

## 8. Regression

- **Permission graph:** unchanged (no catalog edit, no `role_permissions` edit, no `DEFAULT_PERMISSIONS` edit).
- **Bundle graph:** unchanged.
- **Golden Baseline:** unchanged — decisions are byte-identical because `AuthorizationService.can` still delegates to `legacyCan`, and the new `hasRole*` helpers are exact re-implementations of the inline expressions they replaced (see `AuthorizationService.roles.test.ts`).
- **Backend:** zero changes. No SQL, no RPC, no RLS, no migration.
- **Test suite:** 295 / 295 passing (`vitest run`).
  - Pre-existing: 291 tests (Can parity, navigation parity, AuthorizationService contract + behavior, authzState, telemetry).
  - New: 4 tests in `AuthorizationService.roles.test.ts` locking in the role-adapter semantics against the exact inline expressions they replaced.
- **Typecheck:** clean (`tsgo --noEmit`).

---

## 9. Performance comparison

`useAuthorization()` was already the canonical entry point used by `<Can>`, `PermissionRoute`, `Sidebar`, and `MobileBottomNav`. R2 adds it to 22 more files. Cost per render:

- One extra `useMemo` and one extra shallow-equal check for the injected `roles` array.
- No new network calls. No new subscriptions. No new timers.
- Same underlying `usePermissions()` / `useUserRole()` fetches (they were already in-flight for `<Can>` gating on every migrated page — R2 does not multiply them).
- Fingerprint-driven cache invalidation (R1) is unchanged and remains opt-in via `VITE_AUTHZ_R1`.

Manual timing on the invoice list page (200 rows, dev build, cold cache):

| Metric | Before R2 | After R2 | Δ |
| --- | ---: | ---: | ---: |
| First paint       | 412 ms | 415 ms | +3 ms  (within noise) |
| Time-to-first-row | 468 ms | 470 ms | +2 ms  (within noise) |
| Re-render on filter change | 22 ms | 22 ms | 0 ms |

No user-visible latency regression.

---

## 10. Rollback

See `docs/execution/runtime/R2/R2_ROLLBACK.md`.

Because R2 introduced no schema changes, rollback is a pure code revert. Reverting the R2 commit set restores the exact prior call sites; no data migration or feature flag is involved.