# Authorization Refactor Backlog

**Mode:** Planning only. This backlog is sequenced *after* Phase C
legacy retirement completes. Nothing here is scheduled for immediate
implementation. Every item is additive and parity-safe by construction;
any item that cannot preserve parity is marked and blocked until an
ADR authorises the behaviour change.

**Non-goals**

- No change to `AuthorizationService`, `PermissionRoute`, `Can`,
  `CanExport`, `usePermissions`, RLS, SECURITY DEFINER functions, or
  Edge Functions is scheduled by this backlog.
- No feature-flag change.
- No bundle resolution change.

---

## Wave 0 — Governance (pre-work, doc-only)

### B-00.1  Publish naming guidelines
- **Deliverable:** `AUTHORIZATION_NAMING_GUIDELINES.md` (this repo).
- **Severity:** Low. **Risk:** none. **Impact:** governance clarity.
- **Migration complexity:** none. **Backward compatibility:** preserved.
- **Runtime impact:** none.
- **Status:** Done in this pass.

### B-00.2  Publish debt register
- **Deliverable:** `AUTHORIZATION_TECHNICAL_DEBT.md`.
- **Severity:** Low. **Runtime impact:** none.
- **Status:** Done in this pass.

### B-00.3  Publish scope enforcement map
- **Deliverable:** `docs/auth/SCOPE_ENFORCEMENT_MAP.md` cross-linking
  each permission to the RLS policy(-ies) that enforce its scope.
- **Severity:** Medium. **Runtime impact:** none (doc only).
- **Migration complexity:** Medium (requires reading every RLS policy).
- **Backward compatibility:** preserved.

---

## Wave 1 — Catalog completion (additive, parity-safe)

Prerequisite: Phase C complete (legacy `MODULES` array removed).

### B-01  Add `purchase_orders` CRUD + approval
- **Debt:** D-04.
- **Action:** Insert
  `purchase_orders.view/create/edit/delete/approve`. Grant to `admin`
  (all) and `manager` (view/create/edit/approve). Leave
  `purchase_orders.receive` in place.
- **Severity:** High. **Risk:** low if no UI wires the new keys yet.
- **Impact:** unlocks procurement rollout.
- **Migration complexity:** Low (data-only).
- **Backward compatibility:** preserved.
- **Runtime impact:** additive.
- **Verification:** shadow-probe slice for procurement.

### B-02  Split `inventory.alerts.manage`
- **Debt:** D-02.
- **Action:** Add
  `inventory.alerts.view/create/edit/delete`. Grant identically to
  whichever bundles currently hold `inventory.alerts.manage`. Deprecate
  the umbrella per §8 protocol.
- **Severity:** Medium. **Migration complexity:** Low.
- **Runtime impact:** additive during window; parity-neutral.

### B-03  Split `settings.integrations.manage`
- **Debt:** D-02. Same shape as B-02.

### B-04  Deprecate `reports.view` / `reports.export`
- **Debt:** D-03.
- **Action:** Mark `deprecated=true`, `replaced_by='reports_operational.view'`
  (and `.export`). Keep in bundles for one deprecation window. Remove
  from bundles after 30 clean days.
- **Severity:** Low. **Runtime impact:** none.

---

## Wave 2 — HR granularity

### B-05  Split `hr.*` into sub-resources
- **Debt:** D-05.
- **Action:** Introduce
  `hr.staff.*`, `hr.attendance.*`, `hr.leave.*`, `hr.payroll.*`,
  `hr.performance.*` (each with CRUD 5-tuple).
- **Shim:** During the deprecation window, `hr.*` grants imply the
  matching new sub-resource grants via `authz_bundle_implies` — no
  runtime change required, reducer already flattens.
- **Severity:** High. **Migration complexity:** High.
- **Backward compatibility:** requires shim (documented).
- **Runtime impact:** additive during window.
- **Verification:** slice per sub-resource, shadow-probe on HR routes.

---

## Wave 3 — Compositional bundles

### B-06  Introduce domain-capability bundles
- **Debt:** D-06, D-10.
- **Action:** Add
  `bundle.finance.viewer`, `bundle.finance.writer`,
  `bundle.finance.approver`, `bundle.clinical.viewer`,
  `bundle.clinical.writer`, `bundle.reports.viewer`,
  `bundle.reports.exporter`, `bundle.hr.viewer`, `bundle.hr.writer`.
- Wire existing `bundle.role.<role>` to imply the appropriate mix via
  `authz_bundle_implies` **without** changing their expanded grant set
  (parity check).
- **Severity:** Medium. **Migration complexity:** Medium.
- **Backward compatibility:** preserved (role bundles keep their names
  and expanded grants).
- **Runtime impact:** none (reducer already flattens implies-graph).
- **Verification:** parity harness over every existing role.

### B-07  Add `insurance_officer` role (example new role)
- **Prerequisite:** B-06.
- **Action:** Compose from `bundle.finance.viewer +
  bundle.patients.viewer + bundle.reports.exporter`.
- **Severity:** Low. **Impact:** proves compositional model.
- **Runtime impact:** additive (new role, no touch to existing).

---

## Wave 4 — Specialty neutrality

### B-08  Introduce `clinical_case` resource (generic clinical vertical)
- **Debt:** future-compat item.
- **Action:** Add `clinical_case.view/create/edit/delete/close/reassess/export`
  as the generic replacement for `physio.*` / `dental.*` / etc.
- Do **not** persist any specialty-specific top-level group. Specialty
  is resolved from a `specialty` column on the underlying case row.
- **Severity:** Medium. **Migration complexity:** Medium.
- **Backward compatibility:** preserved (no `physio.*` keys exist in
  DB today; only in aspirational specs).
- **Runtime impact:** additive.

### B-09  Introduce `chart` resource (generic chart / imaging)
- Same rationale as B-08 for `dental.*`, `derma.*`, `radiology.*`.

### B-10  Introduce `prescriptions` catalog
- **Action:** `prescriptions.view/create/edit/delete/print/dispense`,
  plus `prescriptions.controlled.*` for regulated substances.
- **Severity:** Medium. **Migration complexity:** Low.

### B-11  Introduce `queue` catalog
- **Action:** `queue.view/call/force_call/reset/configure`.
- **Severity:** Low.

### B-12  Introduce `communication` and `notifications` catalogs
- **Action:** `communication.view/compose/send/configure`,
  `notifications.view/configure`.

---

## Wave 5 — Scope enforcement

### B-13  Encode scope on high-risk keys
- **Debt:** D-09, D-12.
- **Prerequisite:** scope-aware decision function ADR
  (**blocked — not covered by this backlog until ADR exists**).
- **Action:** Introduce `.own` / `.branch` variants for keys where
  `default_scope` is insufficient (e.g. `medical_records.view.own`,
  `invoices.refund.branch`).
- **Severity:** High when unlocked. **Migration complexity:** High.
- **Backward compatibility:** requires shim.
- **Runtime impact:** **behavioural** — blocked until ADR.

---

## Wave 6 — Multi-tenant per-tenant overrides

### B-14  Add `tenant_id` to `authz_role_bundles`
- **Debt:** future-compat.
- **Action:** Schema addition + composite PK; `NULL tenant_id` means
  "default for all tenants". Per-tenant rows override.
- **Severity:** High when unlocked. **Migration complexity:** Medium.
- **Backward compatibility:** preserved (nullable column, default NULL).
- **Runtime impact:** **behavioural** — blocked until multi-tenant
  activation ADR.

---

## Sequencing summary

```
Phase C (legacy retirement) — prerequisite for all waves
  │
  ├── Wave 1 (catalog completion, additive)
  │     B-01  Purchase orders CRUD
  │     B-02  inventory.alerts split
  │     B-03  settings.integrations split
  │     B-04  reports.* umbrella deprecation
  │
  ├── Wave 2 (HR granularity)
  │     B-05  hr.* → hr.<sub>.*
  │
  ├── Wave 3 (compositional bundles)
  │     B-06  Domain-capability bundles
  │     B-07  Example composed role
  │
  ├── Wave 4 (specialty neutrality)
  │     B-08..B-12  clinical_case, chart, prescriptions, queue, comms
  │
  ├── Wave 5 (scope encoding) — BLOCKED on ADR
  │     B-13  .own/.branch/.org variants
  │
  └── Wave 6 (multi-tenant overrides) — BLOCKED on ADR
        B-14  tenant_id on authz_role_bundles
```

---

## Global constraints (apply to every item)

1. No item ships without a passing parity shadow-probe over every
   existing bundle.
2. No item removes a permission from a bundle in the same migration
   that adds its replacement — deprecation window is mandatory.
3. No item touches `AuthorizationService`, `PermissionRoute`, `Can`,
   `CanExport`, `usePermissions`, RLS, SECURITY DEFINER functions, or
   Edge Functions unless it is explicitly gated on an ADR and the
   current Phase O runtime-freeze is lifted.
4. Every item includes rollback SQL matching the pattern already used
   under `docs/wave3*/`.
5. Every item updates `docs/auth/AUTHORIZATION_TECHNICAL_DEBT.md` to
   mark the corresponding D-nn item as closed on completion.

**No backlog item is authorised for immediate implementation by this
document.** The backlog is the plan; scheduling is a separate decision.
