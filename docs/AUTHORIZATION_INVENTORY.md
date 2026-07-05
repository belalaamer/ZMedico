# Authorization Inventory & Migration Readiness Audit (Wave 1.5)

Status: **Audit only.** No code, schema, RLS, roles, or permissions were modified while producing this document. All findings are derived from a read-only scan of the repository as of the Wave 1 completion snapshot.

This document is the pre-flight checklist for Wave 2 (frontend migration to `AuthorizationService`). Wave 2 may not start until every item in §9 is satisfied.

---

## 1. Authorization Usage Inventory

Legend for **Method** column:

- `usePermissions` — legacy per-module hook (`src/hooks/usePermissions.ts`)
- `useUserRole` — raw role list hook (`src/hooks/useUserRole.ts`)
- `<Can>` / `<CanExport>` — declarative wrappers around `usePermissions`
- `PermissionRoute` — route-level gate, path→module via `moduleForPath`
- `isAdmin` — boolean derived from `useUserRole` (or ad-hoc query)
- `roles.includes(...)` — hardcoded role membership check
- `has_role` RPC — DB SECURITY DEFINER, called from Edge Functions
- `AuthorizationService` — Wave 1 canonical service (currently dormant)

### 1.1 Frontend — Core primitives

| File | Symbol | Method | Purpose | Replacement (Wave 2+) |
|---|---|---|---|---|
| `src/hooks/usePermissions.ts` | `usePermissions()` | Legacy | Loads `role_permissions` + `DEFAULT_PERMISSIONS`; exposes `can(module, action)` | Keep as adapter; internally delegate to `useAuthorization()` in Wave 3 |
| `src/hooks/useUserRole.ts` | `useUserRole()` | Legacy | Loads `user_roles`; exposes `roles[]`, `isAdmin` | Keep, but callers switch to `useAuthorization().authz.can(...)` |
| `src/components/Can.tsx` | `<Can>` | `usePermissions` | Conditional render | Rewire to `useAuthorization().authz.can(key)` in Wave 3 |
| `src/components/CanExport.tsx` | `<CanExport>` | `<Can action="export">` | Export/print/PDF button gate | Same as `<Can>` |
| `src/components/PermissionRoute.tsx` | `<PermissionRoute>` | `usePermissions` + `moduleForPath` | Route gate + admin-only routes | Wave 2 Batch 1 — rewire to `authz.can(...)` preserving `adminOnly` |
| `src/lib/authz/AuthorizationService.ts` | `AuthorizationService` | New | Canonical `can/canAny/canAll` | The replacement itself |
| `src/lib/authz/useAuthorization.ts` | `useAuthorization()` | Wraps `usePermissions` | Ready-to-use React binding | Consumed by all migrated call sites |

### 1.2 Frontend — Layout & navigation

| File | Line | Method | Purpose |
|---|---|---|---|
| `src/components/layout/Sidebar.tsx` | 19 | `usePermissions().can + isAdmin` | Filter sidebar groups/items |
| `src/components/layout/Sidebar.tsx` | 83 | `can(...) && isAdmin` | Restrict procedures catalog link |
| `src/components/layout/Sidebar.tsx` | 134 | `isAdmin && { to: "/branches" }` | Branches nav visibility |
| `src/components/MobileBottomNav.tsx` | 11 | `usePermissions().can` | Mobile nav filter |
| `src/components/search/GlobalSearch.tsx` | 22 | `usePermissions().can` | Filter global-search results by module visibility |

### 1.3 Frontend — Route gates (`src/App.tsx`)

All 40+ route elements are wrapped in `<PermissionRoute>`; a subset uses `adminOnly`. Because `PermissionRoute` centralizes the check, migrating that single component covers every route in one commit.

`adminOnly` routes:

- `/queue/self-audit`
- `/expenses/self-audit`

### 1.4 Frontend — Pages using `<Can>` / `<CanExport>` (12 files, 23 sites)

| File | Occurrences | Modules gated |
|---|---|---|
| `src/pages/patients/PatientProfile.tsx` | 5 | patients, treatment_plans, medical_records, invoices |
| `src/pages/physio/PhysioCaseDetail.tsx` | 5 | medical_records |
| `src/pages/patients/Patients.tsx` | 2 | patients |
| `src/pages/invoices/Invoices.tsx` | 2 | invoices |
| `src/pages/reports/_shared.tsx` | 1 (`<CanExport>`) | dynamic `module` prop — used by every report page |
| `src/pages/patients/PatientTreatmentPlans.tsx` | 1 | treatment_plans |
| `src/pages/patients/PatientWalletTab.tsx` | 1 | invoices |
| `src/pages/medical/MedicalRecords.tsx` | 1 | medical_records |
| `src/pages/physio/PhysioCases.tsx` | 1 | medical_records |
| `src/pages/invoices/OutstandingDebts.tsx` | 1 | invoices |
| `src/pages/hr/StaffDetail.tsx` | 1 | settings |

### 1.5 Frontend — Pages using `usePermissions().can` directly

- `src/pages/patients/PatientQuickActions.tsx` (18)
- `src/pages/patients/PatientProfile.tsx` (36)

Portable: `can(m, a)` → `authz.can("<m>.<a>")`.

### 1.6 Frontend — Pages using `useUserRole` / `isAdmin` / `roles.includes`

| File | Line | Pattern | Purpose | Category |
|---|---|---|---|---|
| `src/pages/settings/RolePermissions.tsx` | 43, 72, 102, 113, 167 | `isAdmin` gate + read-only mode + redirect | Admin-only editor for role permissions | **Critical** |
| `src/pages/settings/BackupExport.tsx` | 15, 44, 97, 105–112 | Local `isAdmin` state from ad-hoc query, gates every export button | Backup/export access | **Critical** |
| `src/pages/settings/InsuranceContracts.tsx` | 28, 180, 219, 230, 266 | `isAdmin` toggles edit/delete controls | Contract management | **High** |
| `src/pages/inventory/PurchaseOrders.tsx` | 33, 64, 235 | `isAdmin` gate to edit non-draft PO / delete | PO edit lockout | **High** |
| `src/pages/hr/StaffDetail.tsx` | 32, 36 | `isAdmin || roles.includes("hr")` → `canSeeSensitive` | Sensitive HR field visibility | **Critical** (PHI/PII) |
| `src/pages/hr/StaffBranchesTab.tsx` | 22–23 | `isAdmin || roles.includes("hr")` → `canManage` | Staff/branch assignment | **High** |
| `src/pages/reports/DoctorCommissions.tsx` | 16–17 | `!isAdmin && roles.includes("doctor") && !roles.some(...)` | Doctor sees only own commissions | **High** (scope) |
| `src/pages/patients/PatientWalletTab.tsx` | 58, 102 | `isAdmin` for wallet admin actions | Wallet mutations | **High** |
| `src/pages/settings/SettingsLayout.tsx` | — | `useUserRole` | Settings sub-nav | **Medium** |
| `src/pages/settings/InsuranceCompanies.tsx` | — | `useUserRole` | Company edit | **Medium** |
| `src/pages/queue/Queue.tsx` | — | `useUserRole` | Queue actions | **Medium** |
| `src/pages/treasury/DailyClose.tsx` | — | `useUserRole` | Close/reopen gate | **High** |
| `src/lib/exportGuard.ts` | — | Role/permission wrapper for exports | Export throttling | **Medium** |

### 1.7 Backend — Edge Functions

| Function | Method | Purpose |
|---|---|---|
| `admin-create-user` | `rpc('has_role', {_role:'admin'})` + hardcoded allow-list of role strings | Provision user + role + staff profile |
| `admin-delete-user` | `rpc('has_role')` | Delete user + related rows |
| `admin-reset-password` | `rpc('has_role')` | Reset a user's password |
| `admin-export` | Direct `.from('user_roles').eq('role','admin')` (does NOT use `has_role`) | Bulk export of tables |
| `send-reminder` | Direct `.from('user_roles').eq('role','admin')` OR cron secret | Bulk reminder send |
| `detect-queue-alerts` | Service role, no user auth (cron) | Alert detection |
| `enqueue-winback` | Service role, cron-only | Winback campaign |

**Inconsistency:** `admin-export` and `send-reminder` bypass the canonical `has_role` RPC and query `user_roles` directly with the service key. Behaviorally equivalent today; drifts from the single-source-of-truth pattern.

### 1.8 Backend — DB primitives (informational; no schema changes)

| Object | Kind | Notes |
|---|---|---|
| `has_role(uuid, app_role)` | SECURITY DEFINER fn | Canonical role check; referenced by RLS policies + edge functions |
| `has_permission(uuid, text)` | SECURITY DEFINER fn (Wave 1) | Future canonical check. **Not yet referenced by any policy or code.** |
| `v_authz_effective_permissions` | View (Wave 1) | Flattened effective perms; not yet read |
| `role_permissions` | Table | Legacy per-module actions; read by `usePermissions` |
| `authz_*` (5 tables) | Tables (Wave 1) | New catalog; read-open, admin-write |
| RLS on 100+ tables | Policies | Primarily `has_role(auth.uid(),'admin')` + owner/branch checks (see §4) |

---

## 2. Hardcoded Authorization Report

A "hardcoded" check is any authorization decision expressed as literal role names (`"admin"`, `"hr"`, `"doctor"`) or `isAdmin` short-circuits outside of `AuthorizationService`, `<Can>`, `<CanExport>`, or `PermissionRoute`.

| # | File | Snippet | Severity | Rationale |
|---|---|---|---|---|
| 1 | `src/pages/settings/RolePermissions.tsx` | `if (!isAdmin) return; ... <Navigate ... />` | **Critical** | Gates the permission editor itself; a bug = privilege escalation |
| 2 | `src/pages/settings/BackupExport.tsx` | Local `isAdmin` from ad-hoc `user_roles` query | **Critical** | Export = exfiltration surface; duplicates role-fetch logic |
| 3 | `src/pages/hr/StaffDetail.tsx` | `canSeeSensitive = isAdmin || roles.includes("hr")` | **Critical** | Governs PHI/PII field visibility |
| 4 | `src/pages/reports/DoctorCommissions.tsx` | `!isAdmin && roles.includes("doctor") && !roles.some(r => ["manager","hr"].includes(r))` | **High** | Multi-role composite; brittle to new roles |
| 5 | `src/pages/settings/InsuranceContracts.tsx` | `isAdmin` on 4 controls | **High** | Contract edits affect billing |
| 6 | `src/pages/inventory/PurchaseOrders.tsx` | `po.status !== "draft" && !isAdmin` | **High** | Financial workflow bypass |
| 7 | `src/pages/hr/StaffBranchesTab.tsx` | `canManage = isAdmin || roles.includes("hr")` | **High** | Branch assignment = scope elevation |
| 8 | `src/pages/patients/PatientWalletTab.tsx` | `{isAdmin && (...)}` | **High** | Wallet mutations |
| 9 | `src/pages/treasury/DailyClose.tsx` | `useUserRole` based gate | **High** | Financial close |
| 10 | `src/components/layout/Sidebar.tsx` | `can(...) && isAdmin`, `isAdmin && { to: "/branches" }` | **Medium** | UI-only; backend also enforces |
| 11 | `src/pages/settings/SettingsLayout.tsx` | `useUserRole` for sub-nav | **Medium** | UI-only |
| 12 | `src/pages/settings/InsuranceCompanies.tsx` | `useUserRole` | **Medium** | UI-only |
| 13 | `src/pages/queue/Queue.tsx` | `useUserRole` | **Medium** | UI-only |
| 14 | `supabase/functions/admin-create-user/index.ts` | Hardcoded role allow-list `["admin","manager","doctor","nurse",...]` | **High** | Not driven by catalog |
| 15 | `supabase/functions/admin-export/index.ts` | Direct `user_roles` query instead of `has_role` | **Medium** | Drift from canonical check |
| 16 | `supabase/functions/send-reminder/index.ts` | Direct `user_roles` query | **Medium** | Same drift |

**Totals:** 4 Critical · 6 High · 5 Medium · 0 Low.

---

## 3. Frontend Authorization Coverage

### 3.1 Route coverage (from `src/App.tsx`)

Every application route is wrapped in `<PermissionRoute>`. Two routes use `adminOnly`. No route bypasses gating. `AuthorizationService` is not yet used by any route (Wave 1 was dormant).

| Route class | Count | Mechanism | AuthzService | Legacy `usePermissions` | Hardcoded |
|---|---|---|---|---|---|
| Standard app routes | ~40 | `<PermissionRoute>` | No | Yes (via `PermissionRoute`) | No |
| Admin-only routes | 2 | `<PermissionRoute adminOnly>` | No | Yes | Yes (`isAdmin`) |
| Auth routes (`/auth`, `/auth/callback`, `/reset-password`) | 3 | Public | — | — | — |

### 3.2 Page-level coverage

| Bucket | Files | AuthzService | Legacy | Hardcoded |
|---|---|---|---|---|
| Uses `<Can>`/`<CanExport>` only | 12 | No | Yes | No |
| Uses `usePermissions().can` directly | 2 | No | Yes | No |
| Uses `useUserRole`/`isAdmin` | 13 | No | Yes | **Yes** |
| Uses ad-hoc auth query | 1 (`BackupExport.tsx`) | No | No | **Yes** |
| No authorization at all | Remaining pages inherit route-level gate only | — | — | — |

**Summary:** 0 of ~150 UI files consume `AuthorizationService` today. 16 files contain hardcoded checks that must be re-expressed as permission keys before Wave 3 can retire `usePermissions`.

---

## 4. Backend Authorization Coverage

### 4.1 RLS policies (aggregate)

Per the schema summary, 100+ public tables carry a total of ~400 policies. Dominant patterns observed:

| Pattern | Approx. share | Example tables |
|---|---|---|
| Admin-only via `has_role(auth.uid(),'admin')` | ~55% of write policies | `authz_*`, `role_permissions`, `system_backups`, `saas_*`, `tenants` |
| Role-list via multiple `has_role` disjunctions | ~20% | `invoices`, `payments`, `expenses`, `treasury*` |
| Owner-based (`auth.uid() = created_by`) | ~10% | `saved_reports`, `notifications`, some `medical_records` |
| Branch-scoped via join to `staff_branches` | ~10% | `appointments`, `patients`, `attendance` |
| Authenticated-read-open | ~5% | catalog tables (`medications`, `procedures`, `services`) |

**None** currently call `has_permission(...)`. By design for Wave 1.

### 4.2 SECURITY DEFINER functions

| Function | Current | Future | Priority |
|---|---|---|---|
| `has_role` | Canonical role check | Keep as lower-level primitive under `has_permission` | Low |
| `has_permission` | Wave 1 additive | Becomes canonical entry point once RLS migrates | Wave 4 |
| Tenant/branch resolvers | Owner/branch derivation | Extend with scope resolution per SCOPE_OWNERSHIP_MODEL | Wave 5 |

### 4.3 Edge Functions

| Function | Current | Future | Priority |
|---|---|---|---|
| `admin-create-user` | `has_role` + hardcoded role allow-list | `has_permission('iam.users.create')` + catalog-driven role list | High |
| `admin-delete-user` | `has_role` | `has_permission('iam.users.delete')` | High |
| `admin-reset-password` | `has_role` | `has_permission('iam.users.reset_password')` | High |
| `admin-export` | Direct `user_roles` query | Switch to `has_role` (parity fix), then `has_permission('data.export.run')` | High |
| `send-reminder` | Direct `user_roles` query OR cron secret | Same migration path | Medium |
| `detect-queue-alerts` | Service role, cron | Unchanged (system principal) | N/A |
| `enqueue-winback` | Service role, cron | Unchanged | N/A |

### 4.4 RPCs called from frontend

Grep of `supabase.rpc(` in `src/` returns no authorization-relevant calls. Wave 2 must preserve this.

---

## 5. Dead Authorization

Conservative findings — anything ambiguous is listed as "review", not "delete", preserving Wave 1's zero-behavior-change guarantee.

### 5.1 Dead / suspect roles

- `staff` role: seeded in `DEFAULT_PERMISSIONS` with only `appointments: ["view"]`. No provisioning path assigns it. **Review**.
- No wholly-dead roles detected in `user_roles` schema.

### 5.2 Dead / suspect permissions

- Module `reports` (parent bucket) coexists with `reports_finance|medical|operational|hr|inventory`. Parent is granted to most roles but no UI check distinguishes it. **Consolidation candidate.**
- Action `export` on `hr` module: never referenced by any `<CanExport>` site. **Review.**
- Action `delete` is admin-only across every module by design (see `rolePermissions.ts` comment). Intentional, not dead.

### 5.3 Dead / suspect bundles (Wave 1 catalog)

All eight seeded role bundles map 1:1 to a legacy role. None orphaned. `authz_bundle_implies` is empty by design.

### 5.4 Unused permission keys

`AuthorizationService.can("<module>.<action>")` is not called anywhere outside its test file, so every catalog key is currently unused at runtime. Expected for Wave 1 (dormant); not a defect.

### 5.5 Duplicates

- Duplicate permission mappings: `role_permissions` rows can override `DEFAULT_PERMISSIONS`; a DB row that exactly matches the default is redundant (harmless).
- Duplicate bundle mappings: none.
- Duplicate role mappings: none.

---

## 6. Drift Detection

Compared five sources: `PERMISSION_CATALOG.md`, `ROLE_ARCHITECTURE.md`, DB `role_permissions`, `DEFAULT_PERMISSIONS` in `rolePermissions.ts`, and the Wave 1 `authz_*` seed.

| # | Source A | Source B | Mismatch |
|---|---|---|---|
| 1 | `ROLE_ARCHITECTURE.md` (15+ granular roles) | `app_role` enum + `DEFAULT_PERMISSIONS` (8 roles) | Architecture defines future roles (`system_owner`, `security_admin`, `physician`, etc.) not yet seeded. Expected — bridging is Wave 3+. |
| 2 | `PERMISSION_CATALOG.md` grammar `<group>.<resource>.<action>[.<qualifier>]` | Legacy keys `<module>.<action>` | Two grammars coexist. `AuthorizationService` accepts the legacy subset only. |
| 3 | `DEFAULT_PERMISSIONS.receptionist` grants `invoices: ["view","create"]` | RLS on `invoices` typically requires accountant/admin for write | Frontend allows the button; backend rejects. Verify parity in Wave 2 testing. |
| 4 | `DEFAULT_PERMISSIONS.manager` grants `inventory: [...,"edit"]` | RLS on `inventory` write path scoped to inventory/admin roles | Same — reconcile in Wave 2. |
| 5 | `SCOPE_OWNERSHIP_MODEL.md` mandates branch scope for `appointments` | `DEFAULT_PERMISSIONS` has no scope dimension | Scope missing from legacy model entirely; introduced in Wave 5. |
| 6 | Edge fn `admin-create-user` hardcoded role list | `app_role` enum (DB) | Enum can grow without updating the edge function → silent drift. |
| 7 | `admin-export` / `send-reminder` bypass `has_role` | Every other edge fn uses `has_role` | Style drift; behavioral parity today. |
| 8 | `WAVE1_AUTHZ_FOUNDATION.md` states no policy calls `has_permission` | Verified — no drift. | — |

---

## 7. Migration Risk Matrix

| Mechanism | Risk | Complexity | Dependencies | Effort | Rollback |
|---|---|---|---|---|---|
| `PermissionRoute` | **High** (every route) | Low | `moduleForPath`, `AuthorizationService` | 0.5 d | Trivial — single-file revert |
| Sidebar / MobileBottomNav / GlobalSearch | Medium | Low | `AuthorizationService` | 0.5 d | Trivial |
| `<Can>` / `<CanExport>` internals | Low | Low | `AuthorizationService` | 0.25 d | Trivial (props unchanged) |
| Pages using `usePermissions().can` directly (2) | Low | Low | — | 0.25 d | Trivial |
| Pages using `isAdmin`/`roles.includes` (13) | **High** | Medium | New catalog keys per site | 2 d | Per-file revert |
| `BackupExport.tsx` ad-hoc query | **Critical** | Medium | Needs `data.export.run` key | 0.5 d | Trivial |
| `RolePermissions.tsx` admin gate | **Critical** | Low | `iam.roles.edit` key | 0.25 d | Trivial |
| `DoctorCommissions.tsx` composite | High | Medium | Full scope model = Wave 5; migrate boolean only in Wave 2 | 0.5 d | Trivial |
| Edge fn `has_role` sites | Medium | Low | Keep `has_role`, add wrapper | Wave 4 | Redeploy prior fn |
| RLS policies | **Critical** | High | `has_permission` maturity + tests | Wave 4–5 | Reversal SQL required |

---

## 8. Wave 2 Execution Plan

Wave 2 replaces **frontend** authorization consumption only. RLS, edge functions, roles, and permissions are untouched. Every batch is independently mergeable and revertible.

### Batch 1 — Route & navigation shell

- **Files:** `src/components/PermissionRoute.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/MobileBottomNav.tsx`, `src/components/search/GlobalSearch.tsx`.
- **Behavior:** Identical. `PermissionRoute` computes a permission key from `moduleForPath` + `"view"` and calls `authz.can(...)`. `adminOnly` maps to `authz.can("system.admin.access")` (or continues to short-circuit on `isAdmin` until Wave 3).
- **Risk:** High (every route). Mitigated because the check maps 1:1 to today.
- **Rollback:** Revert commits.
- **Testing:** Full Playwright RBAC suite (`tests/playwright/rbac*.spec.ts`) green under every seeded role. Manual smoke of `/queue/self-audit` and `/expenses/self-audit`.

### Batch 2 — Declarative wrappers

- **Files:** `src/components/Can.tsx`, `src/components/CanExport.tsx`.
- **Behavior:** Internals swap to `useAuthorization()`. Public props (`module`, `action`) unchanged so no consumer touches.
- **Risk:** Low.
- **Rollback:** Trivial.
- **Testing:** Vitest snapshot on `<Can>` render matrix; targeted Playwright on invoice/report export buttons.

### Batch 3 — Settings / Reports / Audit

- **Files:** `src/pages/settings/RolePermissions.tsx`, `src/pages/settings/BackupExport.tsx`, `src/pages/settings/SettingsLayout.tsx`, `src/pages/settings/InsuranceContracts.tsx`, `src/pages/settings/InsuranceCompanies.tsx`, `src/pages/reports/DoctorCommissions.tsx`, `src/pages/reports/_shared.tsx` (verify-only).
- **Behavior:** All `isAdmin` and `roles.includes` sites replaced with named permission keys (`iam.roles.edit`, `data.export.run`, `finance.insurance_contracts.edit`, etc.). Where a Wave 5 scope is required (e.g. doctor-only commissions), keep the composite check inline with a `// TODO(wave5-scope)` marker.
- **Risk:** Critical (governance surfaces).
- **Rollback:** Per-file revert.
- **Testing:** RBAC spec + dedicated test for `RolePermissions` and `BackupExport` gating.

### Batch 4 — Finance / Treasury / Inventory

- **Files:** `src/pages/treasury/DailyClose.tsx`, `src/pages/inventory/PurchaseOrders.tsx`, `src/pages/invoices/Invoices.tsx`, `src/pages/invoices/OutstandingDebts.tsx`, `src/pages/patients/PatientWalletTab.tsx`, `src/lib/exportGuard.ts`.
- **Behavior:** `isAdmin` replaced with domain keys (`finance.treasury.close`, `inventory.purchase_orders.edit_locked`, `finance.wallet.mutate`, `data.export.run`).
- **Risk:** High.
- **Rollback:** Per-file revert.
- **Testing:** Full financial-role RBAC matrix in Playwright + backend parity (RLS still enforces).

### Batch 5 — Clinical / Patients / Appointments / HR

- **Files:** `src/pages/patients/PatientProfile.tsx`, `src/pages/patients/PatientQuickActions.tsx`, `src/pages/patients/PatientTreatmentPlans.tsx`, `src/pages/patients/Patients.tsx`, `src/pages/medical/MedicalRecords.tsx`, `src/pages/physio/PhysioCases.tsx`, `src/pages/physio/PhysioCaseDetail.tsx`, `src/pages/hr/StaffDetail.tsx`, `src/pages/hr/StaffBranchesTab.tsx`, `src/pages/queue/Queue.tsx`.
- **Behavior:** `usePermissions` and `isAdmin`/`roles.includes` all routed through `useAuthorization()`. HR "sensitive fields" gate becomes `hr.staff.view_sensitive`.
- **Risk:** High (PHI/PII in HR + clinical).
- **Rollback:** Per-file revert.
- **Testing:** Playwright PHI-visibility spec; clinical-role smoke.

### Batch 6 — Cleanup

- Mark `usePermissions` and `useUserRole` `@deprecated` in JSDoc (do not remove). Add ESLint rule (warning) banning new imports of either.
- No behavior change.

---

## 9. Success Criteria (Wave 2 gate)

Wave 2 may begin **only when all of the following are true**:

1. **No unknown authorization paths remain.** §1 covers every file returned by the repo-wide grep for authorization patterns.
2. **Every hardcoded role check has an owner.** §2 lists 16 sites; each is mapped to a batch in §8.
3. **Every replacement has been mapped.** §1 and §8 name the `AuthorizationService` call that will replace each legacy site.
4. **`AuthorizationService` can replace every frontend mechanism.** Verified: `can/canAny/canAll` covers every observed pattern (`<Can>`, `<CanExport>`, `usePermissions().can`, `isAdmin`, `roles.includes`, `role === ...`, composite `!isAdmin && ...`).
5. **No hidden dependencies remain.** RLS, edge functions, and RPCs are out of Wave 2 scope and remain on `has_role`; §4 confirms none must change for Wave 2 to ship.
6. **Test harness is ready.** `tests/playwright/rbac.spec.ts` and `rbac.deep.spec.ts` exercise every seeded role against every route and must be green on `main` before Wave 2 begins.
7. **Rollback plan documented.** Each batch in §8 is a single-file or small-fileset change reversible without a migration.

If any bullet is not satisfied, do not start Wave 2 — extend this inventory instead.

---

*End of Wave 1.5 audit.*
