# Universal Authorization Taxonomy — Vendor-Neutral Clinic Permission Model

**Mode:** Documentation only. No runtime, RLS, SECURITY DEFINER, Edge
Function, feature-flag, `AuthorizationService`, bundle-resolution, or
permission-decision change. All current production decisions remain
byte-identical. Legacy fallback preserved. Canonical runtime unchanged.

**Purpose:** Refactor the *taxonomy* (naming, grouping, extensibility)
so the platform can serve any clinic type — physiotherapy, dental,
dermatology, pediatrics, radiology, general outpatient, laboratory,
hospital outpatient wing — through configuration, not through
authorization keys.

**Scope of the current catalog (evidence):** 79 keys in
`authz_permissions`, 8 role bundles in `authz_bundles`, zero
specialty-coupled keys already in the DB. Every recommendation below
is additive and parity-safe; nothing forces a rename of a live key.

---

## 1. Design Principles (binding for future keys)

1. **Business capability, never medical specialty.** No key may
   contain `physio`, `dental`, `ortho`, `derma`, `cardio`, `rehab`,
   `radiology`, `ophthalmology`, `pediatrics`, `psych`, `lab`,
   `imaging` or any other specialty noun.
2. **Configuration selects specialty; authorization stays constant.**
   Clinic type is a tenant/setting attribute that toggles UI, workflow,
   and templates. It never gates keys.
3. **Additive-only migrations.** A rename is a new key + deprecation of
   the old key + shim, never an in-place edit.
4. **Parity is inviolable.** Every proposed change ships with a
   shadow-probe assertion that decisions are unchanged.
5. **Role independence.** Permissions and bundles carry no role
   identity. Role coupling lives in `authz_role_bundles`.

---

## 2. Universal Naming Standard

```
<domain>.<resource>.<action>[.<scope>]
```

Two-segment shorthand `<domain>.<action>` remains valid when the domain
is itself the resource (matches how `patients.view`, `appointments.view`
are stored today).

- Lowercase. `snake_case` inside a segment. Dots between segments.
- Approved abbreviations: `po`, `rx`, `hr`, `sms`, `wa`, `pdf`, `tx`.
- `<scope>` reserved for future scope encoding (`.own`, `.branch`,
  `.org`, `.global`, state qualifiers). **Do not add scope suffixes to
  keys today** — the runtime cannot yet enforce them and doing so would
  break parity.

Examples (universal, specialty-free):

```
patients.view                     appointments.view
patients.create                   appointments.create
patients.update                   appointments.update
patients.delete                   appointments.cancel
patients.export                   appointments.complete

clinical_notes.view               documents.upload
clinical_notes.create             documents.download
clinical_notes.update             documents.delete
clinical_notes.sign

invoices.create                   inventory.adjust
invoices.post                     inventory.transfer
invoices.refund                   inventory.audit
invoices.waive                    stock.receive

reports.view                      settings.branch.update
reports.export                    users.manage
```

---

## 3. Closed Action Vocabulary

Only these verbs are authorised for new keys. Legacy verbs remain in
place unchanged (see §9).

| Category | Verbs |
|---|---|
| CRUD | `view`, `create`, `update`, `delete` |
| Workflow | `approve`, `reject`, `assign`, `sign`, `verify`, `cancel`, `complete`, `reopen` |
| Operations | `export`, `import`, `upload`, `download`, `print`, `archive`, `restore` |
| Inventory | `adjust`, `transfer`, `receive`, `issue`, `audit` |
| Financial | `refund`, `waive`, `post`, `reconcile` |
| Administration | `manage` (only for `users.manage`, `roles.manage`, `permissions.manage`, `audit.manage`) |

**Forbidden verbs:** `read` (use `view`), `write` (use `create` /
`update`), `remove` (use `delete`), `all`, `misc`, `other`, `handle`,
`do`, `perform`, `access`, `control`, `manage` outside the four
administration keys above.

Any verb outside this list requires a governance ADR before catalog
insertion.

---

## 4. Domain Registry (target model)

| # | Domain | Purpose | Example resources |
|---|---|---|---|
| 1 | `patients` | Patient master + demographics + wallet + documents surface | `patients` |
| 2 | `appointments` | Booking, cancellation, completion | `appointments` |
| 3 | `encounters` | Visit-level container linking appointment → notes → billing | `encounters` |
| 4 | `clinical_notes` | Generic clinical documentation (replaces `medical_records` conceptually) | `clinical_notes`, `vitals`, `treatment_plans` |
| 5 | `documents` | Patient/clinical attachments | `documents`, `attachments` |
| 6 | `prescriptions` | Rx issuance, print, dispense | `prescriptions` |
| 7 | `invoices` | AR invoicing | `invoices` |
| 8 | `payments` | Cash in / refund | `payments` |
| 9 | `insurance` | Insurers, contracts, claims | `insurance` |
| 10 | `treasury` | Cash accounts, day close | `treasury` |
| 11 | `coupons` | Promotions | `coupons` |
| 12 | `inventory` | Stock on hand + adjustments | `inventory`, `stock` |
| 13 | `suppliers` | Vendor master | `suppliers` |
| 14 | `purchase_orders` | Procurement workflow | `purchase_orders` |
| 15 | `employees` | Staff directory + identity/employment (replaces `hr`) | `employees` |
| 16 | `attendance` | Clock-in, overrides | `attendance` |
| 17 | `leave` | Leave workflow | `leave` |
| 18 | `payroll` | Payroll two-step | `payroll` |
| 19 | `calendar` | Calendar visibility | `calendar` |
| 20 | `rooms` | Physical room booking | `rooms` |
| 21 | `resources` | Bookable equipment / assets | `resources` |
| 22 | `queue` | Waiting-room state machine | `queue` |
| 23 | `communication` | Outbound messaging | `communication`, `templates` |
| 24 | `notifications` | User notifications | `notifications` |
| 25 | `reports` | Cross-domain read/export | `reports_finance`, `reports_medical`, `reports_operational`, `reports_hr`, `reports_inventory` |
| 26 | `dashboards` | Widget-family visibility | `dashboards` |
| 27 | `analytics` | Analytical queries | `analytics` |
| 28 | `users` | Identity | `users` |
| 29 | `roles` | Role assignment | `roles` |
| 30 | `permissions` | Catalog & bundle editing | `permissions` |
| 31 | `audit` | Audit log access | `audit` |
| 32 | `settings` | Configuration surfaces (branch, catalog, pricing, org, integrations) | `settings` |

Every domain is specialty-free by construction. A dental clinic, a
physio clinic, and a dermatology clinic all use the same 32 domains.

---

## 5. Resource Grouping (mapping today → target)

Additive re-grouping only. Existing keys keep their `group_key`. New
keys use the target grouping below.

| Current key | Current `group_key` | Target domain | Rename? |
|---|---|---|---|
| `patients.*` | `patients` | `patients` | No |
| `appointments.*` | `appointments` | `appointments` | No |
| `medical_records.*` | `clinical` | `clinical_notes` | Deferred alias only (see §9) |
| `vitals.*` | `clinical` | `clinical_notes` (resource `vitals`) | No |
| `treatment_plans.*` | `clinical` | `clinical_notes` (resource `treatment_plans`) | No |
| `invoices.*` | `finance` | `invoices` | No |
| `treasury.*` | `finance` | `treasury` | No |
| `coupons.*` | `finance` | `coupons` | No |
| `inventory.*` | `inventory` | `inventory` | No |
| `purchase_orders.*` | `inventory` | `purchase_orders` | No |
| `hr.*` | `hr` | `employees` | Deferred alias only |
| `reports_*.*` | `reports` | `reports` | No |
| `reports.view` / `.export` | `reports` | `reports` (umbrella, deferred deprecation) | No |
| `settings.*` | `settings` | `settings` | No |

**No rename is scheduled by this document.** All target renames follow
the deprecation protocol in §9 and remain optional until governance
schedules them.

---

## 6. Bundle Consistency

Current bundles (8): `bundle.role.admin`, `bundle.role.manager`,
`bundle.role.doctor`, `bundle.role.nurse`, `bundle.role.receptionist`,
`bundle.role.accountant`, `bundle.role.hr`, `bundle.role.staff`.

**Rules going forward:**

1. Bundle names may reference roles or capabilities, never specialties.
   Forbidden: `bundle.role.dentist`, `bundle.role.physiotherapist`,
   `bundle.dermatology.*`.
2. Business-role bundles keep the `bundle.role.<role>` pattern.
3. Reusable capability bundles use `bundle.<domain>.<capability>`, e.g.
   `bundle.finance.viewer`, `bundle.clinical.writer`,
   `bundle.reports.exporter`. Introduced additively; composition via
   `authz_bundle_implies` — no runtime change (reducer already
   flattens).
4. Adding a new business role never requires editing an existing
   bundle; compose from capability bundles.

**Consistency audit of today's bundles:**

- No bundle contains a specialty name. ✅
- No bundle contains an invalid FK. ✅
- Every bundle carries the redundant `reports.view` / `reports.export`
  umbrella alongside `reports_*` sub-grants. Cosmetic; deprecation
  deferred.
- `bundle.role.accountant` grants `settings.view` purely to pass a
  route gate — documented workaround, no over-privilege at data layer.

---

## 7. Future Specialty Extension Strategy

Specialty support is a **configuration axis**, orthogonal to
authorization.

```
tenant.clinic_type ∈ { general, physiotherapy, dental, dermatology,
                       pediatrics, radiology, laboratory, ... }
```

The clinic type controls:

- UI navigation and forms (e.g. odontogram vs SOAP vs skin-map).
- Workflow steps (e.g. physio reassessment cadence, radiology report
  turnaround).
- Report templates and dashboard widgets.
- Reference data (services catalog, procedure codes, diagnosis
  presets).

The clinic type does **not** control:

- Permission keys.
- Bundle composition.
- RLS.
- Any authorization decision.

**Consequence:** a single tenant that runs both a physio branch and a
dental branch uses one catalog, one bundle set, and one authorization
runtime. Branches differentiate through the clinic-type setting on the
branch row.

**Plugin model (future, additive):** a specialty add-on ships:

- UI components under a specialty-scoped route (`/specialty/<name>/*`).
- Optional new domain keys (e.g. `imaging.view` for radiology) using
  the universal grammar — never `radiology.imaging.view`.
- Bundle updates via `authz_bundle_implies`.

No `AuthorizationService` change is ever required to onboard a
specialty.

---

## 8. Migration Notes (documentation only)

This section describes the *shape* of future migrations. **Nothing is
scheduled** by this document.

**Global constraints on every future migration:**

1. Additive-only DDL: `INSERT` new keys, `INSERT` new bundle mappings,
   `UPDATE` `deprecated=true` / `replaced_by=<key>` on retired keys.
   No `DELETE` until the deprecation window closes.
2. Bundle updates land in the **same migration** as the new keys so
   expanded grant sets remain parity-equivalent.
3. Every migration ships with a shadow-probe expected-expansion row
   asserting decisions are unchanged for every role.
4. Rollback SQL matches the pattern already used under `docs/wave3*/`.

**Standard deprecation protocol (from `AUTHORIZATION_NAMING_GUIDELINES.md` §8):**

1. Insert new key(s).
2. Add new key(s) to every bundle that grants the old key.
3. Mark old key `deprecated=true`, set `replaced_by=<new>`.
4. Shadow-probe assertion: old-key decision == new-key decision.
5. 30 clean production days → remove old key from bundles.
6. 30 further clean days → delete deprecated row.

**Migration shape by wave (see `AUTHORIZATION_REFACTOR_BACKLOG.md` for
sequencing):**

| Wave | Change type | Runtime impact | Parity guarantee |
|---|---|---|---|
| Catalog completion (PO CRUD, alerts/integrations split, reports umbrella deprecation) | Additive INSERT + deprecation shim | Additive only | Shadow-probe per bundle |
| HR granularity (`hr.*` → `employees.*` + sub-domains) | Additive INSERT + `authz_bundle_implies` shim | Additive during window | Shadow-probe per role |
| Compositional bundles | Additive INSERT into `authz_bundles` + `authz_bundle_implies` | None (reducer flattens) | Expanded grant set unchanged |
| Specialty neutrality (`clinical_notes`, `encounters`, `documents`, `prescriptions`, `queue`, `communication`) | Additive INSERT | Additive | New keys start ungranted; explicit bundle updates |
| Scope encoding | **Behavioural — blocked on ADR** | Behavioural | Not additive |
| Multi-tenant overrides | **Behavioural — blocked on ADR** | Behavioural | Not additive |

---

## 9. Backward Compatibility Assessment

**Baseline:** every permission decision, every bundle expansion, every
`Can` / `CanExport` / `PermissionRoute` gate, every RLS policy, every
SECURITY DEFINER function, and every Edge Function continues to behave
exactly as it does in production today.

**Compatibility properties preserved:**

- The reducer in `src/lib/authz/canonicalPermissions.ts` splits keys on
  the first `.` — every key in this document (2, 3, or 4 segments)
  round-trips through it identically.
- Legacy `MODULES` / `ACTIONS` in `src/lib/rolePermissions.ts` continue
  to gate the fallback path. No entry is removed by this document.
- Existing bundle rows are untouched. Any new capability bundles are
  additive.
- `authz_role_bundles` mapping is untouched.
- `default_scope` semantics unchanged.

**Compatibility risks and their mitigations:**

| Risk | Mitigation |
|---|---|
| Introducing `clinical_notes.*` alongside `medical_records.*` doubles the surface for reviewers | Both keys coexist for one deprecation window with an `implies` link; parity harness asserts equivalence |
| Renaming `hr.*` to `employees.*` breaks external audit reports | Deferred; retention of `hr.*` for at least two windows; export mapping table maintained |
| Adding compositional bundles changes bundle count in dashboards | Cosmetic; documented in `AUTHORIZATION_MONITORING_PLAN.md` update |
| Contributors add scope suffixes prematurely | Naming guidelines §5 forbid; CI guard in `scripts/authz/guardrails_backend.py` (future addition, doc-only for now) |

**Contract-level guarantee:** no key in the current
`authz_permissions` table is renamed, deleted, or repurposed by this
document. Every proposed rename is optional, deferred, and gated on a
shadow-probe parity pass.

---

## 10. List of Deprecated Names (proposed, not scheduled)

None of the entries below are executed by this document. They are the
*candidate* deprecation list for future waves. Each requires its own
migration, shim, deprecation window, and parity harness pass.

| Old key / pattern | Reason | Proposed replacement | Status |
|---|---|---|---|
| `medical_records.view` / `.create` / `.update` / `.delete` / `.export` | Domain rename to universal `clinical_notes.*` | `clinical_notes.view` / `.create` / `.update` / `.delete` / `.export` | Candidate — deferred |
| `hr.view` / `.create` / `.edit` / `.delete` / `.export` | Domain rename to universal `employees.*` and verb harmonisation (`edit` → `update`) | `employees.view` / `.create` / `.update` / `.delete` / `.export` | Candidate — deferred |
| `inventory.alerts.manage` | Umbrella `.manage` violates verb vocabulary | `inventory.alerts.view` / `.create` / `.update` / `.delete` | Candidate — deferred |
| `settings.integrations.manage` | Same | `settings.integrations.view` / `.create` / `.update` / `.delete` | Candidate — deferred |
| `inventory.tx.write` | Non-vocabulary verb `.write` | `inventory.tx.create` | Candidate — deferred |
| `treasury.tx.write` | Non-vocabulary verb `.write` | `treasury.tx.create` | Candidate — deferred |
| `settings.branch.update` / `.catalog.update` / `.org.update` / `.pricing.update` / `.integrations.update` | Second mutation verb (`update`) coexists with `edit` on flat settings; harmonise on `update` | Keep as-is; harmonise `settings.edit` → `settings.update` in a future wave | Candidate — deferred |
| `reports.view` / `reports.export` | Umbrella redundant with `reports_*.view/export` | `reports_operational.view` / `.export` (and other sub-domains) | Candidate — deferred |
| Any specialty-flavoured key that ever gets proposed (`physio.*`, `dental.*`, `derma.*`, etc.) | Violates §1 | Refuse at review time; use `clinical_notes.*`, `encounters.*`, `documents.*` | Governance guard |

**Nothing in this list is deprecated in the database today.** The
`deprecated` and `replaced_by` columns remain unchanged on every row.

---

## 11. Compliance Summary

| Constraint | Status |
|---|---|
| No runtime authorization change | ✅ |
| No RLS change | ✅ |
| No SECURITY DEFINER change | ✅ |
| No Edge Function change | ✅ |
| No feature-flag change | ✅ |
| No `AuthorizationService` behaviour change | ✅ |
| No bundle evaluation change | ✅ |
| No permission decision change | ✅ |
| No current production behaviour change | ✅ |
| Taxonomy and architecture improvements documented | ✅ |
| Backward compatibility preserved | ✅ |
| Future specialty extensibility path defined | ✅ |

This document is governance-grade guidance for future, parity-safe
migrations. It does not itself modify anything.
