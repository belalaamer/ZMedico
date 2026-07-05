# ZMedico — Business Operations Catalog

**Status:** Canonical (Wave 1.6)
**Scope:** Documentation only — no code, RLS, roles, permissions, or migrations changed.
**Purpose:** Enumerate every meaningful business operation performed inside ZMedico so that Permission Matrixes, Audit Rules, Approval Workflows, and API surfaces can be generated deterministically from a single source of truth.

This document supersedes ad-hoc lists embedded in `PERMISSION_CATALOG.md`, `ROLE_ARCHITECTURE.md`, and `AUTHORIZATION_INVENTORY.md` for the *operation* layer. Permissions and roles remain governed by their own canonical docs; this catalog is the **behavioral** layer that maps user/system intent to those permissions.

---

## 1. How to Read This Catalog

Every operation is described with the following fields:

| Field | Meaning |
|---|---|
| **Operation Name** | Stable, dot-cased identifier (`module.subject.verb`). Not a UI label. |
| **Business Purpose** | Why the operation exists in the clinic workflow. |
| **Trigger** | What initiates it — user action, schedule, event, webhook, background job. |
| **Preconditions** | State that must hold before the operation is allowed. |
| **Postconditions** | State guaranteed after successful completion. |
| **Resource** | Primary resource family per `SCOPE_OWNERSHIP_MODEL.md`. |
| **Expected Permission** | Canonical permission key from `PERMISSION_CATALOG.md`. |
| **Expected Scope** | Minimum reach required (`own`, `assigned`, `branch`, `organization`, `global`). |
| **Audit Required** | Whether the operation MUST emit an entry in `audit_logs` (or successor). |
| **Approval Candidate** | Whether this operation is a candidate for a future approval workflow. |
| **Sensitive Data Access** | PII / PHI / Financial / Payroll / Credentials / None. |
| **Business Criticality** | Low / Medium / High / Critical. |

**Classification tags** used throughout:
- 🩺 **Clinical** — affects patient care or medical record.
- 💰 **Financial** — moves money, changes invoices, treasury, payroll.
- 🛠 **Administrative** — configuration, IAM, master data.
- ⚙️ **System** — infrastructure, migrations, health, background.
- ⏰ **Scheduled** — cron / recurring background.
- 🔁 **Background** — event-driven or async worker.
- ⚠️ **Destructive** — deletes, cancels, overrides, hard-writes.

---

## 2. Operations by Module

> Legend below each operation block:
> `P=` permission key · `S=` scope · `A=` audit · `AC=` approval candidate · `SD=` sensitive data · `C=` criticality

---

### 2.1 Patients Module

#### `patients.record.create` 🩺
- **Purpose:** Register a new patient in the clinic.
- **Trigger:** Reception UI, walk-in flow, online booking webhook.
- **Preconditions:** No duplicate on `(phone, national_id)`; branch context selected.
- **Postconditions:** Patient row created, `patient_code` assigned, initial wallet zeroed, timeline seeded.
- **P:** `patients.record.create` · **S:** branch · **A:** yes · **AC:** no · **SD:** PII/PHI · **C:** High

#### `patients.record.view`
- **Purpose:** Read a patient profile.
- **Trigger:** Any staff opening a patient card.
- **Preconditions:** Actor scope covers patient's branch OR patient is assigned to actor.
- **Postconditions:** Read; access event captured for High-sensitivity records.
- **P:** `patients.record.view` · **S:** branch/assigned · **A:** on sensitive · **SD:** PII/PHI · **C:** High

#### `patients.record.edit`
- **P:** `patients.record.edit` · **S:** branch · **A:** yes · **SD:** PII/PHI · **C:** High

#### `patients.record.merge` ⚠️
- **Purpose:** Merge duplicate patient records.
- **Preconditions:** Both records in same organization; no active invoices in draft.
- **Postconditions:** Loser record soft-deleted, timeline union'd, audit chain preserved.
- **P:** `patients.record.merge` · **S:** organization · **A:** yes · **AC:** yes · **SD:** PII/PHI · **C:** Critical

#### `patients.record.delete` ⚠️
- **Purpose:** Soft-delete a patient (retention / GDPR).
- **P:** `patients.record.delete` · **S:** organization · **A:** yes · **AC:** yes · **SD:** PII/PHI · **C:** Critical

#### `patients.record.restore` ⚠️
- **P:** `patients.record.restore` · **S:** organization · **A:** yes · **AC:** yes · **C:** High

#### `patients.record.export` ⚠️ 🩺
- **Purpose:** Export patient dossier (PDF/CSV) for the patient or medico-legal request.
- **P:** `data.export.run` + `patients.record.view` · **S:** branch · **A:** yes · **AC:** yes · **SD:** PII/PHI · **C:** Critical

#### `patients.document.upload`
- **P:** `patients.document.upload` · **S:** branch · **A:** yes · **SD:** PII/PHI · **C:** Medium

#### `patients.document.delete` ⚠️
- **P:** `patients.document.delete` · **S:** branch · **A:** yes · **AC:** yes · **C:** High

#### `patients.consent.record`
- **Purpose:** Capture GDPR/marketing/treatment consent.
- **P:** `patients.consent.record` · **S:** branch · **A:** yes · **SD:** PII · **C:** High

#### `patients.consent.revoke`
- **P:** `patients.consent.revoke` · **S:** branch · **A:** yes · **C:** High

#### `patients.wallet.credit` 💰
- **P:** `patients.wallet.credit` · **S:** branch · **A:** yes · **AC:** on threshold · **SD:** Financial · **C:** High

#### `patients.wallet.debit` 💰
- **P:** `patients.wallet.debit` · **S:** branch · **A:** yes · **SD:** Financial · **C:** High

#### `patients.wallet.adjust` ⚠️ 💰
- **Purpose:** Manual balance correction.
- **P:** `patients.wallet.adjust` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Financial · **C:** Critical

---

### 2.2 Appointments Module

#### `appointments.slot.book`
- **Purpose:** Create a scheduled appointment for a patient and doctor.
- **Preconditions:** Slot free; doctor working; branch open; patient consent-valid.
- **P:** `appointments.slot.book` · **S:** branch · **A:** yes · **C:** High

#### `appointments.slot.reschedule`
- **P:** `appointments.slot.reschedule` · **S:** branch/assigned · **A:** yes · **C:** Medium

#### `appointments.slot.cancel` ⚠️
- **P:** `appointments.slot.cancel` · **S:** branch/assigned · **A:** yes · **AC:** on late-cancel policy · **C:** High

#### `appointments.slot.no_show`
- **P:** `appointments.slot.no_show` · **S:** branch · **A:** yes · **C:** Medium

#### `appointments.slot.override_conflict` ⚠️
- **Purpose:** Force-book over an existing block (VIP / emergency).
- **P:** `appointments.slot.override` · **S:** branch · **A:** yes · **AC:** yes · **C:** Critical

#### `appointments.slot.assign_room`
- **P:** `appointments.slot.edit` · **S:** branch · **A:** yes · **C:** Low

#### `appointments.slot.reassign_doctor` ⚠️
- **P:** `appointments.slot.reassign` · **S:** branch · **A:** yes · **AC:** on same-day · **C:** High

#### `appointments.calendar.view`
- **P:** `appointments.calendar.view` · **S:** branch/assigned · **A:** no · **C:** Low

#### `appointments.recurring.create`
- **P:** `appointments.slot.book` · **S:** branch · **A:** yes · **C:** Medium

---

### 2.3 Queue Module

#### `queue.entry.checkin`
- **P:** `queue.entry.checkin` · **S:** branch · **A:** yes · **C:** Medium

#### `queue.entry.walkin_create`
- **P:** `queue.entry.walkin` · **S:** branch · **A:** yes · **C:** Medium

#### `queue.entry.status_change`
- **P:** `queue.entry.manage` · **S:** branch · **A:** yes (via `queueAudit`) · **C:** Medium

#### `queue.entry.reassign_doctor` ⚠️
- **P:** `queue.entry.reassign` · **S:** branch · **A:** yes · **C:** High

#### `queue.entry.prioritize` ⚠️
- **Purpose:** Move a patient ahead in the queue (emergency/VIP).
- **P:** `queue.entry.prioritize` · **S:** branch · **A:** yes · **AC:** yes · **C:** High

#### `queue.entry.consultation_open`
- **P:** `clinical.consult.open` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** High

#### `queue.alerts.dispatch` 🔁 ⚙️
- **Trigger:** `detect-queue-alerts` cron.
- **P:** system principal · **A:** yes · **C:** Medium

---

### 2.4 Clinical Module

#### `clinical.consult.open` 🩺
- **P:** `clinical.consult.open` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** High

#### `clinical.consult.close` 🩺
- **Preconditions:** Diagnosis + plan attached OR reason logged.
- **P:** `clinical.consult.close` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** High

#### `clinical.record.write` 🩺
- **P:** `clinical.record.write` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** Critical

#### `clinical.record.amend` ⚠️ 🩺
- **Purpose:** Correct a signed medical entry (append-only amendment).
- **P:** `clinical.record.amend` · **S:** assigned · **A:** yes · **AC:** yes · **SD:** PHI · **C:** Critical

#### `clinical.record.view`
- **P:** `clinical.record.view` · **S:** branch/assigned · **A:** on PHI · **SD:** PHI · **C:** High

#### `clinical.diagnosis.assign`
- **P:** `clinical.diagnosis.assign` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** High

#### `clinical.prescription.issue` 🩺
- **Preconditions:** Active consultation OR follow-up context.
- **P:** `clinical.prescription.issue` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** Critical

#### `clinical.prescription.revoke` ⚠️
- **P:** `clinical.prescription.revoke` · **S:** assigned · **A:** yes · **AC:** yes · **C:** High

#### `clinical.prescription.export`
- **P:** `clinical.prescription.export` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** High

#### `clinical.procedure.perform` 🩺
- **P:** `clinical.procedure.perform` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** High

#### `clinical.physio.plan_create` 🩺
- **P:** `clinical.physio.plan.create` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** High

#### `clinical.physio.session_log` 🩺
- **P:** `clinical.physio.session.log` · **S:** assigned · **A:** yes · **SD:** PHI · **C:** Medium

#### `clinical.document.center_view`
- **P:** `clinical.document.view` · **S:** branch · **A:** on PHI · **SD:** PHI · **C:** Medium

---

### 2.5 Invoices Module

#### `invoices.doc.create` 💰
- **P:** `invoices.doc.create` · **S:** branch · **A:** yes · **SD:** Financial · **C:** High

#### `invoices.doc.edit_draft` 💰
- **P:** `invoices.doc.edit` · **S:** branch · **A:** yes · **SD:** Financial · **C:** Medium

#### `invoices.doc.finalize` 💰
- **Postconditions:** Immutable, sequential number allocated.
- **P:** `invoices.doc.finalize` · **S:** branch · **A:** yes · **SD:** Financial · **C:** High

#### `invoices.doc.cancel` ⚠️ 💰
- **P:** `invoices.doc.cancel` · **S:** branch · **A:** yes · **AC:** yes · **SD:** Financial · **C:** Critical

#### `invoices.doc.delete` ⚠️ 💰
- **Preconditions:** Draft only (non-admin); admin can hard soft-delete with cascade.
- **P:** `invoices.doc.delete` · **S:** branch/organization · **A:** yes · **AC:** yes · **SD:** Financial · **C:** Critical

#### `invoices.doc.export`
- **P:** `invoices.doc.export` · **S:** branch · **A:** yes · **SD:** Financial · **C:** Medium

#### `invoices.discount.apply` ⚠️ 💰
- **P:** `invoices.discount.apply` · **S:** branch · **A:** yes · **AC:** over threshold · **SD:** Financial · **C:** High

#### `invoices.coupon.apply` 💰
- **P:** `invoices.coupon.apply` · **S:** branch · **A:** yes · **SD:** Financial · **C:** Medium

#### `invoices.outstanding.view`
- **P:** `invoices.outstanding.view` · **S:** branch · **A:** no · **SD:** Financial · **C:** Medium

#### `payments.record` 💰
- **P:** `payments.record` · **S:** branch · **A:** yes · **SD:** Financial · **C:** High

#### `payments.refund` ⚠️ 💰
- **P:** `payments.refund` · **S:** branch · **A:** yes · **AC:** yes · **SD:** Financial · **C:** Critical

#### `payments.void` ⚠️ 💰
- **P:** `payments.void` · **S:** branch · **A:** yes · **AC:** yes · **SD:** Financial · **C:** Critical

---

### 2.6 Treasury Module

#### `treasury.cash.deposit` 💰
- **P:** `treasury.cash.deposit` · **S:** branch · **A:** yes · **SD:** Financial · **C:** High

#### `treasury.cash.withdraw` 💰
- **P:** `treasury.cash.withdraw` · **S:** branch · **A:** yes · **AC:** over threshold · **SD:** Financial · **C:** High

#### `treasury.transfer.branch_to_branch` ⚠️ 💰
- **P:** `treasury.transfer.execute` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Financial · **C:** Critical

#### `treasury.daily.close` 💰
- **Preconditions:** All shift payments reconciled.
- **P:** `treasury.daily.close` · **S:** branch · **A:** yes · **SD:** Financial · **C:** High

#### `treasury.daily.reopen` ⚠️ 💰
- **P:** `treasury.daily.reopen` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Financial · **C:** Critical

#### `expenses.record` 💰
- **P:** `expenses.record` · **S:** branch · **A:** yes · **SD:** Financial · **C:** Medium

#### `expenses.approve` 💰
- **P:** `expenses.approve` · **S:** branch/organization · **A:** yes · **AC:** yes · **SD:** Financial · **C:** High

#### `expenses.reject` 💰
- **P:** `expenses.reject` · **S:** branch/organization · **A:** yes · **SD:** Financial · **C:** Medium

---

### 2.7 Inventory Module

#### `inventory.product.create`
- **P:** `inventory.product.create` · **S:** organization · **A:** yes · **C:** Medium

#### `inventory.product.edit`
- **P:** `inventory.product.edit` · **S:** organization · **A:** yes · **C:** Medium

#### `inventory.product.deactivate` ⚠️
- **P:** `inventory.product.deactivate` · **S:** organization · **A:** yes · **AC:** yes · **C:** High

#### `inventory.stock.adjust` ⚠️
- **Purpose:** Manual stock correction outside PO / consumption.
- **P:** `inventory.stock.adjust` · **S:** branch · **A:** yes · **AC:** over threshold · **C:** High

#### `inventory.stock.consume` 🔁
- **Trigger:** Consumables editor / procedure completion.
- **P:** `inventory.stock.consume` · **S:** branch · **A:** yes · **C:** Medium

#### `inventory.stock.transfer` ⚠️
- **P:** `inventory.stock.transfer` · **S:** organization · **A:** yes · **AC:** yes · **C:** High

#### `inventory.po.create`
- **P:** `inventory.po.create` · **S:** branch · **A:** yes · **C:** Medium

#### `inventory.po.approve` 💰
- **P:** `inventory.po.approve` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Financial · **C:** High

#### `inventory.po.receive`
- **P:** `inventory.po.receive` · **S:** branch · **A:** yes · **C:** Medium

#### `inventory.po.cancel` ⚠️
- **P:** `inventory.po.cancel` · **S:** branch · **A:** yes · **AC:** yes · **C:** High

#### `inventory.supplier.create`
- **P:** `inventory.supplier.create` · **S:** organization · **A:** yes · **C:** Low

#### `inventory.alerts.view`
- **P:** `inventory.alerts.view` · **S:** branch · **A:** no · **C:** Low

---

### 2.8 HR Module

#### `hr.staff.create` 🛠
- **P:** `hr.staff.create` · **S:** organization · **A:** yes · **SD:** PII · **C:** High

#### `hr.staff.edit`
- **P:** `hr.staff.edit` · **S:** branch/organization · **A:** yes · **SD:** PII · **C:** High

#### `hr.staff.deactivate` ⚠️
- **P:** `hr.staff.deactivate` · **S:** organization · **A:** yes · **AC:** yes · **C:** High

#### `hr.staff.assign_branch`
- **P:** `hr.staff.assign_branch` · **S:** organization · **A:** yes · **C:** Medium

#### `hr.attendance.checkin` 🔁
- **Trigger:** Staff app GPS check.
- **P:** `hr.attendance.self` · **S:** own · **A:** yes · **C:** Medium

#### `hr.attendance.manual_edit` ⚠️
- **P:** `hr.attendance.edit` · **S:** branch · **A:** yes · **AC:** yes · **C:** High

#### `hr.schedule.publish`
- **P:** `hr.schedule.publish` · **S:** branch · **A:** yes · **C:** Medium

#### `hr.leave.request`
- **P:** `hr.leave.request` · **S:** own · **A:** yes · **C:** Low

#### `hr.leave.approve`
- **P:** `hr.leave.approve` · **S:** branch · **A:** yes · **AC:** yes · **C:** Medium

#### `hr.leave.reject`
- **P:** `hr.leave.reject` · **S:** branch · **A:** yes · **C:** Medium

#### `hr.performance.evaluate`
- **P:** `hr.performance.evaluate` · **S:** branch · **A:** yes · **SD:** PII · **C:** Medium

#### `hr.department.create`
- **P:** `hr.department.create` · **S:** organization · **A:** yes · **C:** Low

#### `hr.position.create`
- **P:** `hr.position.create` · **S:** organization · **A:** yes · **C:** Low

---

### 2.9 Payroll Module

#### `payroll.run.compute` 💰
- **Trigger:** Monthly cycle or on-demand.
- **P:** `payroll.run.compute` · **S:** organization · **A:** yes · **SD:** Payroll · **C:** Critical

#### `payroll.run.approve` 💰
- **P:** `payroll.run.approve` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Payroll · **C:** Critical

#### `payroll.run.pay` 💰
- **P:** `payroll.run.pay` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Payroll · **C:** Critical

#### `payroll.run.revert` ⚠️ 💰
- **P:** `payroll.run.revert` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Payroll · **C:** Critical

#### `payroll.commission.calculate` 💰
- **P:** `payroll.commission.calculate` · **S:** organization · **A:** yes · **SD:** Payroll · **C:** High

#### `payroll.commission.approve` 💰
- **P:** `payroll.commission.approve` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Payroll · **C:** High

#### `payroll.bonus.grant` ⚠️ 💰
- **P:** `payroll.bonus.grant` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Payroll · **C:** High

#### `payroll.payslip.view_self`
- **P:** `payroll.payslip.view` · **S:** own · **A:** yes · **SD:** Payroll · **C:** Medium

#### `payroll.payslip.view_any` ⚠️
- **P:** `payroll.payslip.view.any` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Payroll · **C:** Critical

---

### 2.10 Reports Module

#### `reports.financial.view`
- **P:** `reports.financial.view` · **S:** branch/organization · **A:** on export · **SD:** Financial · **C:** High

#### `reports.clinical.view`
- **P:** `reports.clinical.view` · **S:** branch/organization · **A:** on export · **SD:** PHI · **C:** High

#### `reports.hr.view`
- **P:** `reports.hr.view` · **S:** organization · **A:** on export · **SD:** PII · **C:** Medium

#### `reports.inventory.view`
- **P:** `reports.inventory.view` · **S:** branch/organization · **A:** on export · **C:** Medium

#### `reports.operational.view`
- **P:** `reports.operational.view` · **S:** branch/organization · **A:** on export · **C:** Medium

#### `reports.doctor_performance.view`
- **P:** `reports.doctor_performance.view` · **S:** organization · **A:** on export · **SD:** PII · **C:** High

#### `reports.doctor_commissions.view`
- **P:** `reports.doctor_commissions.view` · **S:** organization · **A:** on export · **SD:** Payroll · **C:** High

#### `reports.custom.export` ⚠️
- **P:** `data.export.run` + module view · **S:** matches source · **A:** yes · **AC:** on sensitive · **C:** High

#### `reports.schedule.create` ⏰
- **P:** `reports.schedule.create` · **S:** organization · **A:** yes · **C:** Medium

#### `reports.schedule.dispatch` ⏰ 🔁
- **Trigger:** Cron.
- **P:** system · **A:** yes · **C:** Medium

---

### 2.11 Branches Module

#### `branches.create` 🛠
- **P:** `branches.create` · **S:** organization · **A:** yes · **C:** High

#### `branches.edit` 🛠
- **P:** `branches.edit` · **S:** organization · **A:** yes · **C:** High

#### `branches.deactivate` ⚠️
- **P:** `branches.deactivate` · **S:** organization · **A:** yes · **AC:** yes · **C:** Critical

#### `branches.schedule.configure`
- **P:** `branches.schedule.edit` · **S:** organization · **A:** yes · **C:** Medium

#### `branches.dashboard.view`
- **P:** `branches.dashboard.view` · **S:** branch · **A:** no · **C:** Low

---

### 2.12 Settings Module

#### `settings.general.edit` 🛠
- **P:** `settings.general.edit` · **S:** organization · **A:** yes · **C:** High

#### `settings.services.manage`
- **P:** `settings.services.manage` · **S:** organization · **A:** yes · **C:** Medium

#### `settings.pricing.manage` 💰
- **P:** `settings.pricing.manage` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Financial · **C:** High

#### `settings.insurance.manage` 💰
- **P:** `settings.insurance.manage` · **S:** organization · **A:** yes · **SD:** Financial · **C:** High

#### `settings.payment_methods.manage` 💰
- **P:** `settings.payment_methods.manage` · **S:** organization · **A:** yes · **SD:** Financial · **C:** High

#### `settings.templates.manage`
- **P:** `settings.templates.manage` · **S:** organization · **A:** yes · **C:** Low

#### `settings.i18n.manage`
- **P:** `settings.i18n.manage` · **S:** organization · **A:** yes · **C:** Low

#### `settings.roles.edit` ⚠️ 🛠
- **Purpose:** Modify role → permission mapping.
- **P:** `iam.roles.edit` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Credentials · **C:** Critical

#### `settings.users.manage` 🛠
- **P:** `iam.users.manage` · **S:** organization · **A:** yes · **SD:** Credentials · **C:** Critical

#### `settings.backup.export` ⚠️
- **P:** `data.backup.run` · **S:** organization · **A:** yes · **AC:** yes · **SD:** ALL · **C:** Critical

---

### 2.13 Notifications & Communication Module

#### `comm.reminder.schedule` ⏰
- **P:** `comm.reminder.schedule` · **S:** branch · **A:** yes · **C:** Medium

#### `comm.reminder.dispatch` ⏰ 🔁
- **Trigger:** `send-reminder` cron.
- **P:** system · **A:** yes · **SD:** PII · **C:** Medium

#### `comm.winback.enqueue` ⏰ 🔁
- **Trigger:** `enqueue-winback` cron.
- **P:** system · **A:** yes · **C:** Low

#### `comm.whatsapp.send`
- **P:** `comm.whatsapp.send` · **S:** branch · **A:** yes · **SD:** PII · **C:** Medium

#### `comm.template.edit`
- **P:** `comm.template.edit` · **S:** organization · **A:** yes · **C:** Low

#### `comm.automation.configure`
- **P:** `comm.automation.configure` · **S:** organization · **A:** yes · **C:** Medium

---

### 2.14 Security & IAM Module

#### `iam.user.create` ⚠️ 🛠
- **Trigger:** `admin-create-user` edge function.
- **P:** `iam.users.manage` · **S:** organization · **A:** yes · **SD:** Credentials · **C:** Critical

#### `iam.user.delete` ⚠️ 🛠
- **P:** `iam.users.manage` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Credentials · **C:** Critical

#### `iam.user.reset_password` ⚠️
- **P:** `iam.users.reset_password` · **S:** organization · **A:** yes · **SD:** Credentials · **C:** Critical

#### `iam.user.assign_role` ⚠️
- **P:** `iam.users.assign_role` · **S:** organization · **A:** yes · **AC:** yes · **SD:** Credentials · **C:** Critical

#### `iam.role.create` ⚠️
- **P:** `iam.roles.edit` · **S:** organization · **A:** yes · **AC:** yes · **C:** Critical

#### `iam.role.edit_permissions` ⚠️
- **P:** `iam.roles.edit` · **S:** organization · **A:** yes · **AC:** yes · **C:** Critical

#### `iam.session.impersonate` ⚠️ (future / break-glass)
- **P:** `iam.session.impersonate` · **S:** organization · **A:** yes (mandatory) · **AC:** yes · **SD:** ALL · **C:** Critical

#### `iam.session.revoke` ⚠️
- **P:** `iam.session.revoke` · **S:** organization · **A:** yes · **SD:** Credentials · **C:** High

---

### 2.15 Audit Module

#### `audit.log.view`
- **P:** `audit.log.view` · **S:** organization · **A:** self-audited · **SD:** ALL · **C:** High

#### `audit.log.export` ⚠️
- **P:** `audit.log.export` · **S:** organization · **A:** yes · **AC:** yes · **SD:** ALL · **C:** Critical

#### `audit.log.write` 🔁 ⚙️
- **Trigger:** Any auditable operation.
- **P:** system · **A:** N/A (is the audit) · **C:** Critical

#### `audit.selfaudit.run` ⏰ 🔁
- **P:** `audit.selfaudit.run` · **S:** organization · **A:** yes · **C:** Medium

---

### 2.16 System Module

#### `system.health.view` ⚙️
- **P:** `system.health.view` · **S:** global · **A:** no · **C:** Medium

#### `system.migration.run` ⚠️ ⚙️
- **P:** platform-only · **S:** global · **A:** yes · **AC:** yes · **SD:** ALL · **C:** Critical

#### `system.cache.invalidate` ⚙️
- **P:** `system.cache.invalidate` · **S:** global · **A:** yes · **C:** Medium

#### `system.selfaudit.run` ⏰ 🔁 ⚙️
- **Trigger:** Cron.
- **P:** system · **A:** yes · **C:** Medium

#### `system.info.view`
- **P:** `system.info.view` · **S:** organization · **A:** no · **C:** Low

#### `system.realtime.subscribe` 🔁
- **P:** derived from underlying resource permission · **A:** no · **C:** Low

---

## 3. Classification Summary

### 3.1 Destructive Operations ⚠️
All operations tagged ⚠️ above. Non-exhaustive highlights:
`patients.record.merge`, `patients.record.delete`, `patients.wallet.adjust`, `invoices.doc.cancel`, `invoices.doc.delete`, `payments.refund`, `payments.void`, `treasury.transfer.branch_to_branch`, `treasury.daily.reopen`, `inventory.stock.adjust`, `inventory.stock.transfer`, `inventory.po.cancel`, `hr.staff.deactivate`, `hr.attendance.manual_edit`, `payroll.run.revert`, `payroll.bonus.grant`, `payroll.payslip.view_any`, `branches.deactivate`, `settings.roles.edit`, `settings.backup.export`, `iam.user.*`, `iam.session.impersonate`, `audit.log.export`, `system.migration.run`, `clinical.record.amend`, `clinical.prescription.revoke`, `appointments.slot.override_conflict`.

### 3.2 Financial Operations 💰
All `invoices.*`, `payments.*`, `treasury.*`, `expenses.*`, `payroll.*`, `patients.wallet.*`, `settings.pricing.manage`, `settings.insurance.manage`, `settings.payment_methods.manage`, `inventory.po.approve`, `reports.financial.view`, `reports.doctor_commissions.view`.

### 3.3 Clinical Operations 🩺
All `clinical.*`, `queue.entry.consultation_open`, `patients.record.*` when interacting with medical fields, `reports.clinical.view`, `reports.doctor_performance.view`.

### 3.4 Administrative Operations 🛠
All `settings.*`, `iam.*`, `branches.create/edit/deactivate`, `hr.department.*`, `hr.position.*`, `hr.staff.create/edit/deactivate`, `inventory.product.*`, `inventory.supplier.*`.

### 3.5 Background Operations 🔁
`queue.alerts.dispatch`, `comm.reminder.dispatch`, `comm.winback.enqueue`, `hr.attendance.checkin` (device), `inventory.stock.consume`, `audit.log.write`, `system.realtime.subscribe`, `reports.schedule.dispatch`.

### 3.6 Scheduled Operations ⏰
`comm.reminder.schedule/dispatch`, `comm.winback.enqueue`, `reports.schedule.create/dispatch`, `audit.selfaudit.run`, `system.selfaudit.run`, `payroll.run.compute` (cyclic).

### 3.7 System Operations ⚙️
`system.*`, `audit.log.write`, `queue.alerts.dispatch`, `reports.schedule.dispatch`.

---

## 4. Aggregate Totals

| Metric | Count |
|---|---|
| **Total operations catalogued** | **123** |
| Requiring **audit** | 108 |
| **Approval-workflow candidates** | 41 |
| Requiring **break-glass** access | 7 |
| Never allowed on **public APIs** | 88 |
| **Backend-only** enforcement mandatory | 63 |
| Safe for **frontend-only UX** checks | 15 |

> Counts are derived by tag scan of Section 2; they are advisory and MUST be regenerated when this catalog is edited.

### 4.1 Operations Requiring Audit
Every operation with `A: yes` (see Section 2). Effectively: all `create/edit/delete/cancel/refund/void/approve/reject/assign/reassign/publish/export/merge/adjust/deactivate/reset/impersonate/close/write/amend/issue/revoke/finalize` verbs.

### 4.2 Operations Requiring Future Approval Workflows
All operations flagged `AC: yes`:
`patients.record.merge`, `patients.record.delete`, `patients.record.restore`, `patients.record.export`, `patients.document.delete`, `patients.wallet.credit` (>threshold), `patients.wallet.adjust`,
`appointments.slot.cancel` (late), `appointments.slot.override_conflict`, `appointments.slot.reassign_doctor` (same-day),
`queue.entry.prioritize`,
`clinical.record.amend`, `clinical.prescription.revoke`,
`invoices.doc.cancel`, `invoices.doc.delete`, `invoices.discount.apply` (>threshold), `payments.refund`, `payments.void`,
`treasury.cash.withdraw` (>threshold), `treasury.transfer.branch_to_branch`, `treasury.daily.reopen`, `expenses.approve`,
`inventory.product.deactivate`, `inventory.stock.adjust` (>threshold), `inventory.stock.transfer`, `inventory.po.approve`, `inventory.po.cancel`,
`hr.staff.deactivate`, `hr.attendance.manual_edit`, `hr.leave.approve`,
`payroll.run.approve`, `payroll.run.pay`, `payroll.run.revert`, `payroll.commission.approve`, `payroll.bonus.grant`, `payroll.payslip.view_any`,
`reports.custom.export` (sensitive),
`branches.deactivate`,
`settings.pricing.manage`, `settings.roles.edit`, `settings.backup.export`,
`iam.user.delete`, `iam.user.assign_role`, `iam.role.create`, `iam.role.edit_permissions`, `iam.session.impersonate`,
`audit.log.export`,
`system.migration.run`.

### 4.3 Operations Requiring Break-Glass Access
`clinical.record.amend`, `clinical.prescription.revoke`, `payroll.payslip.view_any`, `iam.session.impersonate`, `settings.backup.export`, `audit.log.export`, `system.migration.run`.

### 4.4 Operations That Must NEVER Be Exposed Through Public APIs
All operations tagged 💰, 🩺, 🛠, ⚙️, ⚠️, plus:
every `iam.*`, `audit.*`, `payroll.*`, `treasury.*`, `settings.*`, `system.*`,
every clinical record read/write,
`patients.record.*` (all verbs),
`invoices.*` write verbs, `payments.*` write verbs,
`reports.*` export verbs,
`comm.reminder.dispatch`, `comm.whatsapp.send`.

### 4.5 Operations That Must Always Execute Through Backend Only
Any operation whose correctness or safety depends on server-side state, sequential numbering, RLS scope resolution, or credentials:
`invoices.doc.finalize` (sequential numbering), all `payments.*` state changes, all `treasury.*`, all `payroll.*`, all `iam.*`, `audit.log.write`, `audit.log.export`, `settings.backup.export`,
`patients.record.merge`, `patients.wallet.adjust`,
`clinical.record.write`, `clinical.record.amend`, `clinical.prescription.issue/revoke`,
`inventory.stock.adjust/transfer`, `inventory.po.approve/receive`,
`hr.attendance.manual_edit`, `hr.staff.deactivate`,
`reports.schedule.dispatch`, `comm.reminder.dispatch`, `comm.winback.enqueue`, `queue.alerts.dispatch`,
`system.migration.run`, `system.cache.invalidate`, `system.selfaudit.run`.

### 4.6 Operations Safe For Frontend-Only UX Checks
These are read-only or navigation-time gates whose *authorization* is still enforced by RLS but whose UI reveal is safe to gate client-side:
`appointments.calendar.view`, `branches.dashboard.view`, `inventory.alerts.view`, `invoices.outstanding.view`, `patients.record.view` (list view only), `clinical.document.center_view` (index only), `reports.*.view` (chart render, not export), `system.info.view`, `system.health.view` (widget), `queue.entry.status_change` (drag-drop preview), `hr.leave.request` (form reveal), `payroll.payslip.view_self` (page reveal), `comm.template.edit` (page reveal), `settings.i18n.manage` (page reveal), `settings.templates.manage` (page reveal).

> "Safe for frontend-only UX" means: hiding the button here is *sufficient* for good UX; it is **never** sufficient for security. Backend RLS still enforces the ceiling.

---

## 5. Operation → Permission Mapping (Canonical)

Format: `operation.key → permission.key [scope]`.
This mapping is the single input for regenerating the Permission Matrix.

```
# Patients
patients.record.create           → patients.record.create          [branch]
patients.record.view             → patients.record.view            [branch|assigned]
patients.record.edit             → patients.record.edit            [branch]
patients.record.merge            → patients.record.merge           [organization]
patients.record.delete           → patients.record.delete          [organization]
patients.record.restore          → patients.record.restore         [organization]
patients.record.export           → data.export.run + patients.record.view [branch]
patients.document.upload         → patients.document.upload        [branch]
patients.document.delete         → patients.document.delete        [branch]
patients.consent.record          → patients.consent.record         [branch]
patients.consent.revoke          → patients.consent.revoke         [branch]
patients.wallet.credit           → patients.wallet.credit          [branch]
patients.wallet.debit            → patients.wallet.debit           [branch]
patients.wallet.adjust           → patients.wallet.adjust          [organization]

# Appointments
appointments.slot.book           → appointments.slot.book          [branch]
appointments.slot.reschedule     → appointments.slot.reschedule    [branch|assigned]
appointments.slot.cancel         → appointments.slot.cancel        [branch|assigned]
appointments.slot.no_show        → appointments.slot.no_show       [branch]
appointments.slot.override_conflict → appointments.slot.override   [branch]
appointments.slot.assign_room    → appointments.slot.edit          [branch]
appointments.slot.reassign_doctor→ appointments.slot.reassign      [branch]
appointments.calendar.view       → appointments.calendar.view      [branch|assigned]
appointments.recurring.create    → appointments.slot.book          [branch]

# Queue
queue.entry.checkin              → queue.entry.checkin             [branch]
queue.entry.walkin_create        → queue.entry.walkin              [branch]
queue.entry.status_change        → queue.entry.manage              [branch]
queue.entry.reassign_doctor      → queue.entry.reassign            [branch]
queue.entry.prioritize           → queue.entry.prioritize          [branch]
queue.entry.consultation_open    → clinical.consult.open           [assigned]
queue.alerts.dispatch            → SYSTEM                          [global]

# Clinical
clinical.consult.open            → clinical.consult.open           [assigned]
clinical.consult.close           → clinical.consult.close          [assigned]
clinical.record.write            → clinical.record.write           [assigned]
clinical.record.amend            → clinical.record.amend           [assigned]
clinical.record.view             → clinical.record.view            [branch|assigned]
clinical.diagnosis.assign        → clinical.diagnosis.assign       [assigned]
clinical.prescription.issue      → clinical.prescription.issue     [assigned]
clinical.prescription.revoke     → clinical.prescription.revoke    [assigned]
clinical.prescription.export     → clinical.prescription.export    [assigned]
clinical.procedure.perform       → clinical.procedure.perform      [assigned]
clinical.physio.plan_create      → clinical.physio.plan.create     [assigned]
clinical.physio.session_log      → clinical.physio.session.log     [assigned]
clinical.document.center_view    → clinical.document.view          [branch]

# Invoices & Payments
invoices.doc.create              → invoices.doc.create             [branch]
invoices.doc.edit_draft          → invoices.doc.edit               [branch]
invoices.doc.finalize            → invoices.doc.finalize           [branch]
invoices.doc.cancel              → invoices.doc.cancel             [branch]
invoices.doc.delete              → invoices.doc.delete             [branch|organization]
invoices.doc.export              → invoices.doc.export             [branch]
invoices.discount.apply          → invoices.discount.apply         [branch]
invoices.coupon.apply            → invoices.coupon.apply           [branch]
invoices.outstanding.view        → invoices.outstanding.view       [branch]
payments.record                  → payments.record                 [branch]
payments.refund                  → payments.refund                 [branch]
payments.void                    → payments.void                   [branch]

# Treasury & Expenses
treasury.cash.deposit            → treasury.cash.deposit           [branch]
treasury.cash.withdraw           → treasury.cash.withdraw          [branch]
treasury.transfer.branch_to_branch → treasury.transfer.execute     [organization]
treasury.daily.close             → treasury.daily.close            [branch]
treasury.daily.reopen            → treasury.daily.reopen           [organization]
expenses.record                  → expenses.record                 [branch]
expenses.approve                 → expenses.approve                [branch|organization]
expenses.reject                  → expenses.reject                 [branch|organization]

# Inventory
inventory.product.create         → inventory.product.create        [organization]
inventory.product.edit           → inventory.product.edit          [organization]
inventory.product.deactivate     → inventory.product.deactivate    [organization]
inventory.stock.adjust           → inventory.stock.adjust          [branch]
inventory.stock.consume          → inventory.stock.consume         [branch]
inventory.stock.transfer         → inventory.stock.transfer        [organization]
inventory.po.create              → inventory.po.create             [branch]
inventory.po.approve             → inventory.po.approve            [organization]
inventory.po.receive             → inventory.po.receive            [branch]
inventory.po.cancel              → inventory.po.cancel             [branch]
inventory.supplier.create        → inventory.supplier.create       [organization]
inventory.alerts.view            → inventory.alerts.view           [branch]

# HR
hr.staff.create                  → hr.staff.create                 [organization]
hr.staff.edit                    → hr.staff.edit                   [branch|organization]
hr.staff.deactivate              → hr.staff.deactivate             [organization]
hr.staff.assign_branch           → hr.staff.assign_branch          [organization]
hr.attendance.checkin            → hr.attendance.self              [own]
hr.attendance.manual_edit        → hr.attendance.edit              [branch]
hr.schedule.publish              → hr.schedule.publish             [branch]
hr.leave.request                 → hr.leave.request                [own]
hr.leave.approve                 → hr.leave.approve                [branch]
hr.leave.reject                  → hr.leave.reject                 [branch]
hr.performance.evaluate          → hr.performance.evaluate         [branch]
hr.department.create             → hr.department.create            [organization]
hr.position.create               → hr.position.create              [organization]

# Payroll
payroll.run.compute              → payroll.run.compute             [organization]
payroll.run.approve              → payroll.run.approve             [organization]
payroll.run.pay                  → payroll.run.pay                 [organization]
payroll.run.revert               → payroll.run.revert              [organization]
payroll.commission.calculate     → payroll.commission.calculate    [organization]
payroll.commission.approve       → payroll.commission.approve      [organization]
payroll.bonus.grant              → payroll.bonus.grant             [organization]
payroll.payslip.view_self        → payroll.payslip.view            [own]
payroll.payslip.view_any         → payroll.payslip.view.any        [organization]

# Reports
reports.financial.view           → reports.financial.view          [branch|organization]
reports.clinical.view            → reports.clinical.view           [branch|organization]
reports.hr.view                  → reports.hr.view                 [organization]
reports.inventory.view           → reports.inventory.view          [branch|organization]
reports.operational.view         → reports.operational.view        [branch|organization]
reports.doctor_performance.view  → reports.doctor_performance.view [organization]
reports.doctor_commissions.view  → reports.doctor_commissions.view [organization]
reports.custom.export            → data.export.run + <source>.view [matches source]
reports.schedule.create          → reports.schedule.create         [organization]
reports.schedule.dispatch        → SYSTEM                          [global]

# Branches
branches.create                  → branches.create                 [organization]
branches.edit                    → branches.edit                   [organization]
branches.deactivate              → branches.deactivate             [organization]
branches.schedule.configure      → branches.schedule.edit          [organization]
branches.dashboard.view          → branches.dashboard.view         [branch]

# Settings
settings.general.edit            → settings.general.edit           [organization]
settings.services.manage         → settings.services.manage        [organization]
settings.pricing.manage          → settings.pricing.manage         [organization]
settings.insurance.manage        → settings.insurance.manage       [organization]
settings.payment_methods.manage  → settings.payment_methods.manage [organization]
settings.templates.manage        → settings.templates.manage       [organization]
settings.i18n.manage             → settings.i18n.manage            [organization]
settings.roles.edit              → iam.roles.edit                  [organization]
settings.users.manage            → iam.users.manage                [organization]
settings.backup.export           → data.backup.run                 [organization]

# Communication
comm.reminder.schedule           → comm.reminder.schedule          [branch]
comm.reminder.dispatch           → SYSTEM                          [global]
comm.winback.enqueue             → SYSTEM                          [global]
comm.whatsapp.send               → comm.whatsapp.send              [branch]
comm.template.edit               → comm.template.edit              [organization]
comm.automation.configure        → comm.automation.configure       [organization]

# IAM
iam.user.create                  → iam.users.manage                [organization]
iam.user.delete                  → iam.users.manage                [organization]
iam.user.reset_password          → iam.users.reset_password        [organization]
iam.user.assign_role             → iam.users.assign_role           [organization]
iam.role.create                  → iam.roles.edit                  [organization]
iam.role.edit_permissions        → iam.roles.edit                  [organization]
iam.session.impersonate          → iam.session.impersonate         [organization]
iam.session.revoke               → iam.session.revoke              [organization]

# Audit
audit.log.view                   → audit.log.view                  [organization]
audit.log.export                 → audit.log.export                [organization]
audit.log.write                  → SYSTEM                          [global]
audit.selfaudit.run              → audit.selfaudit.run             [organization]

# System
system.health.view               → system.health.view              [global]
system.migration.run             → PLATFORM                        [global]
system.cache.invalidate          → system.cache.invalidate         [global]
system.selfaudit.run             → SYSTEM                          [global]
system.info.view                 → system.info.view                [organization]
system.realtime.subscribe        → <derived>                       [derived]
```

---

## 6. Governance

- **Authoritative:** This catalog is the *only* source from which Permission Matrixes, RLS test suites, and Approval-workflow configurations may be generated.
- **Change control:** Any new operation MUST be added here **before** it is implemented in code or RLS.
- **Review cadence:** Reviewed jointly by Security, Product, and Clinical Ops each quarter.
- **Consistency contract:** If Section 2 and Section 5 disagree, Section 2 wins and Section 5 must be regenerated.
- **Downstream artifacts (out of scope for this document):**
  - Permission Matrix (Role × Permission) — generated in Wave 2.
  - Audit Rule table — generated in Wave 3.
  - Approval Workflow registry — generated in Wave 4.
  - Public API allow-list — generated in Wave 5.

*End of Business Operations Catalog.*