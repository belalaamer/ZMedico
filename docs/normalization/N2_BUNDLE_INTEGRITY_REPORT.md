# N2 — Bundle Integrity Report

**Status:** Read-only validation. No `authz_bundles` / `authz_role_bundles` / `authz_bundle_permissions` writes.

## 1. Bundle Inventory

| Bundle | Perms | Bound roles | Health |
|---|---|---|---|
| `bundle.role.admin` | 65 | admin | OK |
| `bundle.role.manager` | 33 | manager | OK (finance intent mismatch — see §3) |
| `bundle.role.accountant` | 24 | accountant | OK |
| `bundle.role.doctor` | 16 | doctor | OK |
| `bundle.role.receptionist` | 10 | receptionist | OK |
| `bundle.role.hr` | 7 | hr | OK |
| `bundle.role.staff` | 1 | staff | OK (minimum-access) |
| `bundle.role.nurse` | 10 | **(none)** | **BROKEN** |

## 2. Detected Issues

### 2.1 Orphan bundles
- `bundle.role.nurse` — exists with 10 permission edges but no `authz_role_bundles` row. Any RLS policy that switches from `has_role('nurse')` to `has_permission(...)` will silently DENY every nurse principal.

### 2.2 Missing bindings
- Nurse role → `bundle.role.nurse` (obvious).
- No role is bound to the (to-be-created) `bundle.compliance` — needs a decision: either introduce a `compliance` app_role enum value OR grant `audit.read` inside the admin bundle only.

### 2.3 Duplicate bindings
- None detected. `authz_role_bundles(role, bundle_key)` unique index enforces this.
- Semantic duplication: multiple bundles grant the same permission (expected — e.g. `patients.view` appears in admin, manager, doctor, nurse, receptionist, accountant). This is not a defect; it is the intended fan-out.

### 2.4 Impossible bindings
- None. `authz_role_bundles.role` is constrained to the `app_role` enum; `bundle_key` FK to `authz_bundles`.

### 2.5 Dangling permission edges
- `authz_bundle_permissions` rows referencing a permission key deprecated later (`reports.view`, `reports.export`) — currently valid but must be re-evaluated in N4.

## 3. Semantic Intent vs Grants

Cross-check between what RLS *currently allows* and what the bundle *would allow* if RLS were migrated to `has_permission()`:

| Role | RLS currently allows (via has_role) | Bundle holds equivalent permission? | Discrepancy |
|---|---|---|---|
| manager | invoices INSERT/UPDATE within own branch | **NO** — bundle lacks `invoices.create`, `invoices.edit` | HIGH — Wave 3E blocked |
| manager | expenses INSERT/UPDATE within own branch | N/A — key does not exist yet | HIGH (N1 dependency) |
| manager | payments INSERT/UPDATE within own branch | N/A — key does not exist yet | HIGH (N1 dependency) |
| manager | treasury SELECT within own branch | YES (`treasury.view`) | OK |
| accountant | invoices/payments/expenses full CRUD | Partial — no `payments.*`, no `expenses.*` keys | HIGH (N1) |
| doctor | prescriptions/physio write | N/A — keys do not exist yet | HIGH (N1) |
| receptionist | queue manage | N/A — key does not exist | HIGH (N1) |
| hr | leave/payroll/performance | N/A — keys do not exist | HIGH (N1) |
| nurse | appointments/vitals/medical_records | Bundle correct — but not bound to role | HIGH (§2.1) |

## 4. `authz_bundle_implies` Graph
Empty. No composition currently in use. Consider populating after N1/N2:

```
bundle.role.admin ── implies ──▶ bundle.role.manager
bundle.role.manager ── implies ──▶ bundle.role.staff
bundle.role.doctor ── implies ──▶ bundle.role.nurse (clinical read subset)
```

This would collapse ~40 duplicate edges. Deferred.

## 5. Verdict

- 1 broken bundle (nurse).
- 0 duplicate/impossible bindings.
- 3 high-severity intent mismatches blocking Wave 3E Batch B/C and Wave 3F.
- 84 new permissions from N1 must be bound to their respective bundles before the corresponding RLS wave can proceed.

**Bundle Integrity Score: 6/10** (1 orphan + intent mismatches; structural constraints healthy).
