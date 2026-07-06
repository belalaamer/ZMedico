# Authorization Product Decisions

Unresolved business decisions that block permission-catalog and RLS work. Each item requires the named Approval Authority to answer before the linked keys/waves can proceed.

---

## PD-01 — Should managers create/edit invoices?

**Blocks:** `invoices.manager_invoices_insert`, `invoices.manager_invoices_update` (Wave 3E Batch B).
**Owner to decide:** Head of Finance + Head of Clinic Operations.
**Options:**
- **A.** Yes — grant `invoices.create` + `invoices.edit` to the `bundle.role.manager`; RLS substitution succeeds unchanged.
- **B.** No — remove the current manager-branch invoice policies; only accountant/admin/receptionist may create/edit invoices.
- **C.** Partial — managers may edit invoices only in `status='draft'` within their branch (requires `invoices.edit.draft` or a Pattern P8 state gate).

**Impact of no-decision:** finance RLS remains on `has_role()`; Wave 3E cannot complete; migration stalls.
**Regulatory:** SOX-analogue — segregation of duties.

---

## PD-02 — Payment refund authority

**Blocks:** `payments.refund` catalog insertion and any RLS covering `payments` UPDATE.
**Owner to decide:** Head of Finance + DPO.
**Options:**
- **A.** Accountants + admins may refund freely.
- **B.** Accountants may initiate; admin must approve (dual-control → Pattern P9).
- **C.** Only admin may refund.

**Impact of no-decision:** cannot add `payments.refund` key; entire `payments.*` family blocked (Wave 3E Batch C, Wave 3F, Wave 3H all touch payments).
**Regulatory:** PCI-DSS — logged approval chain required.

---

## PD-03 — Expense approval workflow

**Blocks:** `expenses.approve` design; `manager_expenses_*` RLS substitution.
**Owner to decide:** Head of Finance.
**Options:**
- **A.** No approval — anyone with `expenses.create` may finalize (matches current RLS).
- **B.** Two-stage: creator + approver, threshold-free (Pattern P9).
- **C.** Threshold-based approval (e.g., > 1000 currency requires admin).

**Impact of no-decision:** `expenses.approve` cannot be added; Wave 3E Batch C blocked.
**Regulatory:** SOX-analogue.

---

## PD-04 — Payroll run authority

**Blocks:** `payroll.run` catalog insertion.
**Owner to decide:** Head of Finance + Head of People + CEO.
**Options:**
- **A.** HR may run payroll autonomously.
- **B.** HR proposes, Finance approves (Pattern P9).
- **C.** Only admin may run.

**Impact of no-decision:** entire `payroll.*` family blocked (Wave 3H).
**Regulatory:** Tax + SOX + labor law.

---

## PD-05 — Patient wallet credit/debit authority

**Blocks:** `patient_wallet.credit`, `patient_wallet.debit`.
**Owner to decide:** Head of Finance + DPO.
**Options:**
- **A.** Accountant may credit and debit freely.
- **B.** Credit is unrestricted (accountant, receptionist); debit requires admin.
- **C.** Both require dual approval.

**Impact of no-decision:** wallet ops remain gated by generic role checks; no fine-grained control.
**Regulatory:** Consumer protection + PCI-DSS-adjacent.

---

## PD-06 — Introduce `compliance` app_role?

**Blocks:** Wave 3F.2 (Pattern P10 Compliance / Audit-Read).
**Owner to decide:** Head of Engineering + DPO + Head of Clinic Operations.
**Options:**
- **A.** Yes — add `compliance` to the `app_role` enum, create `bundle.compliance` holding `audit.read`.
- **B.** No — grant `audit.read` inside the admin bundle only (auditors act with admin credentials, discouraged).
- **C.** External auditor logins only, no in-app role.

**Impact of no-decision:** `audit.read` cannot be effectively granted; audit tables remain misgated via `settings.export`.
**Regulatory:** HIPAA/GDPR audit access.

---

## PD-07 — Prescription dispense = clinical or pharmacy?

**Blocks:** `prescriptions.dispense`.
**Owner to decide:** Chief Medical Officer.
**Options:**
- **A.** Any doctor with `prescriptions.dispense` grant.
- **B.** Only a designated "dispenser" (requires new sub-role or per-user grant).
- **C.** Only admin during current pilot; revisit after pharmacy module.

**Impact of no-decision:** prescription workflow cannot leave draft.
**Regulatory:** Controlled-substance recordkeeping.

---

## PD-08 — Communication `send` gating

**Blocks:** `communication.send`.
**Owner to decide:** DPO + Head of Clinic Operations.
**Options:**
- **A.** Any receptionist may send templated messages.
- **B.** `compose` freely allowed; `send` requires admin or a marketing role.
- **C.** All outbound messages require patient-consent flag AND `communication.send`.

**Impact of no-decision:** communication policies remain role-based; no consent enforcement in RLS.
**Regulatory:** GDPR + TCPA-analogue.

---

## PD-09 — SaaS-billing visibility to tenant admins

**Blocks:** `saas_billing.view` grant policy.
**Owner to decide:** CEO / Platform PM.
**Options:**
- **A.** Tenant admins may view but not manage.
- **B.** Only platform staff (no in-tenant role holds it).
- **C.** Read-only mirror surfaced via a scoped page; RLS + branch clamp.

**Impact of no-decision:** `saas_billing.*` cannot leave draft.
**Regulatory:** SOX (revenue recognition).

---

## PD-10 — Deprecation window for `reports.view` / `reports.export`

**Blocks:** removal wave post 3H.
**Owner to decide:** Head of Clinic Operations + Head of Engineering.
**Options:**
- **A.** 30-day dual-active window then retire.
- **B.** 60-day window.
- **C.** Keep umbrella permanently as convenience alias.

**Impact of no-decision:** N4 dedup remains open.

---

## Summary

| Decision | Blocks | Severity | Owner |
|---|---|---|---|
| PD-01 | Wave 3E-B | HIGH | Finance + Clinic Ops |
| PD-02 | Wave 3E-C / 3F / 3H | HIGH | Finance + DPO |
| PD-03 | Wave 3E-C | HIGH | Finance |
| PD-04 | Wave 3H | HIGH | Finance + People + CEO |
| PD-05 | Wave 3H | MEDIUM | Finance + DPO |
| PD-06 | Wave 3F.2 | MEDIUM | Eng + DPO + Clinic Ops |
| PD-07 | Clinical wave | MEDIUM | CMO |
| PD-08 | Communication wave | MEDIUM | DPO + Clinic Ops |
| PD-09 | SaaS wave | LOW | CEO/PM |
| PD-10 | Hygiene wave | LOW | Clinic Ops + Eng |

**5 HIGH-severity decisions must land before Wave 3E can restart.**
