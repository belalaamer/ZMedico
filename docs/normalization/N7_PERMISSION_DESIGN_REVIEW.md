# N7 — Permission Design Review (Catalog v2.1 Approval)

**Status:** Documentation only. No SQL. No catalog inserts. No bundle changes. No code changes.
**Scope:** Review every NEW permission proposed by Taxonomy v2 (84 keys) + N6 additions (34 keys) = **118 candidate keys** for Catalog v2.1.
**Inputs:** N1 Taxonomy v2, N2 Bundle Integrity, N3 Coverage Matrix, N4 Dead Permission Report, N5 Dependency Graph, N6 Completeness Validation, governance charter, ownership matrix, product decisions.

**Verdict codes:** `KEEP` (approve as-is) · `MERGE` (fold into an existing/sibling key) · `SPLIT` (break into finer keys) · `REMOVE` (do not insert) · `DEFER` (blocked by PD).

**Legend for reused columns:**
- **Prod-Crit** — Production critical (Y/N)
- **Merge?** — Can be merged with another permission
- **Action?** — Could be an action on an existing family instead of a new family
- **Scope** — global / branch / owner / patient / tenant
- **Approval** — C0..C5 change-class from Charter
- **Risk** — Low / Med / High / Crit
- **Lifecycle** — Draft / Approved / Deferred / Deprecated

Justifications are collapsed per group to keep this readable. Where the rationale for every sibling key is identical, one row uses the family notation `.*`.

---

## 1. Clinical Domain

### 1.1 Appointments
| Key | Purpose | Not covered by | Scope | Approval | Risk | Prod-Crit | Merge? | Action? | Verdict | Lifecycle |
|---|---|---|---|---|---|---|---|---|---|---|
| `appointments.configure` | Working hours, slot length, buffers | `settings.edit` is umbrella; needs per-domain governance | branch | C2 | Med | Y | N | N | **KEEP** | Draft→Approved |
| `appointments.cancel` (N6) | Audit-separable cancel from generic edit | `.edit` overloads status writes | branch | C2 | Med | Y | Y (into `.edit`) | Y | **MERGE into `.edit`** unless Ops mandates split audit; default = MERGE | Deferred pending Ops call |

### 1.2 Patients / Documents / Wallet
| Key | Purpose | Scope | Risk | Verdict | Notes |
|---|---|---|---|---|---|
| `documents.view/.upload/.delete` | Patient document lifecycle distinct from clinical notes | patient | Med | **KEEP** | Draft→Approved |
| `patients.merge` (N6) | Duplicate-record merge; irreversible; admin-only | global | High | **KEEP** | Draft |
| `patients.archive/.restore` (N6) | Soft-delete workflow separate from hard delete | patient | Med | **MERGE into `.edit` + status field**; if regulator demands audit, SPLIT | Deferred |
| `patient_wallet.view` | Wallet balance visibility for finance/reception | patient | Med | **DEFER (PD-05)** | Draft |
| `patient_wallet.credit/.debit` | Wallet mutation with distinct audit posture | patient | High | **KEEP** | Deferred until PD-05 |

### 1.3 Dental / Diagnoses / Procedures / Vitals
| Key | Verdict | Notes |
|---|---|---|
| `dental.view/.edit` | **KEEP** | Distinct table `dental_chart`, clinician-only writes |
| `diagnoses.view/.edit` | **KEEP** | Coding role separate from record write |
| `procedures.view/.edit` | **KEEP** | Same as diagnoses |
| (vitals.* already Approved) | — | — |

### 1.4 Prescriptions
| Key | Verdict | Notes |
|---|---|---|
| `prescriptions.view/.create/.edit/.delete` | **KEEP** | Draft |
| `prescriptions.dispense` | **KEEP** | Non-canonical verb; documented in taxonomy; role-critical for pharmacy |
| `prescriptions.sign` (N6) | **KEEP** | HIPAA/e-Rx auditability requires distinct verb |
| `prescriptions.print` (N6) | **MERGE into `.view`** (print is a UI action of view). SPLIT only if controlled-substance regulator requires per-print log — DEFER until Compliance decides | Deferred |

### 1.5 Treatment Plans / Physio
| Key | Verdict | Notes |
|---|---|---|
| `treatment_plans.approve` (N6) | **KEEP** | Workflow verb, not edit |
| `treatment_plans.close` (N6) | **KEEP** | Terminal state guard |
| `physio.view/.create/.edit/.delete` | **KEEP** | Distinct clinical subdomain, own tables |
| `physio.close` | **KEEP** | Terminal state |
| `physio.reassess` | **KEEP** | Reassessment sessions form audit chain |
| `medical_records.sign` (N6) | **KEEP** | HIPAA e-signature |
| `medical_records.amend` (N6) | **KEEP** | Post-sign amendment is regulator-critical |

---

## 2. Finance Domain

### 2.1 Invoices
| Key | Verdict | Notes |
|---|---|---|
| `invoices.approve` | **KEEP** | Draft/approved workflow; SOX |
| `invoices.void` (N6) | **KEEP** | Distinct from delete; keeps row for audit |
| `invoices.reopen` (N6) | **KEEP** | Terminal-state reversal |

### 2.2 Payments (all DEFER — PD-01/02)
| Key | Verdict | Notes |
|---|---|---|
| `payments.view/.create/.edit/.delete/.export` | **DEFER** | Blocked by PD-01 |
| `payments.refund` | **DEFER** | Blocked by PD-02 |
| `payments.void` (N6) | **DEFER** | Blocked by PD-02 |

### 2.3 Expenses (all DEFER — PD-03)
| Key | Verdict |
|---|---|
| `expenses.view/.create/.edit/.delete/.export/.approve` | **DEFER** |

### 2.4 Treasury
| Key | Verdict | Notes |
|---|---|---|
| `treasury.transfer` (N6) | **KEEP** | Distinct audit posture from generic edit |
| `treasury.close` (N6) | **KEEP** | Daily close workflow |
| `treasury.reopen` (N6) | **KEEP** | Admin-only |

### 2.5 Coupons / Insurance / Loyalty
| Key | Verdict | Notes |
|---|---|---|
| `coupons.redeem` (N6) | **KEEP** | Front-desk verb, distinct from create/edit |
| `insurance.view/.create/.edit/.delete` | **KEEP** | Own tables (companies, contracts, rules) |
| `loyalty.view/.configure` | **KEEP** | Settings-domain isolate |

---

## 3. Inventory Domain

| Key | Verdict | Notes |
|---|---|---|
| `products.view/.create/.edit/.delete` | **KEEP** | SKU master distinct from stock |
| `suppliers.view/.create/.edit/.delete` (N6) | **KEEP** | Gap in v2; own table |
| `purchase_orders.view/.create/.edit/.delete/.approve/.receive` | **KEEP** | Multi-verb procurement workflow |
| `purchase_orders.cancel` (N6) | **KEEP** | Non-delete state transition |
| `services.view/.configure` | **KEEP** | Catalog + consumables config |

---

## 4. HR / Operations

### 4.1 Leave
| `hr_leave.view/.request/.approve/.cancel` | **KEEP** | Draft — canonical workflow verbs |

### 4.2 Payroll (DEFER — PD-04)
| `payroll.view/.run/.adjust/.export` | **DEFER** |
| `payroll.approve` (N6) | **DEFER** | Dual-control depends on PD-04 |

### 4.3 Performance / Attendance / Queue
| Key | Verdict | Notes |
|---|---|---|
| `performance.view/.create/.submit/.approve` | **KEEP** | Review workflow |
| `attendance.view/.log/.edit` | **KEEP** | `log` = check-in/out |
| `queue.view/.manage/.configure` | **KEEP** | Live-queue ops |
| (`work_schedules.*` proposed in N6) | **MERGE into `attendance.configure`** | REMOVE as standalone family |

---

## 5. Communication / Notifications

| `communication.view/.compose/.send/.configure` | **KEEP** | Compose vs send separates authoring from dispatch |
| `notifications.view/.configure` | **KEEP** | Per-user preferences |

---

## 6. Reports

| Key | Verdict | Notes |
|---|---|---|
| `saved_reports.view/.create/.edit/.delete` (N6) | **MERGE into existing `reports_<dom>.*` as `.save` qualifier**; SPLIT only if cross-domain saved reports emerge. Recommend **REMOVE** the family, keep as action on domain reports | Deferred |
| `report_schedules.view/.create/.edit/.delete` (N6) | **MERGE into `reports_<dom>.schedule` action** | REMOVE family |

---

## 7. Governance / System / Audit

| Key | Verdict | Notes |
|---|---|---|
| `audit.read` | **KEEP** | Replaces UMBRELLA `settings.export` on audit tables |
| `audit.export` (N6) | **KEEP** | Regulator-critical, separate from read |
| `authz.manage` (N6) | **KEEP** | Isolates role/bundle/permission mgmt from `settings.edit` |
| `users.create/.reset_password/.delete` (N6) | **KEEP** | Currently gated only by edge-function admin check; needs first-class keys |
| `system.backup/.restore` (N6) | **KEEP** | Replaces UMBRELLA `settings.export` on backups |
| `system.import` (N6) | **KEEP** | Data import distinct from restore |
| `saas_billing.view/.manage` | **KEEP** | Tenant-scope isolation |

---

## 8. Anti-pattern & Naming Review

| Finding | Affected Keys | Action |
|---|---|---|
| Verb `manage` overloads write+configure | `queue.manage`, `saas_billing.manage` | KEEP but document — `manage` is a documented custom verb for state machines |
| Print as separate key | `prescriptions.print` | MERGE into `.view` unless Compliance splits |
| Cancel vs edit ambiguity | `appointments.cancel`, `purchase_orders.cancel`, `hr_leave.cancel` | Split accepted where audit trail matters; MERGE only for `appointments.cancel` (low-audit) |
| Archive/restore soft-delete | `patients.archive/.restore` | MERGE into `.edit` + status; SPLIT only if regulator asks |
| Family that should be action | `work_schedules.*`, `saved_reports.*`, `report_schedules.*` | REMOVE families; fold as actions |
| Naming standard | All candidate keys pass the `group.verb[.qualifier]` regex | OK |
| Umbrella overloads | `settings.export` (audit+backup), `reports.view/.export` | REMOVE after Wave 3H (already tracked N4) |

---

## 9. Verdict Roll-up

| Verdict | Count | Notes |
|---|---|---|
| **KEEP (approve for insertion)** | 72 | Ready for N1-INSERT once PDs unblocked |
| **DEFER (PD-blocked)** | 18 | payments (7), expenses (6), payroll (5) |
| **MERGE (fold into existing key/action)** | 5 | `appointments.cancel`, `patients.archive`, `patients.restore`, `prescriptions.print`, work_schedules family |
| **REMOVE (do not create)** | 3 | `saved_reports.*` family, `report_schedules.*` family, `work_schedules.*` family (all become actions elsewhere) |
| **SPLIT** | 0 | No candidate requires further splitting at this stage |
| **Total candidates reviewed** | 118 | 84 from N1 + 34 from N6 |

Effective inserts allowed today (KEEP only, PDs still open): **72 keys**.
After PD-01..PD-05 resolution: **90 keys**.
Final Catalog v2.1 size when everything lands: **67 (existing) + 90 = 157 keys** — down from the 185 projected in N6 because MERGE/REMOVE trims 28 candidates.

---

## 10. Catalog v2.1 Approval Report — Insertion Whitelist

The following are the ONLY keys authorized for insertion when N1-INSERT executes.
Any key not on this list must be re-reviewed by the Board.

### Immediately approvable (72)
- Appointments: `appointments.configure`
- Clinical: `dental.view`, `dental.edit`, `diagnoses.view`, `diagnoses.edit`, `procedures.view`, `procedures.edit`,
  `prescriptions.view`, `prescriptions.create`, `prescriptions.edit`, `prescriptions.delete`, `prescriptions.dispense`, `prescriptions.sign`,
  `treatment_plans.approve`, `treatment_plans.close`,
  `physio.view`, `physio.create`, `physio.edit`, `physio.delete`, `physio.close`, `physio.reassess`,
  `medical_records.sign`, `medical_records.amend`,
  `documents.view`, `documents.upload`, `documents.delete`
- Finance: `invoices.approve`, `invoices.void`, `invoices.reopen`,
  `treasury.transfer`, `treasury.close`, `treasury.reopen`,
  `coupons.redeem`,
  `insurance.view`, `insurance.create`, `insurance.edit`, `insurance.delete`,
  `loyalty.view`, `loyalty.configure`
- Inventory: `products.view/.create/.edit/.delete`,
  `suppliers.view/.create/.edit/.delete`,
  `purchase_orders.view/.create/.edit/.delete/.approve/.receive/.cancel`,
  `services.view`, `services.configure`
- HR/Ops: `hr_leave.view/.request/.approve/.cancel`,
  `performance.view/.create/.submit/.approve`,
  `attendance.view/.log/.edit/.configure` (last one absorbs work_schedules),
  `queue.view/.manage/.configure`
- Communication: `communication.view/.compose/.send/.configure`,
  `notifications.view/.configure`
- Governance: `audit.read`, `audit.export`, `authz.manage`,
  `users.create`, `users.reset_password`, `users.delete`,
  `system.backup`, `system.restore`, `system.import`,
  `saas_billing.view`, `saas_billing.manage`
- Patients: `patients.merge`

### Deferred pending Product Decisions (18)
- Payments (PD-01/02): `payments.view/.create/.edit/.delete/.export/.refund/.void`
- Expenses (PD-03): `expenses.view/.create/.edit/.delete/.export/.approve`
- Payroll (PD-04): `payroll.view/.run/.adjust/.export/.approve`
- Wallet (PD-05): `patient_wallet.view/.credit/.debit`

### Not to be inserted (8)
- MERGE → represented as behavior of existing keys: `appointments.cancel`, `patients.archive`, `patients.restore`, `prescriptions.print`
- REMOVE (become actions on other families): `work_schedules.*`, `saved_reports.*`, `report_schedules.*`

---

## 11. Stop Condition
Design review complete. No SQL, catalog, bundle, or code changes performed.
Next actionable step: **Board ratification of this Approval Report + PD-01..PD-05 resolution**, after which N1-INSERT may proceed under the whitelist in §10.
