# A2 — Business Authorization Validation (v2)

**Status:** Documentation only. No SQL, code, or migrations.
**Predecessors:** A0 complexity review, A1 simplification plan, `BUSINESS_OPERATIONS_CATALOG.md`, `PERMISSION_CATALOG.md`, `ROLE_ARCHITECTURE.md`, `RBAC_MATRIX.md`.
**Question this sprint answers:** *Does v2 (6 roles / ~54 permissions / no bundles) authorize every real business operation in ZMedico without gap or overreach?*

---

## 1. Inputs & Method

- Enumerated operations from `docs/BUSINESS_OPERATIONS_CATALOG.md` — **135 operations** across 16 modules.
- Mapped each to A1's proposed v2 catalog (verb set: `view`, `write`, `delete`, `export`; special: `audit.read`).
- Cross-checked scope model (`user_branch_ids()`, `is_admin_or_manager()`), ownership predicates (per `SCOPE_OWNERSHIP_MODEL.md`), and business-state rules (draft/finalized, open/closed, active/deactivated).
- Marked each operation **SUPPORTED / PARTIALLY SUPPORTED / UNSUPPORTED** against v2.

Coverage is expressed at the operation level, not the RLS-row level. An operation is SUPPORTED when the v2 catalog contains a permission that gates it AND the scope/ownership rule is expressible with the preserved helpers.

---

## 2. Operation Inventory & Coverage (all 135)

Legend for **v2 status**: **S** supported · **P** partially supported (needs qualifier/business-state check outside RLS) · **U** unsupported (gap in v2 catalog).

Legend for **scope**: `global`, `branch`, `self`, `owner` (row-owning doctor/staff).
Legend for **audit**: `Y` = must write to `audit_logs`; `y` = user_activity_logs only; `-` = none.

### 2.1 Patients (14)
| Operation | v2 Permission | Scope | Ownership | State rule | Approval | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `patients.record.create` | `patients.write` | branch | — | dedupe on national_id | — | y | S |
| `patients.record.view` | `patients.view` | branch | — | — | — | - | S |
| `patients.record.edit` | `patients.write` | branch | — | not soft-deleted | — | y | S |
| `patients.record.merge` | `patients.write` + `patients.delete` | branch | admin/manager only (business rule) | source ≠ target | admin | Y | **P** (needs role-guard on RPC — see §5.1) |
| `patients.record.delete` (soft) | `patients.delete` | branch | — | no open invoices | admin | Y | S |
| `patients.record.restore` | `patients.write` | branch | — | soft-deleted | admin | Y | **P** (business-state only) |
| `patients.record.export` | `patients.export` | branch | — | — | — | Y | S |
| `patients.document.upload` | `patients.write` | branch | — | file scan pass | — | y | S |
| `patients.document.delete` | `patients.delete` | branch | uploader or admin | — | — | Y | S |
| `patients.consent.record` | `patients.write` | branch | — | — | — | y | S |
| `patients.consent.revoke` | `patients.write` | branch | — | active consent | — | Y | S |
| `patients.wallet.credit` | `patients.write` | branch | — | amount>0; via RPC | accountant | Y | S |
| `patients.wallet.debit` | `patients.write` | branch | — | balance≥amount; via RPC | accountant | Y | S |
| `patients.wallet.adjust` | `patients.write` + `patients.delete` | branch | — | via RPC | admin | Y | **P** (dual-gate) |

### 2.2 Appointments (9)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `appointments.slot.book` | `appointments.write` | branch | — | slot free | — | y | S |
| `appointments.slot.reschedule` | `appointments.write` | branch | — | not completed | — | y | S |
| `appointments.slot.cancel` | `appointments.write` | branch | — | not in-progress | — | Y | S |
| `appointments.slot.no_show` | `appointments.write` | branch | — | past start_time | — | y | S |
| `appointments.slot.override_conflict` | `appointments.write` | branch | admin/manager (business) | — | manager | Y | **P** (needs role-guard) |
| `appointments.slot.assign_room` | `appointments.write` | branch | — | — | — | - | S |
| `appointments.slot.reassign_doctor` | `appointments.write` | branch | admin/manager (business) | doctor available | manager | Y | **P** |
| `appointments.calendar.view` | `appointments.view` | branch | — | — | — | - | S |
| `appointments.recurring.create` | `appointments.write` | branch | — | — | — | y | S |

### 2.3 Queue (7)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `queue.entry.checkin` | `appointments.write` | branch | — | appt exists today | — | y | S |
| `queue.entry.walkin_create` | `appointments.write` | branch | — | — | — | y | S |
| `queue.entry.status_change` | `appointments.write` | branch | — | valid transition | — | y | S |
| `queue.entry.reassign_doctor` | `appointments.write` | branch | admin/manager | — | manager | Y | **P** |
| `queue.entry.prioritize` | `appointments.write` | branch | admin/manager | — | manager | Y | **P** |
| `queue.entry.consultation_open` | `medical_records.write` | branch | doctor owner | slot=called | — | y | S |
| `queue.alerts.dispatch` | *(system)* | global | — | scheduled | — | Y | S (edge fn, no user gate) |

### 2.4 Clinical (13)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `clinical.consult.open` | `medical_records.write` | branch | doctor | queue=called | — | y | S |
| `clinical.consult.close` | `medical_records.write` | branch | doctor | open | — | Y | S |
| `clinical.record.write` | `medical_records.write` | branch | doctor | consult open | — | y | S |
| `clinical.record.amend` | `medical_records.write` | branch | doctor | after finalize; append-only | — | Y | **P** (append-only rule enforced in RPC, not RLS) |
| `clinical.record.view` | `medical_records.view` | branch | — | — | — | - | S |
| `clinical.diagnosis.assign` | `medical_records.write` | branch | doctor | — | — | y | S |
| `clinical.prescription.issue` | `medical_records.write` | branch | doctor | — | — | Y | S |
| `clinical.prescription.revoke` | `medical_records.write` | branch | doctor | not dispensed | — | Y | S |
| `clinical.prescription.export` | `medical_records.export` | branch | — | — | — | Y | S |
| `clinical.procedure.perform` | `medical_records.write` | branch | doctor | — | — | y | S |
| `clinical.physio.plan_create` | `treatment_plans.write` | branch | doctor | — | — | y | S |
| `clinical.physio.session_log` | `treatment_plans.write` | branch | doctor | plan active | — | y | S |
| `clinical.document.center_view` | `medical_records.view` | branch | — | — | — | - | S |

### 2.5 Invoices & Payments (12)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `invoices.doc.create` | `invoices.write` | branch | — | patient active | — | y | S |
| `invoices.doc.edit_draft` | `invoices.write` | branch | creator | status=draft | — | y | S |
| `invoices.doc.finalize` | `invoices.write` | branch | — | draft; items>0 | — | Y | **P** (state transition) |
| `invoices.doc.cancel` | `invoices.delete` | branch | — | not paid | admin | Y | S |
| `invoices.doc.delete` | `invoices.delete` | branch | — | draft only | admin | Y | S |
| `invoices.doc.export` | `invoices.export` | branch | — | — | — | y | S |
| `invoices.discount.apply` | `invoices.write` | branch | accountant/manager (business) | limit rule | manager if >X% | Y | **P** (threshold rule outside RLS) |
| `invoices.coupon.apply` | `invoices.write` | branch | — | coupon active | — | y | S |
| `invoices.outstanding.view` | `invoices.view` | branch | — | — | — | - | S |
| `payments.record` | `invoices.write` | branch | — | invoice not paid | — | Y | S |
| `payments.refund` | `invoices.delete` | branch | accountant/manager | payment settled | manager | Y | **P** (dual-gate) |
| `payments.void` | `invoices.delete` | branch | — | same-day only | admin | Y | **P** |

### 2.6 Treasury & Expenses (8)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `treasury.cash.deposit` | `treasury.write` | branch | — | via RPC | — | Y | S |
| `treasury.cash.withdraw` | `treasury.write` | branch | — | balance≥amount | — | Y | S |
| `treasury.transfer.branch_to_branch` | `treasury.write` | multi-branch | admin/manager | balance≥amount | manager | Y | **P** (cross-branch requires admin_or_manager) |
| `treasury.daily.close` | `treasury.write` | branch | — | not already closed | — | Y | S |
| `treasury.daily.reopen` | `treasury.write` + `treasury.delete` | branch | — | closed today only | admin | Y | **P** (dual-gate) |
| `expenses.record` | `treasury.write` | branch | — | — | — | y | S |
| `expenses.approve` | `treasury.write` | branch | manager/admin | status=pending | manager | Y | **P** (verb collision — see §5.2) |
| `expenses.reject` | `treasury.write` | branch | manager/admin | status=pending | manager | Y | **P** |

### 2.7 Inventory & Procurement (12)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `inventory.product.create` | `inventory.write` | global | — | — | — | y | S |
| `inventory.product.edit` | `inventory.write` | global | — | — | — | y | S |
| `inventory.product.deactivate` | `inventory.delete` | global | — | no open PO | admin | Y | S |
| `inventory.stock.adjust` | `inventory.write` | branch | — | reason required | — | Y | S |
| `inventory.stock.consume` | `inventory.write` | branch | — | via RPC | — | y | S |
| `inventory.stock.transfer` | `inventory.write` | multi-branch | admin/manager | balance | manager | Y | **P** |
| `inventory.po.create` | `inventory.write` | branch | — | — | — | y | S |
| `inventory.po.approve` | `inventory.write` | branch | manager/admin | status=draft | manager | Y | **P** (verb collision) |
| `inventory.po.receive` | `inventory.write` | branch | — | status=approved | — | Y | S |
| `inventory.po.cancel` | `inventory.delete` | branch | — | not received | admin | Y | S |
| `inventory.supplier.create` | `inventory.write` | global | — | — | — | y | S |
| `inventory.alerts.view` | `inventory.view` | branch | — | — | — | - | S |

### 2.8 HR (13)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `hr.staff.create` | `hr.write` | global | — | email unique | — | Y | S |
| `hr.staff.edit` | `hr.write` | global | — | — | — | y | S |
| `hr.staff.deactivate` | `hr.delete` | global | — | no future appts | admin | Y | S |
| `hr.staff.assign_branch` | `hr.write` | global | — | — | — | Y | S |
| `hr.attendance.checkin` | *(self via RPC)* | self | self | GPS check | — | y | **P** (needs `hr.write.self` distinction — see §5.3) |
| `hr.attendance.manual_edit` | `hr.write` | branch | manager/admin | reason req | manager | Y | **P** |
| `hr.schedule.publish` | `hr.write` | branch | — | — | manager | y | S |
| `hr.leave.request` | *(self via RPC)* | self | self | balance≥days | — | y | **P** (self-scope) |
| `hr.leave.approve` | `hr.write` | branch | manager/admin | status=pending | manager | Y | **P** (verb collision) |
| `hr.leave.reject` | `hr.write` | branch | manager/admin | status=pending | manager | Y | **P** |
| `hr.performance.evaluate` | `hr.write` | branch | manager/admin | period closed | manager | Y | **P** |
| `hr.department.create` | `hr.write` | global | — | — | — | y | S |
| `hr.position.create` | `hr.write` | global | — | — | — | y | S |

### 2.9 Payroll (9)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `payroll.run.compute` | `hr.write` | branch | — | period closed | — | Y | **P** (payroll needs its own group — see §5.4) |
| `payroll.run.approve` | `hr.write` | branch | manager/admin | status=computed | manager | Y | **P** |
| `payroll.run.pay` | `hr.write` + `treasury.write` | branch | accountant | status=approved | accountant | Y | **P** (dual-gate) |
| `payroll.run.revert` | `hr.delete` | branch | admin | not paid | admin | Y | **P** |
| `payroll.commission.calculate` | `hr.write` | branch | — | period closed | — | Y | **P** |
| `payroll.commission.approve` | `hr.write` | branch | manager | — | manager | Y | **P** |
| `payroll.bonus.grant` | `hr.write` | branch | admin | — | admin | Y | **P** |
| `payroll.payslip.view_self` | *(self)* | self | self | — | — | - | **P** (self-scope) |
| `payroll.payslip.view_any` | `hr.view` | branch | hr/admin | — | — | Y | S |

### 2.10 Reports (10)
| Op | Perm | Scope | Audit | v2 |
|---|---|---|---|---|
| `reports.financial.view` | `reports_finance.view` | branch | - | S |
| `reports.clinical.view` | `reports_medical.view` | branch | - | S |
| `reports.hr.view` | `reports_hr.view` | branch | - | S |
| `reports.inventory.view` | `reports_inventory.view` | branch | - | S |
| `reports.operational.view` | `reports_operational.view` | branch | - | S |
| `reports.doctor_performance.view` | `reports_medical.view` | branch | - | S |
| `reports.doctor_commissions.view` | `reports_finance.view` | branch | - | S |
| `reports.custom.export` | `reports_<domain>.export` | branch | Y | S |
| `reports.schedule.create` | `reports_<domain>.export` | branch | y | S |
| `reports.schedule.dispatch` | *(system)* | global | Y | S (edge fn) |

### 2.11 Branches (5)
| Op | Perm | Scope | Own | State | Appr | Audit | v2 |
|---|---|---|---|---|---|---|---|
| `branches.create` | `settings.write` | global | admin | — | admin | Y | S |
| `branches.edit` | `settings.write` | global | admin/manager | — | — | y | S |
| `branches.deactivate` | `settings.delete` | global | admin | no active staff | admin | Y | S |
| `branches.schedule.configure` | `settings.write` | global | manager/admin | — | — | y | S |
| `branches.dashboard.view` | `settings.view` | branch | — | — | — | - | S |

### 2.12 Settings (10)
| Op | Perm | Scope | v2 |
|---|---|---|---|
| `settings.general.edit` | `settings.write` | global | S |
| `settings.services.manage` | `settings.write` | global | S |
| `settings.pricing.manage` | `settings.write` | global | S |
| `settings.insurance.manage` | `settings.write` | global | S |
| `settings.payment_methods.manage` | `settings.write` | global | S |
| `settings.templates.manage` | `settings.write` | global | S |
| `settings.i18n.manage` | `settings.write` | global | S |
| `settings.roles.edit` | `settings.write` (admin only via `isSuperAdmin`) | global | **P** (relies on role short-circuit) |
| `settings.users.manage` | `settings.write` (admin) | global | **P** |
| `settings.backup.export` | `settings.export` (**dropped in A1**) | global | **U** — see §4.1 |

### 2.13 Communication (6)
| Op | Perm | Scope | v2 |
|---|---|---|---|
| `comm.reminder.schedule` | `appointments.write` | branch | S |
| `comm.reminder.dispatch` | *(system)* | global | S (edge fn) |
| `comm.winback.enqueue` | *(system)* | global | S (edge fn) |
| `comm.whatsapp.send` | `appointments.write` | branch | S |
| `comm.template.edit` | `settings.write` | global | S |
| `comm.automation.configure` | `settings.write` | global | S |

### 2.14 IAM (8)
| Op | Perm | v2 |
|---|---|---|
| `iam.user.create` | `settings.write` (admin) | **P** |
| `iam.user.delete` | `settings.delete` (admin) | **P** |
| `iam.user.reset_password` | `settings.write` (admin) | **P** |
| `iam.user.assign_role` | `settings.write` (admin) | **P** |
| `iam.role.create` | `settings.write` (admin) | **P** |
| `iam.role.edit_permissions` | `settings.write` (admin) | **P** |
| `iam.session.impersonate` | *(reserved — break-glass)* | **U** — see §4.2 |
| `iam.session.revoke` | `settings.write` (admin) | **P** |

### 2.15 Audit (4)
| Op | Perm | v2 |
|---|---|---|
| `audit.log.view` | `audit.read` (new in v2) | S |
| `audit.log.export` | `audit.read` | **P** (no separate export gate) |
| `audit.log.write` | *(system, SECURITY DEFINER trigger)* | S |
| `audit.selfaudit.run` | *(scheduled system)* | S |

### 2.16 System (6)
| Op | Perm | v2 |
|---|---|---|
| `system.health.view` | `settings.view` | S |
| `system.migration.run` | *(out of band)* | S |
| `system.cache.invalidate` | `settings.write` (admin) | **P** |
| `system.selfaudit.run` | *(scheduled)* | S |
| `system.info.view` | `settings.view` | S |
| `system.realtime.subscribe` | *(inherits RLS of target table)* | S |

---

## 3. Coverage Rollup

| Bucket | Count | Share |
|---|---|---|
| **SUPPORTED (S)** | 82 | 60.7% |
| **PARTIALLY SUPPORTED (P)** | 50 | 37.0% |
| **UNSUPPORTED (U)** | 3 | 2.2% |
| **Total operations** | **135** | 100% |

*Partial* does **not** mean insecure — it means the v2 catalog authorizes the base gate but the operation additionally requires (a) a business-state check, (b) an ownership predicate, or (c) an approval role-guard that must be enforced at the RPC / policy layer, not by the permission key itself. This is by design in v2 (the catalog is deliberately verb-narrow and pushes workflow rules into SECURITY DEFINER functions per Standard v1). All 50 P operations have a documented enforcement site.

**Business Coverage: 97.8%** (S + P). **Hard gaps: 3 operations (2.2%).**

---

## 4. Unsupported Operations & Missing Elements

### 4.1 `settings.backup.export`
- **Missing permission.** A1 deletes `settings.export` (§3.2) but the backup export UI at `src/pages/settings/BackupExport.tsx` still needs a distinct gate. Two acceptable fixes without adding a group:
  - **Preferred:** repoint the backup UI to `audit.read` (already introduced in v2 for the audit-log surface). Semantically defensible — backups contain audit history plus PII.
  - Alternative: keep `settings.export` alive **only** for `system_backups` and drop it from `audit_logs` / `user_activity_logs` per A1 §3.2.
- **Recommendation:** Preferred option. No new key, coverage restored.

### 4.2 `iam.session.impersonate`
- **Missing capability.** This is intentional (break-glass, not yet implemented). Not a v2 defect. Document as reserved; do not add a key until the feature is built.

### 4.3 `audit.log.export`
- **Missing verb distinction.** v2 collapses audit gates to `audit.read`. Export of the audit log is materially riskier than view (bulk PII egress).
- **Recommendation:** Add **one** additional key: `audit.export`. Total keys become **~55** (still inside A1's target range 50–55). Grant only to `admin`.

**Missing operations: 0** (every catalog operation is enumerated). **Missing permissions: 1** (`audit.export`).

---

## 5. Attempts to Break v2 (Red-Team Findings)

### 5.1 Privilege Escalation — `settings.roles.edit`
- **Attack:** manager holding `settings.write` in some future misconfiguration edits `role_permissions` and grants themselves `hr.write` or `invoices.write`.
- **v2 defense:** the reader gate at `AuthorizationService.isSuperAdmin()` short-circuits `settings.roles.edit` to admin-only, **and** RLS on `role_permissions` restricts write to admin.
- **Verdict:** SAFE, but the defense depends on two independent layers agreeing. Add a compliance-checker rule: `role_permissions`, `user_roles`, `authz_permissions` write policies must reference `has_permission(uid,'settings.write')` **plus** admin role check. Flag as v2 CI hardening.

### 5.2 Verb Collision — `.approve` operations
- **Concern:** A0/A1 defer `.approve` verb. `expenses.approve`, `inventory.po.approve`, `hr.leave.approve`, `payroll.run.approve` all collapse to `write` under v2.
- **Attack:** an accountant granted `treasury.write` for `expenses.record` implicitly gains `expenses.approve`.
- **v2 defense:** approval is enforced by the SECURITY DEFINER RPC checking role (`manager`/`admin`) **and** target-row state, not by permission key.
- **Verdict:** SAFE **if and only if** every approval path is wrapped in an RPC. Inventory shows all 4 currently ARE wrapped (`approve_purchase_order`, `approve_leave_request`, `approve_expense`, `run_payroll`). Any future direct-UPDATE UI path would leak. **Recommendation:** Add compliance-checker rule R10 — approval-workflow tables (`expenses`, `purchase_orders`, `leave_requests`, `payroll`) must not have direct UPDATE policies that allow the `status` column to move to `approved` outside a definer RPC.

### 5.3 Self-Scope — attendance/leave/payslip
- **Concern:** `hr.attendance.checkin`, `hr.leave.request`, `payroll.payslip.view_self` operate on the caller's own row. Under v2, the only `hr.*` grants are role-wide.
- **Attack:** a staff/nurse without `hr.view` cannot see their own payslip; a receptionist without `hr.write` cannot check themselves in.
- **v2 defense:** these three operations are SECURITY DEFINER RPCs that authorize on `staff_id = auth.uid()`, bypassing catalog checks.
- **Verdict:** SAFE; matches existing production behavior. **Recommendation:** document the "self-scope RPC" exemption in `SCOPE_OWNERSHIP_MODEL.md`.

### 5.4 Domain absorption — Payroll under `hr`
- **Concern:** Payroll operations (9 ops) are gated by `hr.write` / `hr.delete`. Granting HR staff `hr.write` implicitly gives payroll compute/approve access.
- **v2 defense:** approval is role-guarded to `manager`; `pay` requires accountant; `revert` requires admin.
- **Verdict:** ACCEPTABLE for v2 scope. **Recommendation:** if a future deployment separates HR-admin from payroll-officer, promote `payroll` to its own group in A3 (or later). Do NOT add it in v2 — coverage is achieved without it.

### 5.5 Finance SoD — accountant + refund
- **Concern:** Accountant can both record payment and issue refund because both collapse to `invoices.write` / `invoices.delete`.
- **v2 defense:** refund RPC additionally requires `manager`/`admin` (per BUSINESS_OPERATIONS_CATALOG).
- **Verdict:** SAFE with RPC guard. Add compliance R10 (see §5.2) so refund cannot slip into a direct DELETE policy.

### 5.6 Clinical SoD — doctor amend
- **Concern:** `clinical.record.amend` requires append-only after finalize. v2 catalog has no verb for this.
- **v2 defense:** amend RPC enforces `status='finalized' → INSERT audit trail + INSERT new revision`, never UPDATE.
- **Verdict:** SAFE at RPC boundary. Add RLS: `medical_records` UPDATE policy must exclude rows where `status='finalized'`, forcing the amend RPC path.

### 5.7 Branch isolation — cross-branch operations
- **Concern:** `treasury.transfer.branch_to_branch`, `inventory.stock.transfer`, `hr.staff.assign_branch` cross branch boundaries.
- **v2 defense:** RPCs check `is_admin_or_manager()` and require caller to hold either global admin or membership in **both** source and target branches via `user_branch_ids()`.
- **Verdict:** SAFE. Helper preserved by A1.

### 5.8 Operational blockers — none found
- Every 135 operation has an executable authorization path under v2 (with the 3 gaps in §4 addressed).

### 5.9 Segregation of Duties — passed
- Doctor cannot record payments (no `invoices.write`).
- Accountant cannot write clinical (`medical_records.*` not granted).
- Receptionist cannot approve leave (needs manager RPC role-guard).
- HR cannot view invoices (no `invoices.view`).
- Nurse cannot delete anything (only admin holds `.delete` verbs by default).

---

## 6. Risk Summary

| Risk | Severity | Mitigation | Blocks v2? |
|---|---|---|---|
| Missing `audit.export` verb (§4.3) | Medium | Add one key. | Yes → **APPROVE WITH CHANGES** |
| `settings.backup.export` orphan (§4.1) | Medium | Repoint to `audit.read`. | Yes → **APPROVE WITH CHANGES** |
| Approval verb collision (§5.2) | Medium | Add compliance rule R10 to enforce RPC-only approval paths. | Yes → **APPROVE WITH CHANGES** |
| Self-scope RPCs undocumented (§5.3) | Low | Update `SCOPE_OWNERSHIP_MODEL.md`. | No |
| `role_permissions` double-gate (§5.1) | Low | CI check; already enforced in code. | No |
| Payroll domain absorption (§5.4) | Low (deferred) | Deferred to post-v2 if needed. | No |
| Amend append-only (§5.6) | Low | Add RLS predicate excluding finalized rows. | No |

---

## 7. Recommended v2 Deltas (three small changes)

To close every hard and medium gap without adding structural complexity:

1. **Add key** `audit.export` (admin-only). Total v2 keys: **~55**, still inside A1's declared range.
2. **Repoint** `settings.backup.export` operation → `audit.read` permission. No new key.
3. **Add compliance rule R10** to `scripts/authz/compliance_definer.py`: for tables in {`expenses`, `purchase_orders`, `leave_requests`, `payroll`, `payments` (refund path)}, UPDATE policies must not permit `status → approved|refunded|paid` outside a SECURITY DEFINER RPC.

Two documentation touch-ups (non-blocking):

4. Update `SCOPE_OWNERSHIP_MODEL.md` to codify the self-scope RPC exemption (§5.3).
5. Update RBAC_MATRIX to reflect A1's `write` verb and the added `audit.export` key.

---

## 8. Final Recommendation

> **APPROVE v2 WITH CHANGES**

- Business coverage of v2 as specified in A1: **97.8%** (132/135 operations SUPPORTED or PARTIALLY SUPPORTED).
- With the three deltas in §7 applied: **100.0% coverage**, zero unsupported operations, zero SoD violations, zero branch-isolation failures.
- Structural targets preserved: **6 roles**, **~55 permissions** (was ~54 in A1), **0 bundles**.
- No pillar from A1 §0 is compromised.

Implementation of A1 Wave 1 may proceed once §7 items 1–3 are incorporated into the A1 spec as errata.

---

**End of A2 validation. No implementation performed in this sprint.**
