# Business Authorization Specification (BAS v1.0)

**Status:** FINAL — Business source of truth for all R5+ authorization work.
**Scope:** Business/operational model only. No SQL, no RLS, no code.
**Authors:** Independent Healthcare Operations Consultant + Principal Security Architect.
**Supersedes on business questions:** `docs/RBAC_MATRIX.md`, `docs/business/BUSINESS_RBAC_MATRIX.md` (role taxonomy carried forward; permission semantics refined here).
**Governs:** Every future R5+ batch, every new permission, every new role, every bundle change.

> This is a brutally honest review. Where today's model is wrong, the correct
> business model is stated first, then the gap versus the current implementation
> is documented. No attempt is made to defend prior decisions.

---

## 0. Executive Verdict

The current RBAC model is **technically competent but operationally naive**.
It was designed by projecting database tables into permissions, not by
modelling how a real multi-branch clinic actually operates. The result:

- **Roles are too few and too coarse.** A single `doctor` role cannot
  represent an attending physician, a resident, a locum, and a consultant.
- **Permissions are too table-shaped.** `invoices.edit` conflates "fix a
  typo on a draft" with "modify a finalized fiscal document" — two
  fundamentally different business operations.
- **Separation of Duties is under-enforced.** Several roles can today
  perform end-to-end money flows (create invoice → collect cash → close
  till → post to books). This is a material control weakness in any
  regulated healthcare environment.
- **Ownership is missing from the permission grammar.** "A doctor can
  edit medical records" is not a real rule; the real rule is "the
  attending physician can edit records they authored, within the
  encounter window, before sign-off." None of that is expressed today.
- **State is missing from the permission grammar.** "Edit invoice" must
  be gated by invoice status. This is a business rule, not a UI concern.
- **Approval workflows are absent.** Refunds, write-offs, controlled
  substance dispensing, salary adjustments, and record amendments all
  require dual control in real clinics. Today they are single-actor.
- **Branch scoping is inconsistent.** Some operations that should be
  branch-scoped are global (e.g., coupon issuance), and some that should
  be organization-scoped are branch-scoped (e.g., patient master record).

**Verdict:** The technical architecture is ready for R5. The **business
model is not**. Migrating RLS policies against the current permission
set will bake operational defects into RLS, and unwinding them post-R5
will require another full migration. **Freeze R5. Adopt this
specification. Then migrate.**

---

## 1. First Principles (non-negotiable)

1. **Roles describe jobs, not tables.** If a role name maps 1:1 to a
   database module, it is wrong.
2. **Permissions describe business operations, not CRUD verbs.**
   `prescriptions.dispense_controlled` is a business operation.
   `prescriptions.update` is not.
3. **Least privilege by default.** A role starts empty and earns each
   permission through a documented operational need.
4. **Separation of Duties (SoD) is enforced, not advised.** Toxic
   combinations are declared and prevented at assignment time.
5. **Ownership beats role.** Where a natural owner exists (author,
   assignee, custodian), the permission is ownership-scoped.
6. **Scope is explicit.** Every permission declares: `global` |
   `organization` | `branch` | `owner` | `patient-consented`.
7. **State is explicit.** Every mutating permission declares which
   entity states it applies to.
8. **Dual control for high-impact actions.** Money out, controlled
   drugs, record amendments after sign-off, and identity changes
   require approval by a second, differently-roled actor.
9. **Break-glass is a first-class role, not a workaround.** Emergency
   access exists, is time-boxed, is logged immutably, and triggers
   post-hoc review.
10. **The business model owns the vocabulary.** The technical layer
    (RLS, RPC, UI guards) implements it. Never the reverse.

---

## 2. Correct Role Taxonomy (Recommended)

### 2.1 Clinical roles

| Role | Purpose | Notes |
|---|---|---|
| `physician_attending` | Fully licensed treating doctor | Owns encounters, may sign-off records |
| `physician_resident` | Doctor in training | Drafts records; sign-off requires attending |
| `physician_locum` | Temporary/visiting doctor | Time-boxed access, no admin rights |
| `physician_consultant` | External specialist, read + append | Cannot edit records they did not author |
| `dentist` | Distinct scope of practice | Separate from `physician_*` |
| `physiotherapist` | Physio-only clinical scope | No prescribing, no dispensing |
| `nurse_registered` | Full nursing scope | Vitals, medication administration, triage |
| `nurse_assistant` | Limited nursing scope | Vitals + observations only |
| `pharmacist` | Dispenses, verifies Rx, controlled substances | **Never** also a prescriber account |
| `lab_technician` | Orders fulfilment, result entry | Cannot amend after verified |
| `radiologist` | Imaging read + report | Owns imaging reports |
| `radiographer` | Imaging acquisition | Cannot author reports |

### 2.2 Front-office roles

| Role | Purpose |
|---|---|
| `receptionist` | Registration, booking, arrival, initial invoice draft |
| `patient_coordinator` | Care navigation, follow-up scheduling |
| `queue_manager` | Live queue operations only |

### 2.3 Finance roles (strict SoD)

| Role | Purpose |
|---|---|
| `cashier` | Collects payment; cannot post to ledger, cannot void |
| `billing_specialist` | Prepares/edits invoices before finalisation; no cash handling |
| `accountant` | Ledger, treasury, reconciliations; **no cash handling, no invoice creation** |
| `finance_approver` | Approves refunds, write-offs, void, treasury transfers |
| `finance_controller` | Period close, journal review; oversight only |

### 2.4 Inventory & procurement

| Role | Purpose |
|---|---|
| `inventory_clerk` | Stock counts, receipts, transfers |
| `purchasing_officer` | Creates PO drafts, negotiates suppliers |
| `purchasing_approver` | Approves POs above threshold |
| `pharmacy_inventory` | Controlled-substance ledger (separate from general stock) |

### 2.5 People & operations

| Role | Purpose |
|---|---|
| `hr_officer` | Employee records, leave, non-financial HR |
| `payroll_officer` | Salary runs, adjustments; **cannot** edit own record |
| `hr_approver` | Approves salary changes, terminations |
| `branch_manager` | Operational oversight of one or more branches; no clinical writes, no financial writes without approver role |
| `operations_manager` | Cross-branch operations |
| `compliance_officer` | Read-all audit access; cannot mutate |
| `data_protection_officer` | Consent, erasure, export requests |

### 2.6 System roles

| Role | Purpose |
|---|---|
| `system_admin` | Platform configuration, integrations; **no PHI access by default** |
| `security_admin` | Roles, bundles, permission assignments; **no PHI, no finance** |
| `tenant_owner` | Legal account owner; can grant `security_admin` |
| `break_glass` | Time-boxed emergency access; auto-expires; auto-alerts |
| `support_readonly` | Vendor/support staff; PHI-redacted, read-only |

### 2.7 Roles to retire from the current model

- `staff` — meaningless catch-all. Split into `nurse_assistant`,
  `queue_manager`, or explicit read-only roles as appropriate.
- Monolithic `doctor` — replace with the 4 physician variants above.
- Monolithic `accountant` — split into `cashier`, `billing_specialist`,
  `accountant`, `finance_approver`.
- Monolithic `admin` — split into `system_admin`, `security_admin`,
  `tenant_owner`. Nobody should routinely operate as "admin".

---

## 3. Permission Grammar (Recommended)

A permission is a **5-tuple**:

```
<domain>.<operation>[.<qualifier>]  @  <scope>  |  states=[...]  |  approval=<policy>
```

- **domain** — business area (e.g., `prescriptions`, `invoices`, `payroll`).
- **operation** — business verb (`dispense`, `void`, `sign_off`, `amend`,
  `approve`, `override`, `refund`), not CRUD.
- **qualifier** — optional (e.g., `controlled`, `high_value`).
- **scope** — `global` | `org` | `branch` | `owner` | `assigned` | `consented`.
- **states** — the entity states in which the operation is allowed.
- **approval** — `none` | `second_actor` | `role:finance_approver` | `dual_of_role`.

CRUD verbs (`view`/`create`/`edit`/`delete`/`export`) are retained only
for pure reference data (catalogs, categories) where no business
workflow exists. Everywhere else, CRUD is replaced by business verbs.

### 3.1 Illustrative examples of the shift

| Today (wrong) | Recommended (business) |
|---|---|
| `invoices.edit` | `invoices.amend_draft @ branch \| states=[draft]`, `invoices.void @ branch \| states=[finalised] \| approval=role:finance_approver` |
| `invoices.delete` | Retired. Invoices are fiscal; use `void`. |
| `medical_records.edit` | `medical_records.author @ owner \| states=[open]`, `medical_records.amend @ owner \| states=[signed] \| approval=second_actor` |
| `prescriptions.create` | `prescriptions.issue @ owner`, `prescriptions.issue_controlled @ owner \| approval=role:pharmacist` |
| `prescriptions.dispense` | `prescriptions.dispense @ branch`, `prescriptions.dispense_controlled @ branch \| approval=second_actor` |
| `treasury.edit` | Retired. Use `treasury.post_transaction`, `treasury.reverse_transaction \| approval=role:finance_approver`, `treasury.close_day \| approval=role:finance_controller` |
| `hr.edit` | `hr.update_employee @ org`, `hr.update_salary @ org \| approval=role:hr_approver`, `hr.terminate_employee \| approval=role:hr_approver` |
| `coupons.create` | `coupons.issue @ branch`, `coupons.issue_high_value \| approval=role:finance_approver` |
| `patients.delete` | Retired. Use `patients.archive`, `patients.gdpr_erase @ org \| approval=role:data_protection_officer` |
| `settings.edit` | Split by surface: `settings.branch_config @ branch`, `settings.clinic_profile @ org`, `settings.security_policy @ org \| role:security_admin` |
| `reports.export` | Split by data class: `reports.export_phi \| approval=role:compliance_officer`, `reports.export_finance @ org`, `reports.export_operational @ branch` |

---

## 4. Ownership, Scope, and State

### 4.1 Ownership-scoped operations (must be, are not today)

- Medical record authorship and amendment.
- Prescription issuance and cancellation.
- Physio case management and closure.
- Doctor's own appointment schedule edits.
- Personal attendance clock-in/out.
- Own leave requests (never own approval).
- Own performance review acknowledgement (never own rating).

### 4.2 Branch-scoped operations

All operational data: appointments, queue, invoices, payments,
expenses, treasury, inventory movements, staff schedules, attendance,
branch-level reports. **A user with access to Branch A must never
see or mutate Branch B data**, regardless of role — unless the role
is explicitly organisation-scoped (see 4.3).

### 4.3 Organisation-scoped operations

Patient master record, patient consent, clinical history, insurance
contracts, employee master record, salary bands, security policy,
role/permission assignment, audit logs, GDPR/HIPAA workflows, tenant
billing. These are patient-owned or org-owned; they do not belong to
a branch.

### 4.4 Patient-consent-scoped operations

Sharing records with external consultants, releasing records to the
patient's family, exporting a patient dossier, insurance claim
submission. Requires an active, unrevoked consent record on the
patient. Not implemented today.

### 4.5 State-dependent permissions

| Entity | State-gated operation |
|---|---|
| Invoice | `amend` only in `draft`; `void` only in `finalised`; nothing in `paid_settled` |
| Payment | `refund` only in `settled` within refund window; blocked after fiscal period close |
| Medical Record | `edit` only in `open`; `amend` only in `signed` with approval; never in `locked` |
| Prescription | `cancel` only in `issued`; never after `dispensed` |
| Appointment | `reschedule` only in `booked`/`confirmed`; `cancel` only pre-arrival; `no_show` only post-slot |
| Treasury day | `post` only in `open`; `reopen` requires `finance_controller` |
| Payroll run | `edit` only in `draft`; `approve` only in `pending_review`; `pay` only in `approved` |
| PO | `edit` only in `draft`; `receive` only in `sent`/`partially_received` |

None of these are enforced in the permission model today. They are
partially enforced in UI and inconsistently in triggers.

### 4.6 Time-dependent permissions

- Locum access auto-expires at shift end.
- Break-glass access auto-expires within 30–60 minutes.
- Refund window (e.g., 30 days) closes the `refund` permission on that payment.
- Fiscal period close permanently closes `amend`/`void` on invoices in that period.
- After-hours access to controlled-substance ledger requires break-glass.

---

## 5. Separation of Duties (Toxic Combinations)

The following role pairs **must never** be held by the same user
account, and the assignment system must refuse them:

1. `cashier` + `accountant` (cash handling + ledger)
2. `cashier` + `finance_approver` (own payments approver)
3. `billing_specialist` + `finance_approver` (self-approve refunds)
4. `physician_*` + `pharmacist` (prescribe + dispense; controlled-substance risk)
5. `physician_*` + `lab_technician` on the same order (order + result)
6. `purchasing_officer` + `purchasing_approver`
7. `purchasing_officer` + `inventory_clerk` (order + receive)
8. `payroll_officer` + `hr_approver` (adjust + approve own runs)
9. `hr_officer` + `payroll_officer` on the same employee (own record)
10. `security_admin` + `tenant_owner` (grant + audit oneself); overridable only during initial bootstrap, then locked
11. `compliance_officer` + any mutating role (auditor independence)
12. `data_protection_officer` + `security_admin` (grant + erase)
13. `system_admin` + any PHI-touching role by default (least privilege)
14. `break_glass` + any other active role concurrently (must be sole active role during the window)

### 5.1 Privilege escalation paths present today

- `admin` alone can grant itself any permission — no dual control on the grant.
- `hr` can edit their own `staff_profiles` row unless the trigger fires;
  the model should forbid self-mutation at the permission layer, not
  rely on a trigger.
- `accountant` can create an invoice **and** collect its payment **and**
  post it to the ledger. Full front-to-back money flow by one actor.
- `receptionist` who is also `staff` (allowed today) sees appointments
  they otherwise should not.
- `doctor` viewing all patients regardless of assignment — should be
  restricted to assigned / consented patients by default.

---

## 6. Approval-Required Operations

Operations that must require a second, differently-roled actor's
approval (dual control) — none are implemented as approval workflows
today:

- Refunds above a threshold (`finance_approver`).
- Invoice void after finalisation (`finance_approver`).
- Write-off of receivable (`finance_controller`).
- Treasury reversal / transfer above threshold (`finance_approver`).
- Salary adjustment / bonus / termination (`hr_approver`).
- Payroll run finalisation (`hr_approver` + `finance_approver`).
- PO issuance above threshold (`purchasing_approver`).
- Controlled substance dispensing (`pharmacist` + second `pharmacist` or `physician_attending`).
- Medical record amendment after sign-off (second `physician_attending`).
- Prescription cancellation after partial dispense (`pharmacist`).
- Patient GDPR erasure (`data_protection_officer` + `tenant_owner`).
- Role/bundle change on any user (`security_admin` + `tenant_owner`).
- Break-glass activation (self-service, but auto-notifies `compliance_officer`).
- Reopening a closed fiscal period (`finance_controller` + `tenant_owner`).
- Deleting/redacting audit-log entries (**forbidden**, no approval unlocks this).

---

## 7. Missing Permissions (business gaps)

Grouped by domain. Each is a business operation with no current
representation:

**Clinical**
- `medical_records.sign_off`, `medical_records.amend_signed`, `medical_records.lock`
- `prescriptions.issue_controlled`, `prescriptions.dispense_controlled`, `prescriptions.cancel_after_dispense`
- `lab_orders.request`, `lab_orders.collect`, `lab_orders.result_enter`, `lab_orders.verify`, `lab_orders.amend_verified`
- `imaging.request`, `imaging.acquire`, `imaging.report`, `imaging.finalise_report`
- `consent.grant`, `consent.revoke`, `consent.view_history`
- `triage.assign_priority`, `triage.override_priority`
- `referrals.issue_internal`, `referrals.issue_external`, `referrals.accept`
- `clinical_alerts.acknowledge`, `clinical_alerts.override` (allergy, DDI)

**Finance**
- `invoices.finalise`, `invoices.reissue`, `invoices.credit_note`
- `payments.refund_partial`, `payments.refund_full`, `payments.chargeback_record`
- `treasury.reconcile`, `treasury.reopen_day`, `treasury.transfer_inter_branch`
- `fiscal_period.close`, `fiscal_period.reopen`
- `pricing.override`, `pricing.discount_above_threshold`
- `insurance_claim.submit`, `insurance_claim.appeal`, `insurance_claim.write_off`

**HR / Payroll**
- `payroll.simulate`, `payroll.finalise`, `payroll.reverse`
- `attendance.correct_others`, `attendance.override_geofence`
- `leave.approve`, `leave.reject`, `leave.cancel_approved`
- `performance.rate`, `performance.acknowledge`, `performance.dispute`

**Inventory**
- `stock.count_cycle`, `stock.adjust_variance`, `stock.write_off_expired`
- `controlled_substance.ledger_entry`, `controlled_substance.witness`
- `po.receive_partial`, `po.close_short`

**Governance / Security**
- `roles.grant`, `roles.revoke`, `bundles.assign`, `bundles.publish`
- `break_glass.activate`, `break_glass.review`
- `audit.read_all`, `audit.export_regulator`
- `gdpr.erase`, `gdpr.export_subject`, `gdpr.rectify`
- `session.revoke_others`, `mfa.reset_others`

**Communication / Patient**
- `messages.send_to_patient`, `messages.mark_confidential`
- `documents.release_to_patient`, `documents.release_to_third_party @ consented`

---

## 8. Permissions to Retire / Rename (technical, not business)

- Any `*.delete` on transactional data — replace with `archive`, `void`, `cancel`, `erase` as appropriate.
- `reports.view` / `reports.export` — umbrella, ambiguous; split by data class.
- `settings.edit` — split by settings surface and data class.
- `treasury.edit`, `treasury.create` — replace with business verbs (see 3.1).
- `medical_records.create`/`edit` — replace with `author`/`amend`/`sign_off`.
- `hr.create`/`edit`/`delete` — replace with lifecycle verbs.
- CRUD on `coupons` — replace with `issue`, `revoke`, `redeem`.
- CRUD on `patients` — replace with `register`, `update_demographics`,
  `merge_duplicates` (approval-required), `archive`, `gdpr_erase`.

---

## 9. Overloaded Roles (current)

| Role | Overload symptom | Recommended split |
|---|---|---|
| `admin` | Grants itself anything; holds PHI + finance + security + platform | `tenant_owner`, `security_admin`, `system_admin`, `compliance_officer` |
| `manager` | Ops + inventory + HR view + reports without accountability | `branch_manager`, `operations_manager` (org-scoped), plus explicit report bundles |
| `doctor` | Attending vs resident vs locum vs consultant collapsed | `physician_attending`, `physician_resident`, `physician_locum`, `physician_consultant` |
| `accountant` | Cash + AR + ledger + approvals in one seat | `cashier`, `billing_specialist`, `accountant`, `finance_approver`, `finance_controller` |
| `nurse` | Registered vs assistant collapsed | `nurse_registered`, `nurse_assistant` |
| `hr` | Record edits + payroll + approvals in one seat | `hr_officer`, `payroll_officer`, `hr_approver` |
| `receptionist` | Registration + invoice create + coupon apply | Keep, but move invoice draft to `billing_specialist` in larger branches |
| `staff` | Meaningless | Delete. Force explicit role assignment. |

---

## 10. Role Inheritance (recommended)

Inheritance is expressed via bundles, not via a role hierarchy at the
user level. Recommended bundle inheritance:

```
base_authenticated
  └─ base_clinical_reader
       ├─ nurse_assistant
       │    └─ nurse_registered
       ├─ physician_consultant
       │    ├─ physician_resident
       │    │    └─ physician_attending
       │    └─ physician_locum
       ├─ dentist
       ├─ physiotherapist
       ├─ pharmacist
       ├─ lab_technician
       ├─ radiographer
       │    └─ radiologist
  └─ base_front_office
       ├─ queue_manager
       ├─ receptionist
       │    └─ patient_coordinator
  └─ base_finance_reader
       ├─ cashier
       ├─ billing_specialist
       ├─ accountant
       ├─ finance_approver
       ├─ finance_controller
  └─ base_inventory_reader
       ├─ inventory_clerk
       ├─ purchasing_officer
       ├─ purchasing_approver
       ├─ pharmacy_inventory
  └─ base_hr_reader
       ├─ hr_officer
       ├─ payroll_officer
       ├─ hr_approver
  └─ base_ops_reader
       ├─ branch_manager
       ├─ operations_manager

governance (parallel, non-inheriting)
  ├─ compliance_officer   (read-all PHI + audit; no writes)
  ├─ data_protection_officer
  ├─ security_admin
  ├─ tenant_owner
  ├─ system_admin         (no PHI by default)
  └─ break_glass          (temporary, sole-active)
```

Inheritance rule: a child bundle **adds** permissions; it may not
**remove** a parent's permission. If removal is required, the parent
is wrong and should be split.

---

## 11. Final Business RBAC Matrix (target state)

Legend: `Y` full, `O` own-only, `B` branch-scoped, `A` approval-required,
`S` state-gated, `R` read-only, `—` denied.
Multiple flags combine (e.g., `B,S,A`).

| Domain / Operation | phys_attending | phys_resident | nurse_reg | nurse_asst | pharmacist | lab_tech | receptionist | cashier | billing | accountant | fin_approver | hr_officer | payroll | hr_approver | branch_mgr | ops_mgr | compliance | dpo | sec_admin | tenant_owner | break_glass |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| patients.register | — | — | — | — | — | — | Y | — | — | — | — | — | — | — | B | Y | R | R | — | — | Y |
| patients.update_demographics | — | — | — | — | — | — | Y | — | — | — | — | — | — | — | B | Y | R | R | — | — | Y |
| patients.merge (A) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | A | R | A | — | A | — |
| patients.gdpr_erase (A) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | A | — | A | — |
| appointments.book | O | O | Y | Y | — | — | Y | — | — | — | — | — | — | — | B | Y | R | — | — | — | Y |
| appointments.reschedule (S) | O | O | Y | Y | — | — | Y | — | — | — | — | — | — | — | B | Y | R | — | — | — | Y |
| appointments.cancel (S) | O | O | Y | Y | — | — | Y | — | — | — | — | — | — | — | B | Y | R | — | — | — | Y |
| vitals.record | — | — | Y | Y | — | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | Y |
| medical_records.author (O) | O | O | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | Y |
| medical_records.sign_off (O) | O | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | Y |
| medical_records.amend_signed (A,O) | O+A | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | Y |
| prescriptions.issue (O) | O | O | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | Y |
| prescriptions.issue_controlled (A,O) | O+A | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | Y |
| prescriptions.dispense | — | — | — | — | Y | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | — |
| prescriptions.dispense_controlled (A) | — | — | — | — | A | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | — |
| lab_orders.request (O) | O | O | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | Y |
| lab_orders.result_enter | — | — | — | — | — | Y | — | — | — | — | — | — | — | — | — | — | R | — | — | — | — |
| lab_orders.verify | — | — | — | — | — | Y | — | — | — | — | — | — | — | — | — | — | R | — | — | — | — |
| invoices.amend_draft (S,B) | — | — | — | — | — | — | B | — | B | B | — | — | — | — | B | Y | R | — | — | — | — |
| invoices.finalise (S,B) | — | — | — | — | — | — | B | — | B | B | — | — | — | — | B | Y | R | — | — | — | — |
| invoices.void (S,A) | — | — | — | — | — | — | — | — | — | A | A | — | — | — | — | — | R | — | — | — | — |
| invoices.credit_note (A) | — | — | — | — | — | — | — | — | A | A | A | — | — | — | — | — | R | — | — | — | — |
| payments.collect (B) | — | — | — | — | — | — | — | B | — | — | — | — | — | — | — | — | R | — | — | — | — |
| payments.refund (A,S) | — | — | — | — | — | — | — | — | — | A | A | — | — | — | — | — | R | — | — | — | — |
| treasury.post_transaction (B) | — | — | — | — | — | — | — | — | — | B | — | — | — | — | — | — | R | — | — | — | — |
| treasury.reverse (A) | — | — | — | — | — | — | — | — | — | A | A | — | — | — | — | — | R | — | — | — | — |
| treasury.close_day (A) | — | — | — | — | — | — | — | — | — | A | — | — | — | — | — | — | R | — | — | — | — |
| fiscal_period.close (A) | — | — | — | — | — | — | — | — | — | — | A | — | — | — | — | — | R | — | — | — | — |
| inventory.receive (B) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | B | Y | R | — | — | — | — |
| inventory.adjust_variance (A) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | A | A | R | — | — | — | — |
| controlled_substance.ledger_entry (A) | — | — | — | — | A | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | — |
| po.create (B) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | B | Y | R | — | — | — | — |
| po.approve (A) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | A | A | R | — | — | — | — |
| hr.update_employee | — | — | — | — | — | — | — | — | — | — | — | Y | — | — | — | — | R | R | — | — | — |
| hr.update_salary (A) | — | — | — | — | — | — | — | — | — | — | — | A | — | A | — | — | R | — | — | — | — |
| payroll.run (A) | — | — | — | — | — | — | — | — | — | — | — | — | A | A | — | — | R | — | — | — | — |
| attendance.self_log (O) | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O |
| attendance.correct_others | — | — | — | — | — | — | — | — | — | — | — | — | — | — | B | Y | R | — | — | — | — |
| leave.request (O) | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O | O | — | — | — | — | — |
| leave.approve | — | — | — | — | — | — | — | — | — | — | — | — | — | Y | B | Y | R | — | — | — | — |
| roles.grant (A) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | A | A | — |
| bundles.publish (A) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | A | A | — |
| break_glass.activate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | — | — | Y |
| audit.read_all | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | Y | Y | R | R | — |
| audit.export_regulator | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | Y | Y | — | A | — |
| gdpr.erase (A) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | Y+A | — | A | — |
| settings.security_policy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | — | Y | R | — |
| settings.clinic_profile (org) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | R | Y | R | — | — | Y | — |
| settings.branch_config (B) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | B | Y | R | — | — | Y | — |

> This matrix is illustrative-normative: it shows the target semantics.
> R5+ batches must produce a machine-checkable version of this table
> under `docs/business/BRM_MACHINE_READABLE.yaml` before any policy that
> touches the corresponding domain is migrated.

---

## 12. Alignment with Standards

### 12.1 NIST RBAC (INCITS 359)
- **RBAC0 (core):** Users, roles, permissions, sessions — met.
- **RBAC1 (hierarchies):** Achieved via bundle inheritance (§10). Today's model has flat bundles — **gap**.
- **RBAC2 (constraints):** SoD constraints declared in §5 must be enforced at assignment time — **gap** today.
- **RBAC3 (symmetric):** Achieved once §10 + §5 land.

### 12.2 NIST ABAC (SP 800-162)
- Attribute dimensions required: subject (role, branch, employment status), object (owner, branch, state, sensitivity), environment (time, location, break-glass window).
- Today's model has role + branch only. **Gap:** owner, state, time, sensitivity.

### 12.3 OWASP Authorization Cheat Sheet
- Enforce authorization on every request — met (RLS + PermissionRoute).
- Deny by default — met at DB, partially at UI (some legacy defaults).
- Prefer ABAC for data-level decisions — **gap**, ownership/state missing.
- Centralise decisions — partially met (`AuthorizationService`), but state/ownership decisions live in triggers.
- Log all authorization decisions on sensitive resources — **gap** (audit inserts not universal).

### 12.4 Healthcare best practices (HL7, HIPAA §164.308/312, GDPR Art. 5/9/17/32)
- Minimum necessary rule — **gap**: doctors see all patients.
- Access based on treatment relationship — **gap**: no assignment/consent model.
- Break-glass with mandatory review — **gap**: role does not exist.
- Immutable audit for PHI access — **gap**: reads not audited.
- Right to erasure workflow — **gap**: no `gdpr.erase` permission or workflow.
- Consent-based sharing — **gap**: no consent model in permissions.

### 12.5 Enterprise EMR/HIS parity (Epic, Cerner, InterSystems)
- Break-glass, encounter-scoped access, dual-signature amendments,
  controlled-substance dual control, provider-in-role time boxing,
  chart lock, cosign for residents, delegated inbox — **all absent**.

---

## 13. Gap Register (today → target)

| # | Gap | Severity | Remediation phase |
|---|---|---|---|
| 1 | Roles too coarse (doctor, accountant, admin, staff) | High | Pre-R5 |
| 2 | CRUD-shaped permissions on transactional data | High | Pre-R5 (rename in registry only) |
| 3 | No ownership scope in permission grammar | High | Pre-R5 spec; R5 batches enforce |
| 4 | No state gating in permission grammar | High | Pre-R5 spec; R5 batches enforce |
| 5 | No approval workflow primitives | High | R6 |
| 6 | SoD not enforced at assignment | High | Pre-R5 (assignment guard) |
| 7 | No break-glass role | High | R6 |
| 8 | No consent-scoped permissions | High | R6 |
| 9 | No time-boxed access (locum, break-glass) | Medium | R6 |
| 10 | Doctors see all patients, not assigned/consented | High | R6 |
| 11 | Audit reads not captured | High | Pre-R5 (trigger plan) |
| 12 | GDPR erasure/export not modelled | High | R7 |
| 13 | Fiscal-period lock not modelled | Medium | R6 |
| 14 | Controlled-substance dual control absent | High | R6 |
| 15 | Sign-off / cosign / chart-lock absent | High | R6 |
| 16 | Reports permissions umbrella by data class needs split | Medium | Pre-R5 |
| 17 | `admin` self-grants; no dual control on grants | High | Pre-R5 |
| 18 | `staff` catch-all role | Medium | Pre-R5 (retire) |
| 19 | Coupons issuance not branch-scoped, no threshold | Medium | R5 |
| 20 | Patient master edits treated as branch data | Medium | R5 |

---

## 14. Impact on R5 Execution Plan

The R5 batches remain valid as **technical** groupings, but their
**semantic content** must be updated before execution:

- **Before B1:** publish this specification + a machine-readable target
  matrix; add SoD assignment guard; rename CRUD permissions on
  transactional data in the registry (no policy change yet).
- **B1–B4 (low/medium risk):** unchanged.
- **B5–B7 (branch/ownership/compound):** must adopt ownership and
  branch scopes exactly as defined in §4; do not migrate a policy that
  contradicts this document.
- **B8 (state-machine):** must implement state gating per §4.5 for
  invoices, payments, records, prescriptions, payroll, PO.
- **Post-R5 (R6):** approval workflows, break-glass, consent, locum
  time-boxing.
- **R7:** GDPR/HIPAA workflows.
- **R8:** ABAC environmental attributes.

---

## 15. What must never change again (immutable after R5)

1. The permission grammar (§3) — domain.operation[.qualifier] @ scope | states | approval.
2. The scope taxonomy (§4) — global/org/branch/owner/assigned/consented.
3. The SoD toxic combinations (§5) — additions allowed, removals forbidden.
4. The approval-required list (§6) — additions allowed, removals forbidden.
5. The role taxonomy families (§2) — additions allowed; renames or merges require Board amendment.
6. Audit immutability — no permission may ever grant deletion of audit rows.

---

## 16. Authorization Contract addendum

Every PR touching authorization must additionally certify:

- [ ] Any new permission conforms to §3 grammar (no CRUD on transactional data).
- [ ] Scope is declared and matches §4.
- [ ] States are declared for any mutating permission.
- [ ] Approval policy is declared (`none` is a positive declaration).
- [ ] No new toxic combination is introduced (§5).
- [ ] Business RBAC Matrix (§11) updated if role/permission surface changes.
- [ ] Compliance mapping updated (§12) if regulated data class is touched.
- [ ] Gap register (§13) updated (closed / re-scoped / added).

---

## 17. Final Recommendation

**Do not start R5 policy migrations until:**

1. This specification is ratified.
2. Role taxonomy (§2) is expanded in the registry (roles only, no
   permission grants yet).
3. SoD guard (§5) is in place at role assignment.
4. CRUD-shaped permissions on transactional data are renamed to
   business verbs (registry-only rename, no policy change).
5. Ownership/state/approval dimensions are added to the permission
   metadata (columns present, values populated for existing rows even
   if `none`).

Once these five items are complete, R5 batches may proceed **against
the target model**, not the legacy model. This avoids a second
migration to unwind operational defects that would otherwise be baked
into RLS during R5.

---

*End of Business Authorization Specification v1.0.*