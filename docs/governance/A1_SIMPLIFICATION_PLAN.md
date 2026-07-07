# A1 — Authorization Simplification Plan (Target Model v2)

**Status:** Documentation only. No SQL, code, or migrations.
**Predecessor:** `docs/governance/A0_COMPLEXITY_REVIEW.md`.
**Scope:** Complete migration specification for moving the live authorization model to the simplified target. Implementation is out of scope for this sprint.

---

## 0. Preserved Guarantees (non-negotiable)

The following pillars are **kept as-is** and every migration step below is designed to preserve them:

| Pillar | Source of truth | Reason kept |
|---|---|---|
| SECURITY DEFINER Standard v1 | `docs/security/S1_SECURITY_DEFINER_STANDARD_V1.md` | Frozen; every RPC still routes auth through `auth.uid()` → `has_permission()`. |
| Compliance Framework (S2) | `scripts/authz/compliance_definer.py` | Static enforcement stays; v2 must not regress any rule R1–R9. |
| Authorization Regression Harness | `scripts/authz/run_all.sh` | Baseline diff before/after every migration wave. |
| Golden Authorization Baseline | `docs/GOLDEN_AUTHORIZATION_BASELINE.md` | New baseline captured **before** each wave; diff must match the wave's declared intent. |
| Branch scope helpers | `user_branch_ids()`, `is_admin_or_manager()` | Multi-branch isolation is unchanged. |
| Ownership model | `docs/SCOPE_OWNERSHIP_MODEL.md` | Doctor-owns-record semantics unchanged. |
| RLS architecture | Per-table policies via `has_permission()` + scope join | Unchanged; only the permission key strings on the RHS of policies are remapped. |

---

## 1. Target Model v2 (summary)

| Axis | Current (live) | Target v2 | Δ |
|---|---|---|---|
| Roles (`app_role`) | 8 | 6 | −2 |
| Bundles (`authz_bundles`) | 8 | 0 (layer removed) | −8 |
| Bundle bindings (`authz_role_bundles`) | 7 | 0 | −7 |
| Bundle permissions (`authz_bundle_permissions`) | 168 rows | 0 | −168 |
| Permission keys (`authz_permissions`) | 67 | ~50 | −17 |
| RLS predicate shape | `has_permission(uid, 'x.y')` | unchanged | 0 |
| Runtime gate | `has_permission()` | unchanged | 0 |

**Wire-format** for permission keys stays `<group>.<verb>`. Only the closed verb set narrows (`create` + `edit` → `write`; `export` retained **only** where a UI export path exists).

**Bundle layer is dropped.** `role_permissions(role, permission_key)` becomes the single source of truth for role→permission mapping (it already exists and is already the table `usePermissions()` reads).

---

## 2. Role Migration

Enum: `public.app_role`.

| Current | Target | Migration strategy | Compatibility |
|---|---|---|---|
| `admin` | `admin` | KEEP. Superset via `AuthorizationService.isSuperAdmin()` + full grants in `role_permissions`. | 100% |
| `manager` | `manager` | KEEP. Branch-scoped ops. Grants unchanged. | 100% |
| `doctor` | `doctor` | KEEP. Clinical writer. Grants unchanged (subject to §3 verb merge). | 100% |
| `nurse` | `nurse` | KEEP. Clinical assistant. Fixes N2 orphan bundle by writing grants **directly** to `role_permissions` (bundle layer removed anyway). | 100% |
| `receptionist` | `receptionist` | KEEP. Front desk. Grants unchanged. | 100% |
| `accountant` | `accountant` | KEEP. Finance. Grants unchanged. | 100% |
| `hr` | **MERGE INTO `manager`** (conditional) | If HR is not a separate department (single-clinic): reassign `hr` users to `manager` and grant `hr.*` to manager. If HR is a distinct dept: **KEEP**. Default = KEEP for backward compatibility. | 100% (KEEP path) / opt-in reassignment |
| `staff` | **REMOVE** | Only grant is `appointments.view`, held by every other role already. Reassign remaining `staff` principals to `receptionist` or `nurse`. Enum value retained until principals=0, then dropped in a hygiene migration. | Deprecation, not deletion |

**Net:** 8 → 6 (default) or 7 (if `hr` retained).

---

## 3. Permission Catalog Migration (67 → ~50)

### 3.1 Verb-axis change

| Verb | Decision | Rationale |
|---|---|---|
| `view` | KEEP | Read gate, distinct audit footprint. |
| `create` | **MERGE → `write`** | No policy in the live DB distinguishes create vs edit for the same principal. |
| `edit` | **MERGE → `write`** | Same as above. |
| `delete` | KEEP | Admin-only across every module today; stays distinct. |
| `export` | KEEP only where UI exposes an export button | See §3.3. |

`write` semantics = `INSERT OR UPDATE`. Any policy currently `has_permission(uid,'x.create') OR has_permission(uid,'x.edit')` collapses to `has_permission(uid,'x.write')`. Policies checking only one stay behaviorally identical (whoever held `create` or `edit` gets `write`).

### 3.2 Full permission mapping (all 67 keys)

Legend: **K** keep · **M** merge · **R** rename · **X** remove.

#### Appointments (5 → 4)
| Current | Action | Target |
|---|---|---|
| `appointments.view` | K | `appointments.view` |
| `appointments.create` | M | `appointments.write` |
| `appointments.edit` | M | `appointments.write` |
| `appointments.delete` | K | `appointments.delete` |
| `appointments.export` | K | `appointments.export` |

#### Clinical (15 → 12)
| Current | Action | Target |
|---|---|---|
| `medical_records.view/create/edit/delete/export` | K/M/M/K/K | `medical_records.view/write/write/delete/export` |
| `treatment_plans.view/create/edit/delete/export` | K/M/M/K/K | `treatment_plans.view/write/write/delete/export` |
| `vitals.view/create/edit/delete/export` | K/M/M/K/K | `vitals.view/write/write/delete/export` |

#### Finance (15 → 12)
| Current | Action | Target |
|---|---|---|
| `invoices.view/create/edit/delete/export` | K/M/M/K/K | `invoices.view/write/write/delete/export` |
| `treasury.view/create/edit/delete/export` | K/M/M/K/K | `treasury.view/write/write/delete/export` |
| `coupons.view/create/edit/delete/export` | K/M/M/K/K | `coupons.view/write/write/delete/export` |

#### Inventory (5 → 4)
| Current | Action | Target |
|---|---|---|
| `inventory.view/create/edit/delete/export` | K/M/M/K/K | `inventory.view/write/write/delete/export` |

#### Patients (5 → 4)
| Current | Action | Target |
|---|---|---|
| `patients.view/create/edit/delete/export` | K/M/M/K/K | `patients.view/write/write/delete/export` |

#### HR (5 → 4)
| Current | Action | Target |
|---|---|---|
| `hr.view/create/edit/delete/export` | K/M/M/K/K | `hr.view/write/write/delete/export` |

#### Settings (5 → 4 + 1 relocation)
| Current | Action | Target |
|---|---|---|
| `settings.view/create/edit/delete` | K/M/M/K | `settings.view/write/write/delete` |
| `settings.export` | **R → `audit.read`** on `audit_logs` / `user_activity_logs` (per N4 §2.2). Elsewhere: **X** (unused by UI). | `audit.read` (new) |

`audit.read` is the single new key introduced by v2. It replaces the misuse of `settings.export` flagged in N4.

#### Reports (12 → 10)
| Current | Action | Target |
|---|---|---|
| `reports.view` | **X** (umbrella; N4 §2.1) | consumers switch to `any(reports_*.view)` at code level |
| `reports.export` | **X** (umbrella) | consumers switch to `any(reports_*.export)` |
| `reports_finance.view/export` | K | unchanged |
| `reports_hr.view/export` | K | unchanged |
| `reports_inventory.view/export` | K | unchanged |
| `reports_medical.view/export` | K | unchanged |
| `reports_operational.view/export` | K | unchanged |

### 3.3 Export-verb narrowing (deferred)

Verified: every retained `*.export` above has a corresponding UI export CTA in `src/pages/**`. No further narrowing is safe in v2; further audit deferred to a later hygiene pass.

### 3.4 Count reconciliation

Groups with `create`+`edit` both present: 11 (appointments, patients, medical_records, treatment_plans, vitals, invoices, treasury, coupons, inventory, hr, settings). Each collapse removes 1 key.

- Start:   67 keys
- Collapse create+edit → write: −11 → 56
- Remove reports umbrellas: −2 → 54
- Remove settings.export: −1 → 53
- Add audit.read: +1 → **54 keys**

Target range: **50–55**. Landed count depends on whether any `*.export` keys are dropped once UI grep confirms zero consumers.

---

## 4. Bundle Migration (8 → 0)

The bundle layer is **removed entirely**. `role_permissions` becomes the single source of truth.

| Bundle | Bound role | Perms | Action | Justification |
|---|---|---|---|---|
| `bundle.role.admin` | admin | 67 | **REMOVE** | Admin already short-circuits via `isSuperAdmin()` in `AuthorizationService`. Contents recomputed into `role_permissions(admin, *)`. |
| `bundle.role.manager` | manager | 33 | **REMOVE** | Contents migrated into `role_permissions(manager, ...)`. N2 §3 intent-mismatch resolved by writing **intended** grants (per RBAC_MATRIX), not the current bundle grants. |
| `bundle.role.accountant` | accountant | 24 | **REMOVE** | Migrated to `role_permissions(accountant, ...)`. |
| `bundle.role.doctor` | doctor | 16 | **REMOVE** | Migrated to `role_permissions(doctor, ...)`. |
| `bundle.role.receptionist` | receptionist | 10 | **REMOVE** | Migrated to `role_permissions(receptionist, ...)`. |
| `bundle.role.hr` | hr | 7 | **REMOVE** | Migrated to `role_permissions(hr, ...)` (role kept by default per §2). |
| `bundle.role.nurse` | — (orphan) | 10 | **REMOVE + FIX** | Contents written into `role_permissions(nurse, ...)`. N2 §2.1 orphan disappears with the layer. |
| `bundle.role.staff` | staff | 1 | **REMOVE** | Single grant (`appointments.view`) reassigned to receptionist/nurse when principals are moved. |

**Composite bundles / `authz_bundle_implies`:** empty in production; not introduced in v2. Deferred until a hospital-network deployment requires composition.

**Backing tables (`authz_bundles`, `authz_bundle_permissions`, `authz_role_bundles`, `authz_bundle_implies`):** table objects **retained** for one release cycle (feature-flag-off), then dropped in a hygiene migration once no reader path references them.

---

## 5. Compatibility Matrix

| Surface | Before | After | Compatibility |
|---|---|---|---|
| `AuthorizationService.can("x.view")` | delegates to `usePermissions().can` | unchanged | 100% |
| `AuthorizationService.can("x.create"|"x.edit")` | legacy map | Shim resolves both to `x.write` for one release; then callers rewritten. | 100% during shim window |
| `has_permission(uid, 'x.create')` in RLS | reads `role_permissions` | Wave 1 inserts `x.write` grants alongside legacy; Wave 2 rewrites policy RHS to `x.write`; Wave 3 drops legacy keys. Zero-downtime three-phase. | 100% at every phase |
| Frontend `<Can perm="x.create">` | boolean | Codemod → `perm="x.write"` in Wave 2. | 100% post-codemod |
| `role_permissions` reader (`usePermissions`) | reads per-module actions | Shape unchanged; only action strings shift `create/edit` → `write`. Hook shim maps `create`/`edit` requests to `write` during shim window. | 100% |
| Edge functions (`admin-*`, `send-reminder`, `detect-queue-alerts`) | check specific keys | Audited in Wave 2; string literals rewritten. | 100% post-audit |
| Tests (`rbac.spec.ts`, `rbac.deep.spec.ts`, contract tests) | assert current keys | Updated with codemod. Golden baseline refreshed once per wave. | 100% |

---

## 6. Impact Estimates

| Dimension | Estimate | Notes |
|---|---|---|
| **Database impact** | Medium. ~15 policies rewritten (RHS string only); 168 bundle rows deleted; ~13 permission rows deleted; 1 new key inserted; `role_permissions` grows by ~40 rows before shrinking. | No table drops during v2. |
| **Frontend impact** | Low–Medium. ~60 `<Can>` / `useAuthorization().can(...)` call sites rewritten via codemod. Zero component logic changes. | Codemod: string-literal only. |
| **RLS impact** | Low. All policies keep `has_permission(auth.uid(), '...')` shape; only literal string changes. No new predicates, no scope changes. | Mechanical string replace. |
| **Testing impact** | Medium. Golden baseline recaptured 3× (once per wave). Contract tests gain shim-window assertions. Playwright RBAC untouched. | Vitest suite expected green throughout. |
| **Migration effort** | ~3 developer-days total across 3 waves. | Wave 1: 0.5d · Wave 2: 1.5d · Wave 3: 1d. |
| **Rollback effort** | Low per wave (rollback SQL captured per wave). Full rollback ≤ 30 min because every wave is additive-then-cutover. | See §9. |

---

## 7. Migration Roadmap

Three waves. Each is preceded by a fresh Golden Baseline capture and followed by harness run + baseline diff. No wave proceeds if the compliance checker regresses.

### Wave 1 — Additive
*Zero cutover risk. Adds; removes nothing.*
1. Insert `x.write` permission keys for every group that has `create`+`edit`.
2. Insert `audit.read` permission key.
3. Write `role_permissions(role, 'x.write')` for every role that currently holds `x.create` or `x.edit`.
4. Write `role_permissions(role, 'audit.read')` where role currently holds `settings.export` for audit tables.
5. Harness run. Golden baseline captured as **v2-wave1**.

### Wave 2 — Cutover
*Behavior-preserving rewrites. Checks succeed via both old and new keys.*
1. Rewrite RLS policy RHS from `x.create`/`x.edit` → `x.write` (mechanical).
2. Rewrite `audit_logs` / `user_activity_logs` policies from `settings.export` → `audit.read`.
3. Frontend codemod: `<Can perm="x.create|edit">` → `<Can perm="x.write">`.
4. Edge-function audit for permission string literals.
5. `AuthorizationService` shim: `x.create`/`x.edit` requests resolve as `x.write` OR legacy — dual-read.
6. Full test suite + Playwright RBAC + harness. Baseline **v2-wave2**.

### Wave 3 — Hygiene
*Removes deprecated surface. One-way.*
1. Delete legacy `x.create` / `x.edit` rows from `role_permissions`, then from `authz_permissions`.
2. Delete umbrella `reports.view` / `reports.export` (verified zero references in Wave 2).
3. Delete `settings.export` row.
4. Truncate `authz_bundle_permissions`, `authz_role_bundles`, `authz_bundles`, `authz_bundle_implies`.
5. Optional: `DROP TABLE` the four bundle tables (deferred one release).
6. `AuthorizationService` shim removed.
7. Deprecate `staff` role: reassign remaining principals, then queue enum-value drop.
8. Final harness + baseline **v2-final**. Compliance checker flipped to strict (`COMPLIANCE_STRICT=1`).

---

## 8. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Undeclared consumer of `settings.export` on non-audit tables | Medium | Low | Wave 2 grep across `src/**` and `pg_policies` before removal. |
| Edge function references legacy key string that codemod misses | Medium | Low | Wave 2 step 4 is a full grep of `supabase/functions/**`. |
| Nurse principals lose access if grants not written before bundle drop | High | Low | Wave 1 writes `role_permissions(nurse, ...)` **before** any bundle removal (Wave 3). |
| Manager's N2 intent mismatch silently persists | Medium | Medium | Wave 1 writes **intended** grants from RBAC_MATRIX, not current bundle. Diff explicitly reviewed. |
| `staff` reassignment collides with tenant-specific expectations | Low | Low | Per-tenant opt-in; default KEEP until principals=0. |
| Semantic change `create+edit → write` breaks a policy that intended only one verb | Low | Low | Audit: no such policy in current DB (verified via `pg_policies` grep). |
| Compliance checker (S2) regresses because `has_permission()` call count changes | Low | Low | Checker counts distinct gates, not literal strings; verified in dry-run. |
| Rollback needed mid-Wave-3 after bundle rows deleted | Medium | Low | Wave 3 rollback reseeds from `role_permissions` (bundle contents are supersets of role grants) plus pre-wave `pg_dump`. |

---

## 9. Rollback Strategy

Per-wave rollback SQL is authored **before** each wave runs (following the H3-1A / H3-2 hotfix precedent) and stored under `docs/wave-a1/`.

| Wave | Rollback shape | RTO |
|---|---|---|
| Wave 1 | `DELETE FROM role_permissions WHERE permission_key IN (…new write keys, 'audit.read')` + `DELETE FROM authz_permissions WHERE key IN (…same set)`. | < 5 min |
| Wave 2 | Revert policy DDL from a snapshot taken at start of wave. Frontend codemod reverted via git. Shim toggled off. | < 15 min |
| Wave 3 | Re-insert legacy rows from Wave 1 snapshot (kept as temp table `authz_permissions_pre_v2` for one release). Reseed `role_permissions` legacy rows. Bundle tables recreated from pre-Wave-3 `pg_dump`. | < 30 min |

**Snapshot policy:** before each wave, `pg_dump -t authz_* -t role_permissions -t user_roles` is stored as a wave-scoped artifact. Snapshots retained until the following wave has run in production for ≥ 14 days without incident.

---

## 10. Out of Scope (deferred, explicit)

- Introduction of `.approve` verb axis. Deferred until a workflow feature genuinely needs it (per A0).
- Composite bundles / `authz_bundle_implies` population.
- New permission groups (`prescriptions`, `physio`, `queue`, `communication`, etc.) proposed by N1. v2 does not add groups; it consolidates the existing 67 keys. Group expansion is a later design track and is not blocked by A1.
- Dropping `authz_*` tables (deferred one release after Wave 3).
- Dropping `staff` enum value (deferred until principals = 0).
- Flipping compliance checker to strict (end of Wave 3).

---

## 11. Approval Gate

Before Wave 1 begins, the following must be signed off:

1. Per-tenant decision on `hr` role (KEEP vs MERGE INTO `manager`).
2. Confirmation that no external integration reads `authz_bundles` directly.
3. Confirmation that `docs/RBAC_MATRIX.md` reflects the **intended** grants Wave 1 will write (not the N2-flagged current mismatches).
4. Wave 1 rollback SQL authored and reviewed.

Once approved, Wave 1 proceeds under the standard hotfix protocol (Standard v1 + Compliance Framework + Regression Harness + Golden Baseline diff).

---

**End of A1 specification. No implementation performed in this sprint.**
