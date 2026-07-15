# Authorization Catalog Review

**Mode:** Design review only — no runtime, schema, RLS, SECURITY DEFINER,
Edge Function, or business-logic changes. Legacy fallback preserved.
Canonical runtime and feature flags unchanged.

**Evidence sources**

- `authz_permissions` (79 keys), `authz_bundles` (8), `authz_bundle_permissions` (DB snapshot 2026-07-15).
- `src/lib/authz/canonicalPermissions.ts` (reducer grammar).
- `src/lib/rolePermissions.ts` (legacy `MODULES` / `ACTIONS`).
- `docs/PERMISSION_CATALOG.md` v1.0-draft (aspirational spec).
- `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md` (formal grammar).

---

## 1. Snapshot

| Metric | Value |
|---|---|
| Catalog permissions (DB) | 79 |
| Bundles (role bundles) | 8 (`bundle.role.<role>`) |
| `group_key` values | `appointments`, `clinical`, `finance`, `hr`, `inventory`, `patients`, `reports`, `settings` |
| Deprecated permissions | 0 |
| Umbrella `.manage` verbs | 2 (`inventory.alerts.manage`, `settings.integrations.manage`) |
| Wildcard / `all` permissions | 0 |
| Specialty-specific permissions in DB | 0 |

Runtime parity: 100% (per `PHASE_B1_PARITY_REPORT.md`, `PHASE_B_FINAL_VALIDATION.md`).

---

## 2. Naming Consistency

Grammar in production: `<resource>.<action>` (2 segments) with a small
set of 3-segment exceptions:

```
inventory.alerts.manage
inventory.tx.write
invoices.coupon.apply
purchase_orders.receive
settings.branch.update
settings.catalog.update
settings.integrations.manage
settings.org.update
settings.pricing.update
treasury.daily_close.view
treasury.tx.write
```

Verbs actually in use: `view, create, edit, delete, export, receive,
apply, write, manage, update`.

**Inconsistencies (Severity: Medium)**

| Issue | Examples | Notes |
|---|---|---|
| Two synonyms for "mutate" | `edit` vs `update` | `edit` = row-level (legacy `ACTIONS`); `update` = configure leaves in `settings.*`. |
| Two synonyms for "write" | `edit` vs `tx.write` | `inventory.tx.write`, `treasury.tx.write` are custom ledger inserts. |
| Non-canonical umbrella verb | `.manage` | Hides create/edit/delete under one grant. Violates N1. |
| Verb-in-middle segment | `treasury.daily_close.view`, `invoices.coupon.apply` | Mixes qualifier with verb. Sortable but off-grammar. |
| Legacy vocab lock | `ACTIONS = [view,create,edit,delete,export]` in `src/lib/rolePermissions.ts` | Any move `edit → update` breaks legacy parity. |

68 / 79 keys (86%) match the strict `<resource>.<verb>` shape.

---

## 3. Resource Consistency

Every permission maps to exactly one `group_key`. No permission mixes
unrelated resources.

- `coupons.*` and `treasury.*` sit under `group_key='finance'` — sensible
  business partition, but no wildcard sugar means roles must enumerate
  each resource.
- `reports.*` co-exists with `reports_finance.*`, `reports_hr.*`,
  `reports_medical.*`, `reports_operational.*`, `reports_inventory.*`.
  The umbrella is flagged **[D]** in N1 and is redundant in every bundle
  that carries it (see §5).
- `purchase_orders` has exactly one key (`receive`). No view/create/edit/
  delete/approve — a catalog skeleton, not a coverage.
- `hr` is flat (5 CRUD verbs). Real HR has staff / attendance / leave /
  payroll / performance (see `PERMISSION_CATALOG.md` §15-19) which the
  DB catalog does not encode. High future-friction cost for SoD.

---

## 4. Generic Healthcare Design

**DB catalog is already specialty-neutral.** No key mentions
`physio.*`, `dental.*`, `dermatology.*`, `radiology.*`, `lab.*`.

Risk resides in aspirational specs and route mappings only:

| Source | Specialty term | Generic replacement |
|---|---|---|
| `PERMISSION_CATALOG.md`, `N1_...` | `physio.view/create/edit/close/reassess` | `clinical_case.view/create/edit/close/reassess` |
| Same specs | `dental.view/edit` | `chart.view/edit` (chart type resolved by specialty plugin data) |
| Same specs | `prescriptions.dispense` | Keep (universal to any Rx-issuing specialty) |
| `moduleForPath("/physio")` | Routes → `medical_records` module | Already generic — keep. |

Since none of these have been persisted to `authz_permissions`, the
platform can adopt a generic vocabulary at zero migration cost.

---

## 5. Bundle Quality

8 bundles, one per role. No compositional bundles.

| Bundle | Duplicate grants | Orphan / redundant | Cross-group coupling |
|---|---|---|---|
| `admin` | none | `reports.view` + all `reports_*.view` (umbrella + sub) | full catalog by definition |
| `manager` | none | `reports.export` + 5 `reports_*.export` | reads across every domain — coarse |
| `accountant` | none | `reports.view/export` umbrella + sub; grants `settings.view` purely to pass `PermissionRoute` gate (documented in `rolePermissions.ts`) | smell |
| `doctor` | none | `reports.view` umbrella + sub | none |
| `nurse` | none | none | `inventory.view` — arguable |
| `receptionist` | none | none | none |
| `hr` | none | `reports.view` umbrella + `reports_hr.*` | none |
| `staff` | none | none | none |

**No orphans, no invalid FK refs, no impossible combinations.**

**Composition gap:** 1:1 role↔bundle mapping. Adding a 9th role (e.g.
`insurance_officer`) requires a bespoke bundle instead of composing
`bundle.finance.viewer + bundle.patients.viewer`. Biggest scalability
tax for multi-clinic SaaS.

---

## 6. Role Independence

`authz_permissions` and `authz_bundle_permissions` carry no role
identity. `authz_role_bundles` is the sole role-aware table and only
maps role→bundle. **Compliant.**

**Cosmetic deviation:** every bundle is named `bundle.role.<role>`,
embedding role identity in the bundle namespace. This discourages the
"compose per-domain bundles into a role" pattern. Non-blocking.

---

## 7. Scope Readiness

`authz_permissions.default_scope` already exists and is `branch` for
every row sampled. N1's qualifier vocabulary (`.own`, `.branch`,
`.org`, `.global`) is documented but not encoded as key suffixes.

- ✅ `default_scope` column is present — no schema change to attach
  scope metadata per permission.
- ✅ Grammar admits `.own` / `.branch` / `.org` suffixes without breaking
  the reducer in `canonicalPermissions.ts` (splits on first `.` for
  module; the remainder becomes the action name, same as
  `settings.pricing.update` today).
- ⚠️ Adding suffixes as *new keys* would double the catalog and force
  a scope-aware decision function.
- ⚠️ RLS enforces branch/own scope by policy today. Two enforcement
  planes exist; catalog does not yet reflect that.

**Verdict:** shape scope-ready; contents not yet scoped. Additive after
Phase C.

---

## 8. Module Independence

To add a new module today:

1. Insert rows into `authz_permissions`.
2. Insert bundle mappings.
3. Add module string to `MODULES` in `src/lib/rolePermissions.ts` (**legacy tax**).
4. Optional: add `moduleForPath` mapping and a canonical slice under `src/lib/authz/slices/`.

`AuthorizationService.ts` requires **no** change. Step 3 disappears
after Phase C. Fully declarative post-legacy.

---

## 9. Catalog Maintainability

### 9.1 Permissions grouped by resource (79 keys)

| Resource | Keys | CRUD | Export | Notes |
|---|---|---|---|---|
| `appointments` | 5 | ✓ | ✓ | Complete |
| `patients` | 5 | ✓ | ✓ | Complete |
| `medical_records` | 5 | ✓ | ✓ | Complete |
| `vitals` | 5 | ✓ | ✓ | Complete |
| `treatment_plans` | 5 | ✓ | ✓ | Complete |
| `invoices` | 5 + `coupon.apply` | ✓ | ✓ | 3-seg exception justified |
| `treasury` | 5 + `tx.write` + `daily_close.view` | ✓ | ✓ | 3-seg exceptions justified |
| `coupons` | 5 | ✓ | ✓ | Complete |
| `inventory` | 5 + `tx.write` + `alerts.manage` | ✓ | ✓ | `.manage` violates verb vocab |
| `purchase_orders` | 1 (`receive`) | ✗ | ✗ | Missing view/create/edit/delete/approve |
| `hr` | 5 | ✓ | ✓ | Should be split into `hr.staff / .attendance / .leave / .payroll / .performance` |
| `reports` | 2 | n/a | ✓ | Umbrella slated for retirement |
| `reports_finance/_hr/_medical/_operational/_inventory` | 2 each | n/a | ✓ | Complete |
| `settings` | 5 + 5 (`branch/catalog/integrations/org/pricing.update`) | ✓ | ✓ | Uses `update` verb — inconsistent with `edit` |

### 9.2 Missing CRUD symmetry

- `purchase_orders`: only `receive`.
- `inventory.alerts` / `settings.integrations`: `manage` only.

### 9.3 Missing export permissions

None on primary resources. Configure-style leaves intentionally omit.

### 9.4 Redundant / suspicious permissions

| Key | Reason | Recommended action |
|---|---|---|
| `reports.view`, `reports.export` | Every bundle carries both umbrella + sub | Deprecate after Phase C (`deprecated=true`, `replaced_by=reports_*.view/export`) |
| `inventory.alerts.manage` | `.manage` hides CRUD | Split into `inventory.alerts.view/create/edit/delete` |
| `settings.integrations.manage` | Same | Same |
| `inventory.tx.write` / `treasury.tx.write` | Custom `.write` verb | Rename to `.create` (ledger inserts are creates) post-parity re-baseline |
| `settings.*.update` | Second mutation verb | Standardise on `edit` |

### 9.5 Ambiguous meaning

- `settings.edit` vs `settings.pricing.update` — coarse does **not**
  imply sub. Must be documented in the naming guidelines.
- `hr.edit` includes payroll today (no split) — dangerous for SoD;
  split by sub-resource pre-multi-tenant.

---

## 10. Future Compatibility

| Capability | Supported? | Blocker | Effort |
|---|---|---|---|
| Multi-tenant SaaS | Partial | `authz_permissions` is global; per-tenant bundle overrides need `tenant_id` on `authz_role_bundles` | Medium |
| Multiple clinics per tenant | Yes | Branch scoping enforced by RLS | None |
| Multiple specialties | Yes | Do not persist `physio.*` / `dental.*`; model as `clinical_case.*` + specialty metadata | Low (governance) |
| Plugin / add-on modules | Yes | Additive inserts; `AuthorizationService` untouched | Low |
| White-label deployments | Yes | Catalog carries no branding | None |

---

## Summary

| Dimension | Grade | Justification |
|---|---|---|
| Naming consistency | B | 86% match strict grammar; two synonym pairs + two `.manage` umbrellas |
| Resource consistency | A- | Every key in one group; only `reports` umbrella overlaps |
| Specialty neutrality | A | DB catalog fully generic |
| Duplicate detection | B | 6 redundant `reports.*` umbrella grants; no true duplicates |
| Bundle quality | B | No orphans; 1:1 role↔bundle limits composition |
| Role independence | A | Permissions/bundles carry no role identity |
| Scope readiness | B+ | `default_scope` present; suffixes not encoded |
| Module independence | A- | One legacy touchpoint until Phase C |
| Maintainability | B | Missing PO CRUD; HR flatness; two mutation verbs |
| Future compatibility | A- | Multi-tenant + plugin ready; per-tenant overrides need schema tweak |

**Overall Catalog Grade: B+** — production-safe, commercially credible,
with a defined path to A once the debt items are cleared.

No behavior-changing recommendations. All corrective actions live in the
refactor backlog behind an additive-only, parity-safe protocol.
