# Final Business Authorization Specification

**Status:** AUTHORITATIVE — replaces all prior permission lists, catalogs, and RBAC matrices for implementation purposes.
**Scope:** Multi-branch healthcare organization (clinics + dental + physio + pharmacy + lab/radiology).
**Consumers:** RLS policies, `permissions` registry, `role_bundles`, frontend `<Can>` gating, edge functions, audit triggers.
**Non-goals:** Architecture rationale, migration plans, governance narrative. Those live in prior documents and are frozen.

---

## 0. Permission Grammar (binding)

Every permission key MUST match:

```
<domain>.<operation>[.<qualifier>]
```

And each permission carries four metadata dimensions used by the runtime resolver:

| Dimension    | Values                                                              |
| ------------ | ------------------------------------------------------------------- |
| `scope`      | `global` \| `branch` \| `own` \| `assigned` \| `emergency`          |
| `states`     | list of entity states in which the op is allowed (`*` = any)        |
| `approval`   | `none` \| `single` \| `dual` \| `break_glass`                       |
| `audit`      | `standard` \| `immutable` \| `phi_access`                           |

Legend used throughout:

- **P** = Performs   **A** = Approves   **R** = Reverses/Voids   **O** = Overrides   **V** = Views   **X** = Exports
- Scope suffix on the cell: `[B]` branch-only, `[G]` cross-branch, `[Own]` own record only, `[Asg]` assigned only.
- **DUAL** = requires second approver of a different role.  **BG** = break-glass path required.  **IMM** = immutable audit.

Roles (final taxonomy, 18):
`super_admin, org_admin, branch_manager, doctor, dentist, physiotherapist, nurse, pharmacist, lab_tech, radiologist, receptionist, billing_specialist, cashier, accountant, hr_officer, payroll_officer, auditor, support`.

**Toxic combinations (blocked at role-assignment):**
`cashier+accountant`, `doctor+pharmacist`, `billing_specialist+cashier`, `payroll_officer+hr_officer`, `auditor+*write*`, `receptionist+billing_specialist`, `branch_manager+auditor`.

---

## 1. Patients

**Workflow:** register → update demographics → attach documents → merge duplicates → archive → (rare) delete.

| Permission                       | Scope   | Approval | Audit  | P                        | A               | R              | V                    | X               |
| -------------------------------- | ------- | -------- | ------ | ------------------------ | --------------- | -------------- | -------------------- | --------------- |
| `patients.register`              | branch  | none     | std    | receptionist, nurse      | —               | —              | all clinical + admin | —               |
| `patients.demographics.update`   | branch  | none     | std    | receptionist             | branch_manager  | —              | ↑                    | —               |
| `patients.clinical_flags.update` | branch  | single   | phi    | doctor, nurse            | doctor          | doctor         | clinical             | —               |
| `patients.merge`                 | branch  | dual     | imm    | branch_manager           | org_admin       | org_admin      | admin                | —               |
| `patients.archive`               | branch  | single   | imm    | branch_manager           | org_admin       | org_admin      | admin                | —               |
| `patients.delete.hard`           | global  | dual+BG  | imm    | org_admin                | super_admin     | —              | super_admin          | —               |
| `patients.phi.view`              | assigned| none     | phi    | doctor, nurse, pharmacist| —               | —              | assigned staff       | —               |
| `patients.phi.view.crossbranch`  | global  | BG       | phi+imm| doctor(BG)               | branch_manager  | —              | auditor              | —               |
| `patients.export`                | branch  | single   | imm    | org_admin                | super_admin     | —              | —                    | org_admin       |

**Splits made:** `patients.update` split into demographics vs clinical_flags (SoD: front desk cannot alter allergies/alerts).
**Removed:** blanket `patients.edit` — too broad.
**Missing controls added:** cross-branch PHI view requires break-glass with post-hoc manager review.

---

## 2. Appointments

**Workflow:** book → confirm → check-in → in-room → complete / no-show / cancel / reschedule.

| Permission                          | Scope  | Approval | Audit | P                             | A              | R               |
| ----------------------------------- | ------ | -------- | ----- | ----------------------------- | -------------- | --------------- |
| `appointments.book`                 | branch | none     | std   | receptionist, doctor          | —              | —               |
| `appointments.reschedule`           | branch | none     | std   | receptionist                  | —              | —               |
| `appointments.cancel.soft`          | branch | none     | std   | receptionist                  | —              | receptionist    |
| `appointments.cancel.late_fee_waive`| branch | single   | imm   | branch_manager                | —              | —               |
| `appointments.checkin`              | branch | none     | std   | receptionist, nurse           | —              | —               |
| `appointments.status.transition`    | branch | none     | std   | doctor, nurse (state-guarded) | —              | branch_manager  |
| `appointments.override.doublebook`  | branch | single   | imm   | branch_manager                | —              | —               |
| `appointments.crossbranch.view`     | global | none     | std   | org_admin, auditor            | —              | —               |
| `appointments.export`               | branch | none     | std   | branch_manager, org_admin     | —              | —               |

**State machine (enforced in RLS + trigger):**
`booked → confirmed → checked_in → in_room → completed`; branches `→ no_show`, `→ cancelled`. Backwards transitions require `appointments.status.transition` **and** manager approval.

---

## 3. Medical Records

| Permission                        | Scope    | Approval | Audit   | P                       | A/R/O                       |
| --------------------------------- | -------- | -------- | ------- | ----------------------- | --------------------------- |
| `medical_records.create`          | assigned | none     | phi+imm | doctor, dentist, physio | —                           |
| `medical_records.amend`           | own+24h  | none     | imm     | authoring clinician     | after 24h: dual (doctor+mgr)|
| `medical_records.correct.late`    | own      | dual     | imm     | clinician + branch_mgr  | org_admin reverses          |
| `medical_records.sign`            | own      | none     | imm     | authoring clinician     | signature is terminal       |
| `medical_records.unlock`          | assigned | dual+BG  | imm     | branch_manager+org_admin| super_admin                 |
| `medical_records.view`            | assigned | none     | phi     | care team               | —                           |
| `medical_records.view.breakglass` | global   | BG       | phi+imm | any clinician (BG)      | auditor reviews weekly      |
| `medical_records.export`          | assigned | single   | imm     | doctor (own patient)    | branch_manager approves     |

**Rules:** no hard delete, ever. Amendment > 24h creates a signed addendum, never overwrites.

---

## 4. Doctors / Nurses / Reception (staff-role management)

Handled under HR module (§17). No standalone module-level permissions — role assignment is `hr.roles.assign` gated by SoD guard.

---

## 5. Laboratory

| Permission                    | Scope    | Approval | Audit | P                    | A/R                       |
| ----------------------------- | -------- | -------- | ----- | -------------------- | ------------------------- |
| `lab.order.create`            | assigned | none     | std   | doctor               | —                         |
| `lab.order.cancel`            | assigned | none     | std   | doctor               | doctor (before collected) |
| `lab.sample.collect`          | branch   | none     | std   | nurse, lab_tech      | —                         |
| `lab.result.enter`            | branch   | none     | imm   | lab_tech             | —                         |
| `lab.result.validate`         | branch   | single   | imm   | senior lab_tech      | required before release   |
| `lab.result.release`          | branch   | none     | imm   | lab_tech (validated) | doctor overrides hold     |
| `lab.result.amend`            | branch   | dual     | imm   | lab_tech+doctor      | —                         |
| `lab.critical.notify`         | branch   | none     | imm   | lab_tech             | must be ack'd by doctor   |
| `lab.view`                    | assigned | none     | phi   | care team            | —                         |

---

## 6. Radiology

| Permission                | Scope    | Approval | Audit | P               | Notes                          |
| ------------------------- | -------- | -------- | ----- | --------------- | ------------------------------ |
| `radiology.order.create`  | assigned | none     | std   | doctor          | contrast studies require dual  |
| `radiology.order.dual`    | assigned | dual     | imm   | doctor+radiologist | contrast / high-dose         |
| `radiology.study.perform` | branch   | none     | std   | radiologist tech| —                              |
| `radiology.report.draft`  | branch   | none     | phi   | radiologist     | —                              |
| `radiology.report.sign`   | branch   | none     | imm   | radiologist     | terminal                       |
| `radiology.image.view`    | assigned | none     | phi   | care team       | crossbranch = BG               |
| `radiology.export`        | assigned | single   | imm   | radiologist     | manager approves               |

---

## 7. Pharmacy

| Permission                    | Scope  | Approval | Audit | P                | Notes                                       |
| ----------------------------- | ------ | -------- | ----- | ---------------- | ------------------------------------------- |
| `pharmacy.dispense`           | branch | none     | imm   | pharmacist       | requires signed rx                          |
| `pharmacy.controlled.dispense`| branch | dual     | imm   | pharmacist+doctor| DEA-class equivalent                        |
| `pharmacy.substitute`         | branch | single   | imm   | pharmacist       | doctor approves                             |
| `pharmacy.return`             | branch | single   | imm   | pharmacist       | branch_manager approves                     |
| `pharmacy.stock.adjust`       | branch | dual     | imm   | pharmacist+mgr   | variance > threshold requires org_admin     |
| `pharmacy.view`               | branch | none     | std   | pharmacist, doctor | —                                         |

**SoD:** `doctor+pharmacist` blocked. Prescriber cannot dispense their own rx.

---

## 8. Dental

Uses `medical_records.*` grammar plus:

| Permission                | Scope    | Approval | Notes                              |
| ------------------------- | -------- | -------- | ---------------------------------- |
| `dental.chart.update`     | assigned | none     | dentist only                       |
| `dental.treatment_plan.create` | assigned | none | dentist; costs need billing sign-off |
| `dental.treatment_plan.approve.financial` | branch | single | billing_specialist    |

---

## 9. Physiotherapy

| Permission                    | Scope    | P              | Notes                             |
| ----------------------------- | -------- | -------------- | --------------------------------- |
| `physio.case.open`            | assigned | physiotherapist| requires referral                 |
| `physio.session.log`          | assigned | physiotherapist| immutable after sign              |
| `physio.plan.amend`           | own+24h  | physiotherapist| addendum after                    |
| `physio.discharge`            | assigned | physiotherapist| dual with doctor if injury case   |

---

## 10. Procedures

| Permission                     | Scope    | Approval | P              | Notes                              |
| ------------------------------ | -------- | -------- | -------------- | ---------------------------------- |
| `procedures.schedule`          | branch   | none     | receptionist   | —                                  |
| `procedures.consent.capture`   | assigned | none     | nurse, doctor  | mandatory pre-perform              |
| `procedures.perform`           | assigned | none     | doctor         | requires consent + checklist       |
| `procedures.high_risk.perform` | assigned | dual     | doctor+2nd doc | flagged catalog entries            |
| `procedures.abort`             | assigned | none     | performing doc | immutable                          |

---

## 11. Prescriptions

| Permission                     | Scope    | Approval | P                | Notes                                |
| ------------------------------ | -------- | -------- | ---------------- | ------------------------------------ |
| `prescriptions.create`         | assigned | none     | doctor, dentist  | —                                    |
| `prescriptions.controlled.create` | assigned | dual  | doctor+2nd doc   | controlled catalog                   |
| `prescriptions.amend`          | own+24h  | none     | prescriber       | addendum after                       |
| `prescriptions.cancel`         | own      | none     | prescriber       | before dispense only                 |
| `prescriptions.refill.authorize` | assigned | none   | prescriber       | count-limited                        |
| `prescriptions.view`           | assigned | none     | care team + pharmacist | phi audit                      |

---

## 12. Inventory

| Permission                    | Scope  | Approval | P                | Notes                              |
| ----------------------------- | ------ | -------- | ---------------- | ---------------------------------- |
| `inventory.item.create`       | branch | none     | pharmacist, mgr  | —                                  |
| `inventory.item.update`       | branch | none     | ↑                | price change needs single approval |
| `inventory.stock.receive`     | branch | none     | pharmacist       | matched to PO                      |
| `inventory.stock.adjust`      | branch | dual     | pharmacist+mgr   | variance rules                     |
| `inventory.stock.transfer`    | global | single   | branch_manager   | receiving mgr acks                 |
| `inventory.write_off`         | branch | dual     | pharmacist+mgr   | > threshold → org_admin            |
| `inventory.view`              | branch | none     | staff            | cost only for finance roles        |
| `inventory.export`            | branch | single   | mgr              | —                                  |

---

## 13. Purchase Orders

| Permission                    | Scope  | Approval | P                     | Notes                                    |
| ----------------------------- | ------ | -------- | --------------------- | ---------------------------------------- |
| `po.draft`                    | branch | none     | pharmacist, mgr       | —                                        |
| `po.submit`                   | branch | none     | pharmacist            | —                                        |
| `po.approve.tier1` (<= X)     | branch | single   | branch_manager        | —                                        |
| `po.approve.tier2` (> X)      | global | dual     | org_admin+accountant  | —                                        |
| `po.receive`                  | branch | none     | pharmacist            | 3-way match                              |
| `po.close`                    | branch | single   | accountant            | —                                        |
| `po.cancel`                   | branch | single   | branch_manager        | before receive only                      |

**SoD:** creator ≠ approver; approver ≠ receiver.

---

## 14. Suppliers

| Permission                    | Scope  | Approval | P                       | Notes                        |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------- |
| `suppliers.create`            | global | single   | accountant              | org_admin approves           |
| `suppliers.bank.update`       | global | dual     | accountant+org_admin    | callback verification req'd  |
| `suppliers.contract.attach`   | global | none     | accountant              | —                            |
| `suppliers.view`              | global | none     | finance, pharmacy       | —                            |

---

## 15. Treasury

| Permission                    | Scope  | Approval | P                       | Notes                                 |
| ----------------------------- | ------ | -------- | ----------------------- | ------------------------------------- |
| `treasury.shift.open`         | branch | none     | cashier                 | one open shift per till               |
| `treasury.shift.close`        | branch | single   | cashier + witness       | witness ≠ cashier                     |
| `treasury.transfer`           | global | dual     | accountant+org_admin    | between tills/banks                   |
| `treasury.adjust`             | branch | dual     | accountant+branch_mgr   | variance investigation attached       |
| `treasury.view`               | branch | none     | cashier(own), acct(all) | —                                     |
| `treasury.export`             | branch | single   | accountant              | org_admin approves cross-branch       |

**SoD:** `cashier+accountant` blocked. `treasury.adjust` cannot be performed by the shift's cashier.

---

## 16. Wallet (patient credit)

| Permission                    | Scope  | Approval | P                       | Notes                          |
| ----------------------------- | ------ | -------- | ----------------------- | ------------------------------ |
| `wallet.topup`                | branch | none     | cashier                 | receipt issued                 |
| `wallet.refund`               | branch | dual     | cashier+accountant      | > threshold → org_admin        |
| `wallet.adjust.manual`        | branch | dual     | accountant+branch_mgr   | reason mandatory               |
| `wallet.view`                 | branch | none     | reception, finance      | own patient only for clinical  |
| `wallet.statement.export`     | branch | single   | accountant              | —                              |

---

## 17. Payments

| Permission                    | Scope  | Approval | P                       | Notes                                  |
| ----------------------------- | ------ | -------- | ----------------------- | -------------------------------------- |
| `payments.record.cash`        | branch | none     | cashier                 | shift-scoped                           |
| `payments.record.card`        | branch | none     | cashier                 | terminal ref required                  |
| `payments.record.transfer`    | branch | single   | accountant              | bank confirmation                      |
| `payments.void`               | branch | dual     | cashier+branch_mgr      | same-day only; after → refund path     |
| `payments.refund`             | branch | dual     | accountant+branch_mgr   | > threshold → org_admin                |
| `payments.reallocate`         | branch | single   | accountant              | between invoices                       |
| `payments.view`               | branch | none     | finance, reception      | —                                      |

---

## 18. Insurance

| Permission                    | Scope  | Approval | P                       | Notes                                  |
| ----------------------------- | ------ | -------- | ----------------------- | -------------------------------------- |
| `insurance.eligibility.check` | branch | none     | reception, billing      | —                                      |
| `insurance.claim.create`      | branch | none     | billing_specialist      | —                                      |
| `insurance.claim.submit`      | branch | single   | billing_specialist      | mgr approves > threshold               |
| `insurance.claim.appeal`      | branch | single   | billing_specialist      | —                                      |
| `insurance.contract.manage`   | global | dual     | accountant+org_admin    | —                                      |
| `insurance.writeoff`          | branch | dual     | accountant+branch_mgr   | > threshold → org_admin                |

---

## 19. Billing / Invoices

| Permission                    | Scope  | Approval | P                       | Notes                                  |
| ----------------------------- | ------ | -------- | ----------------------- | -------------------------------------- |
| `invoices.draft`              | branch | none     | reception, billing      | —                                      |
| `invoices.finalize`           | branch | none     | billing_specialist      | terminal — no edits after              |
| `invoices.discount.apply.tier1`| branch| single   | billing_specialist      | manager approves ≤ X%                  |
| `invoices.discount.apply.tier2`| branch| dual     | branch_mgr+accountant   | > X% ≤ Y%                              |
| `invoices.discount.apply.tier3`| global| dual     | org_admin+accountant    | > Y%                                   |
| `invoices.void`               | branch | dual     | billing+branch_mgr      | same-day; else credit-note only        |
| `invoices.credit_note`        | branch | single   | accountant              | —                                      |
| `invoices.reissue`            | branch | single   | billing_specialist      | linked to voided original              |
| `invoices.view`               | branch | none     | finance, reception      | patient sees own via portal            |
| `invoices.export`             | branch | single   | accountant              | cross-branch → org_admin               |

**SoD:** `billing_specialist+cashier` blocked. Invoice creator ≠ payment collector for same invoice above threshold.

---

## 20. HR

| Permission                    | Scope  | Approval | P                    | Notes                              |
| ----------------------------- | ------ | -------- | -------------------- | ---------------------------------- |
| `hr.staff.create`             | branch | single   | hr_officer           | org_admin approves clinical hires  |
| `hr.staff.update.profile`     | branch | none     | hr_officer, self(own)| self-service limited fields        |
| `hr.staff.terminate`          | branch | dual     | hr_officer+branch_mgr| revocation triggers cascade        |
| `hr.roles.assign`             | global | dual+SoD | hr_officer+org_admin | SoD guard runs pre-commit          |
| `hr.credentials.verify`       | global | single   | hr_officer           | license expiry blocks clinical acts|
| `hr.contract.manage`          | global | dual     | hr_officer+org_admin | —                                  |
| `hr.view.sensitive`           | global | none     | hr_officer, auditor  | salary hidden from branch_mgr      |

---

## 21. Payroll

| Permission                    | Scope  | Approval | P                       | Notes                              |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------------- |
| `payroll.run.calculate`       | global | none     | payroll_officer         | —                                  |
| `payroll.run.approve`         | global | dual     | payroll_officer+org_adm | —                                  |
| `payroll.run.disburse`        | global | dual     | accountant+org_admin    | after approval only                |
| `payroll.adjust.oneoff`       | branch | dual     | payroll_officer+hr_off  | attached reason + evidence         |
| `payroll.view.own`            | own    | none     | any staff               | self only                          |
| `payroll.view.all`            | global | none     | payroll_officer, auditor| org_admin excluded unless BG       |

**SoD:** `payroll_officer+hr_officer` blocked; `payroll_officer+accountant` blocked for the disburse step.

---

## 22. Attendance

| Permission                    | Scope  | Approval | P                       | Notes                              |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------------- |
| `attendance.punch`            | own    | none     | any staff               | geo/biometric guard                |
| `attendance.correct`          | branch | single   | branch_manager          | flagged for payroll review         |
| `attendance.override`         | branch | dual     | branch_mgr+hr_officer   | manual entries                     |
| `attendance.view.team`        | branch | none     | branch_manager, hr      | —                                  |
| `attendance.export`           | branch | single   | hr_officer              | —                                  |

---

## 23. Leave

| Permission                    | Scope  | Approval | P                       | Notes                              |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------------- |
| `leave.request`               | own    | none     | any staff               | —                                  |
| `leave.approve.tier1`         | branch | single   | branch_manager          | ≤ N days                           |
| `leave.approve.tier2`         | global | dual     | branch_mgr+hr_officer   | > N days                           |
| `leave.cancel`                | own    | none     | requester (before start)| after start → hr                   |
| `leave.balance.adjust`        | global | dual     | hr_officer+org_admin    | —                                  |

---

## 24. Performance

| Permission                    | Scope  | Approval | P                       | Notes                              |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------------- |
| `performance.review.draft`    | branch | none     | branch_manager          | —                                  |
| `performance.review.sign`     | branch | dual     | branch_mgr+reviewee     | reviewee ack required              |
| `performance.bonus.recommend` | branch | single   | branch_manager          | —                                  |
| `performance.bonus.approve`   | global | dual     | hr_officer+org_admin    | pay linkage                        |
| `performance.view.own`        | own    | none     | reviewee                | —                                  |

---

## 25. Documents

| Permission                    | Scope    | Approval | P                       | Notes                              |
| ----------------------------- | -------- | -------- | ----------------------- | ---------------------------------- |
| `documents.upload.clinical`   | assigned | none     | clinical staff          | phi audit                          |
| `documents.upload.admin`      | branch   | none     | reception, hr           | —                                  |
| `documents.delete`            | branch   | dual     | uploader+branch_mgr     | soft only; hard = org_admin        |
| `documents.view.clinical`     | assigned | none     | care team               | phi audit; BG for cross            |
| `documents.export`            | assigned | single   | clinician + mgr         | watermark applied                  |

---

## 26. Notifications & Communication

| Permission                    | Scope  | Approval | P                       | Notes                              |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------------- |
| `comms.template.manage`       | global | single   | org_admin               | legal review flag                  |
| `comms.broadcast.patient`     | branch | dual     | branch_mgr+org_admin    | consent filter enforced            |
| `comms.send.transactional`    | branch | none     | any staff w/ context    | rate-limited                       |
| `comms.optout.override`       | global | BG       | org_admin (BG)          | regulatory                         |
| `comms.log.view`              | branch | none     | mgr, auditor            | —                                  |

---

## 27. Reports

Split by data class — no generic `reports.view`:

| Permission                    | Scope  | P                                | Notes                          |
| ----------------------------- | ------ | -------------------------------- | ------------------------------ |
| `reports.operational.view`    | branch | branch_manager, org_admin        | —                              |
| `reports.clinical.view`       | branch | doctor(agg), org_admin, auditor  | patient-level = phi audit      |
| `reports.finance.view`        | branch | accountant, org_admin            | —                              |
| `reports.hr.view`             | global | hr_officer, org_admin, auditor   | —                              |
| `reports.inventory.view`      | branch | pharmacist, mgr, accountant      | —                              |
| `reports.*.export`            | scope  | matching viewer + single approval| watermarked                    |
| `reports.crossbranch.view`    | global | org_admin, auditor               | —                              |

---

## 28. Audit

| Permission                    | Scope  | P             | Notes                                    |
| ----------------------------- | ------ | ------------- | ---------------------------------------- |
| `audit.log.view`              | global | auditor       | read-only; append-only underlying store  |
| `audit.log.export`            | global | auditor       | signed export                            |
| `audit.breakglass.review`     | global | auditor       | weekly SLA                               |
| `audit.sod.violations.view`   | global | auditor, org_admin | —                                   |

**Immutable:** no role can write, edit, or delete audit rows. Retention enforced by DB, not app.

---

## 29. Administration

| Permission                    | Scope  | Approval | P                       | Notes                              |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------------- |
| `admin.branch.create`         | global | dual     | org_admin+super_admin   | —                                  |
| `admin.branch.update`         | global | single   | org_admin               | —                                  |
| `admin.branch.close`          | global | dual     | org_admin+super_admin   | data retention plan required       |
| `admin.feature_flag.toggle`   | global | single   | super_admin             | —                                  |
| `admin.impersonate`           | global | BG       | super_admin (BG)        | time-boxed; auditor-notified       |

---

## 30. Security

| Permission                    | Scope  | Approval | P                       | Notes                              |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------------- |
| `security.role.define`        | global | dual     | super_admin+auditor     | schema change control              |
| `security.permission.define`  | global | dual     | super_admin+auditor     | registry change                    |
| `security.bundle.assign`      | global | single   | org_admin               | SoD guard                          |
| `security.session.revoke`     | global | single   | org_admin, super_admin  | —                                  |
| `security.mfa.reset`          | global | single   | org_admin (own branch), super_admin | evidence required      |
| `security.breakglass.grant`   | global | dual     | org_admin+super_admin   | time-boxed; auto-revoke            |

---

## 31. Settings

| Permission                    | Scope  | Approval | P                       | Notes                              |
| ----------------------------- | ------ | -------- | ----------------------- | ---------------------------------- |
| `settings.org.update`         | global | dual     | org_admin+super_admin   | —                                  |
| `settings.branch.update`      | branch | single   | branch_manager          | financial fields → accountant      |
| `settings.pricing.update`     | global | dual     | accountant+org_admin    | —                                  |
| `settings.catalog.update`     | global | single   | org_admin               | clinical catalog → medical director|
| `settings.integrations.manage`| global | dual     | super_admin+org_admin   | secrets excluded                   |

---

## 32. Removed / Merged / Split (delta vs legacy)

**Removed (dead or dangerous):**
- `*.edit` blanket ops — replaced by field-scoped verbs.
- `patients.delete` (soft) — replaced by `patients.archive`.
- `reports.view` — split by data class.
- `settings.all` — never existed as first-class; removed from any bundle carrying it.
- `admin.superuser` shortcut — replaced by explicit `admin.impersonate` + BG.

**Merged:**
- Six variants of `appointments.cancel.*` → `appointments.cancel.soft` + `appointments.cancel.late_fee_waive`.
- `hr.staff.view.*` (three variants) → `hr.view.sensitive` + `hr.staff.update.profile` (own).

**Split (SoD-critical):**
- `patients.update` → `patients.demographics.update` + `patients.clinical_flags.update`.
- `invoices.discount` → three tiers.
- `payroll.run` → calculate / approve / disburse.
- `treasury.close` → close + adjust (separated actors).
- `medical_records.edit` → amend (own+24h) / correct.late (dual) / unlock (BG).

---

## 33. Global Cross-Cutting Rules (binding on all modules)

1. **Branch isolation is default.** `scope=global` must be explicit on the permission row.
2. **Ownership is enforced by RLS**, not by UI. `scope=own|assigned` implies the resolver joins to `staff_id` / assignment table.
3. **Approval is a permission-level metadata**, not a role. Any `approval=dual` op requires a second actor of a different role, verified server-side.
4. **Break-glass** is always time-boxed (≤ 4h), always PHI-audited, always reviewed by `auditor` within 7 days.
5. **Immutable audit** applies to every clinical mutation, every financial mutation ≥ threshold, every role/permission change, every BG use.
6. **SoD guard** runs on `security.bundle.assign` and `hr.roles.assign`. Toxic pairs (§0) are hard-blocked at DB level.
7. **License gate:** clinical `perform`/`sign` permissions are disabled when `hr.credentials` shows expired license.
8. **No permission is granted to `super_admin` implicitly** — bundle assignment is explicit and audited.
9. **Exports are never free.** Every `*.export` requires either `single` or `dual` approval and produces a watermarked, logged artifact.
10. **State-guarded permissions** (appointments, invoices, medical_records) are enforced by DB trigger, not RLS alone.

---

## 34. Final Permission Registry (flat list)

The complete set to seed `permissions` and drive R5 batches. 118 permissions total.

```
patients.register
patients.demographics.update
patients.clinical_flags.update
patients.merge
patients.archive
patients.delete.hard
patients.phi.view
patients.phi.view.crossbranch
patients.export
appointments.book
appointments.reschedule
appointments.cancel.soft
appointments.cancel.late_fee_waive
appointments.checkin
appointments.status.transition
appointments.override.doublebook
appointments.crossbranch.view
appointments.export
medical_records.create
medical_records.amend
medical_records.correct.late
medical_records.sign
medical_records.unlock
medical_records.view
medical_records.view.breakglass
medical_records.export
lab.order.create
lab.order.cancel
lab.sample.collect
lab.result.enter
lab.result.validate
lab.result.release
lab.result.amend
lab.critical.notify
lab.view
radiology.order.create
radiology.order.dual
radiology.study.perform
radiology.report.draft
radiology.report.sign
radiology.image.view
radiology.export
pharmacy.dispense
pharmacy.controlled.dispense
pharmacy.substitute
pharmacy.return
pharmacy.stock.adjust
pharmacy.view
dental.chart.update
dental.treatment_plan.create
dental.treatment_plan.approve.financial
physio.case.open
physio.session.log
physio.plan.amend
physio.discharge
procedures.schedule
procedures.consent.capture
procedures.perform
procedures.high_risk.perform
procedures.abort
prescriptions.create
prescriptions.controlled.create
prescriptions.amend
prescriptions.cancel
prescriptions.refill.authorize
prescriptions.view
inventory.item.create
inventory.item.update
inventory.stock.receive
inventory.stock.adjust
inventory.stock.transfer
inventory.write_off
inventory.view
inventory.export
po.draft
po.submit
po.approve.tier1
po.approve.tier2
po.receive
po.close
po.cancel
suppliers.create
suppliers.bank.update
suppliers.contract.attach
suppliers.view
treasury.shift.open
treasury.shift.close
treasury.transfer
treasury.adjust
treasury.view
treasury.export
wallet.topup
wallet.refund
wallet.adjust.manual
wallet.view
wallet.statement.export
payments.record.cash
payments.record.card
payments.record.transfer
payments.void
payments.refund
payments.reallocate
payments.view
insurance.eligibility.check
insurance.claim.create
insurance.claim.submit
insurance.claim.appeal
insurance.contract.manage
insurance.writeoff
invoices.draft
invoices.finalize
invoices.discount.apply.tier1
invoices.discount.apply.tier2
invoices.discount.apply.tier3
invoices.void
invoices.credit_note
invoices.reissue
invoices.view
invoices.export
hr.staff.create
hr.staff.update.profile
hr.staff.terminate
hr.roles.assign
hr.credentials.verify
hr.contract.manage
hr.view.sensitive
payroll.run.calculate
payroll.run.approve
payroll.run.disburse
payroll.adjust.oneoff
payroll.view.own
payroll.view.all
attendance.punch
attendance.correct
attendance.override
attendance.view.team
attendance.export
leave.request
leave.approve.tier1
leave.approve.tier2
leave.cancel
leave.balance.adjust
performance.review.draft
performance.review.sign
performance.bonus.recommend
performance.bonus.approve
performance.view.own
documents.upload.clinical
documents.upload.admin
documents.delete
documents.view.clinical
documents.export
comms.template.manage
comms.broadcast.patient
comms.send.transactional
comms.optout.override
comms.log.view
reports.operational.view
reports.clinical.view
reports.finance.view
reports.hr.view
reports.inventory.view
reports.operational.export
reports.clinical.export
reports.finance.export
reports.hr.export
reports.inventory.export
reports.crossbranch.view
audit.log.view
audit.log.export
audit.breakglass.review
audit.sod.violations.view
admin.branch.create
admin.branch.update
admin.branch.close
admin.feature_flag.toggle
admin.impersonate
security.role.define
security.permission.define
security.bundle.assign
security.session.revoke
security.mfa.reset
security.breakglass.grant
settings.org.update
settings.branch.update
settings.pricing.update
settings.catalog.update
settings.integrations.manage
```

---

## 35. Implementation Handoff

This document is the sole input for:

1. Seeding/replacing the `permissions` registry.
2. Regenerating `role_bundles` (roles → permission sets derived directly from the P/A/R/V/X columns above).
3. Authoring R5 RLS batches — each batch corresponds to one module (§1–§31).
4. Configuring the SoD guard (§0 toxic combinations).
5. Configuring approval workflow tables (`approval=single|dual`).
6. Configuring the break-glass service (`approval=break_glass`).
7. Configuring immutable-audit triggers (`audit=immutable|phi_access`).

Any deviation from this spec during implementation requires an explicit amendment to this file — no side documents, no ad-hoc exceptions.

**END OF SPECIFICATION.**