# N6 — Authorization Completeness Validation

**Status:** Documentation only. Final completeness audit before Permission Catalog v2 insertion.
No SQL. No migrations. No RLS. No catalog inserts. No bundle changes. No code changes.

**Inputs cross-referenced:**
- `docs/BUSINESS_OPERATIONS_CATALOG.md`
- `docs/normalization/N1_PERMISSION_TAXONOMY_V2.md` (151 keys)
- `docs/wave3d/WAVE3D_AUTHORIZATION_PATTERN_CATALOG.md`
- `docs/ROLE_ARCHITECTURE.md`, `docs/SCOPE_OWNERSHIP_MODEL.md`
- `docs/governance/*` (Charter, Ownership, PDs, Lifecycle, Priority, Status Register)
- Live: `src/pages/**`, `supabase/functions/**`, `pg_policies`, RPC inventory

**Legend (actions):** V=view · C=create · E=edit · D=delete · A=approve · X=export · CF=configure · SP=special verb (dispense/refund/run/close/reassess/receive/manage/credit/debit/log/compose/send/void/cancel/reopen/override/sign/print/archive/restore/import).

**Status codes:** OK · NEW (in Taxonomy v2, not yet inserted) · MISS-ACT · UMBRELLA · PD (blocked by Product Decision) · AMBIG.

---

## 1. Appointments
| Operation | Key | Actions | Status | Recommendation |
|---|---|---|---|---|
| Book / reschedule | `appointments.create/.edit` | V,C,E | OK | — |
| Cancel appointment | `appointments.edit` (status) | E or `cancel` | MISS-ACT | Add `appointments.cancel` for audit clarity |
| No-show | `appointments.edit` | E | OK | — |
| Delete | `appointments.delete` | D | OK | — |
| Export schedule | `appointments.export` | X | OK | — |
| Configure slots/hours | `appointments.configure` | CF | NEW | Insert in N1-INSERT |
| Print card | (implicit view) | print | — | No key needed |

**Completeness 92 %** · **Readiness: READY after N1-INSERT (+ optional `.cancel`).**

## 2. Patients
| Operation | Key | Actions | Status | Recommendation |
|---|---|---|---|---|
| CRUD + export | `patients.*` | V,C,E,D,X | OK | — |
| Merge duplicates | — | merge | MISS-ACT | Add `patients.merge` |
| Archive/restore | — | archive, restore | MISS-ACT | Add `patients.archive/.restore` |
| Documents up/view/delete | `documents.*` | V, upload, D | NEW | Insert 3 keys |
| Wallet view | `patient_wallet.view` | V | NEW+PD-05 | — |
| Wallet credit/debit | `patient_wallet.credit/.debit` | SP | NEW+PD-05 | — |

**Completeness 70 %** · **Readiness: MISSING PERMISSIONS + PD-05.**

## 3. Queue
| Operation | Key | Actions | Status |
|---|---|---|---|
| View queue | `queue.view` | V | NEW |
| Call next / skip / requeue | `queue.manage` | manage | NEW |
| Configure SLAs / alerts | `queue.configure` | CF | NEW |
| Read alert audit runs | `audit.read` | V | NEW |

**Completeness 0 %** · **Readiness: MISSING PERMISSIONS.**

## 4. Clinical (records, dental, vitals, dx, procedures, prescriptions, plans, physio, documents)
| Operation | Key | Actions | Status | Recommendation |
|---|---|---|---|---|
| Medical record R/W | `medical_records.*` | V,C,E,D,X | OK | Add `.sign`, `.amend` (HIPAA) |
| Dental chart | `dental.view/.edit` | V,E | NEW | — |
| Vitals | `vitals.*` | V,C,E,D,X | OK | — |
| Diagnoses coding | `diagnoses.view/.edit` | V,E | NEW | — |
| Procedures coding | `procedures.view/.edit` | V,E | NEW | — |
| Prescriptions R/W + dispense | `prescriptions.*` | V,C,E,D, dispense | NEW | Add `.sign`, `.print` |
| Treatment plans | `treatment_plans.*` | V,C,E,D,X | OK | Add `.approve`, `.close` |
| Physio cases | `physio.*` | V,C,E,D, close, reassess | NEW | — |
| Patient documents | `documents.*` | V, upload, D | NEW | — |

**Completeness 55 %** · **Readiness: MISSING PERMISSIONS + MISSING ACTIONS (sign/amend/approve/close).**

## 5. Finance – Invoices
| Operation | Key | Actions | Status |
|---|---|---|---|
| CRUD + export | `invoices.*` | V,C,E,D,X | OK |
| Approve | `invoices.approve` | A | NEW |
| Void | — | void | MISS-ACT → `invoices.void` |
| Reopen | — | reopen | MISS-ACT → `invoices.reopen` |
| Manager create/edit? | — | — | PD-01 |

**Completeness 60 %** · **Readiness: NEEDS PRODUCT DECISION (PD-01) + MISSING ACTIONS.**

## 6. Finance – Payments
| Operation | Key | Actions | Status |
|---|---|---|---|
| CRUD + export | `payments.*` | V,C,E,D,X | NEW+PD-01 |
| Refund | `payments.refund` | refund | NEW+PD-02 |
| Void | — | void | MISS-ACT → `payments.void` |

**Completeness 0 %** · **Readiness: BLOCKED (PD-01, PD-02).**

## 7. Finance – Expenses
| Operation | Key | Actions | Status |
|---|---|---|---|
| CRUD | `expenses.*` | V,C,E,D | NEW |
| Approve | `expenses.approve` | A | NEW+PD-03 |
| Export | `expenses.export` | X | NEW |
| Categories mgmt | — | CF | AMBIG → fold into `expenses.configure` |

**Completeness 0 %** · **Readiness: BLOCKED (PD-03).**

## 8. Treasury
| Operation | Key | Actions | Status |
|---|---|---|---|
| Accounts CRUD + export | `treasury.*` | V,C,E,D,X | OK |
| Transfer | — | transfer | MISS-ACT → `treasury.transfer` |
| Daily close | — | close | MISS-ACT → `treasury.close` |
| Reopen close | — | reopen | MISS-ACT → `treasury.reopen` |

**Completeness 65 %** · **Readiness: MISSING ACTIONS.**

## 9. Inventory / Products / PO / Services / Suppliers
| Operation | Key | Actions | Status |
|---|---|---|---|
| Stock CRUD + export | `inventory.*` | V,C,E,D,X | OK |
| Products CRUD | `products.*` | V,C,E,D | NEW |
| Suppliers CRUD | — | V,C,E,D | MISS → add `suppliers.*` (gap in v2) |
| PO CRUD + approve + receive | `purchase_orders.*` | V,C,E,D,A, receive | NEW |
| PO cancel | — | cancel | MISS-ACT → `purchase_orders.cancel` |
| Services catalog | `services.view/.configure` | V, CF | NEW |
| Stock alerts | (`inventory.view`) | V | OK |

**Completeness 45 %** · **Readiness: MISSING PERMISSIONS + MISS-ACT.**

## 10. HR / Leave / Payroll / Performance / Attendance
| Operation | Key | Actions | Status |
|---|---|---|---|
| Staff master CRUD | `hr.*` | V,C,E,D,X | OK |
| Positions / departments / branch assignment | `hr.edit` | E | AMBIG → prefer `hr.configure` for taxonomy tables |
| Leave request / approve / cancel | `hr_leave.*` | V, request, A, cancel | NEW |
| Payroll run / adjust / export | `payroll.*` | V, run, adjust, X | NEW+PD-04 |
| Payroll approve (dual-control) | — | approve | MISS-ACT → `payroll.approve` |
| Performance reviews | `performance.*` | V,C, submit, A | NEW |
| Attendance | `attendance.*` | V, log, E | NEW |
| Work schedules | — | V,C,E | MISS → fold under `attendance.configure` |

**Completeness 30 %** · **Readiness: BLOCKED (PD-04) + MISSING PERMISSIONS.**

## 11. Reports
| Operation | Key | Actions | Status |
|---|---|---|---|
| Domain report V/X (5 domains) | `reports_<dom>.*` | V,X | OK |
| Umbrella `reports.view/.export` | — | — | DEPRECATED (N4) |
| Saved reports | — | C,E,D | MISS → `saved_reports.*` |
| Scheduled reports | — | C,E,D | MISS → `report_schedules.*` |
| Commissions / doctor perf | `reports_medical.view` | V,X | OK |

**Completeness 70 %** · **Readiness: MISSING PERMISSIONS.**

## 12. Notifications / Communication / Reminders
| Operation | Key | Actions | Status |
|---|---|---|---|
| Compose / send | `communication.compose/.send` | SP | NEW |
| Manage templates | `communication.configure` | CF | NEW |
| Reminder rules | `communication.configure` | CF | OK (folded) |
| View notifications | `notifications.view` | V | NEW |
| Prefs | `notifications.configure` | CF | NEW |

**Completeness 0 %** · **Readiness: MISSING PERMISSIONS (no PD).**

## 13. Insurance / Coupons / Loyalty / Wallet
| Operation | Key | Actions | Status |
|---|---|---|---|
| Insurers/contracts CRUD | `insurance.*` | V,C,E,D | NEW |
| Contract rules | (`insurance.edit`) | E | OK (folded) |
| Coupons CRUD + export | `coupons.*` | V,C,E,D,X | OK |
| Coupon redemption | — | redeem | MISS-ACT → `coupons.redeem` |
| Loyalty | `loyalty.*` | V, CF | NEW |
| Wallet | `patient_wallet.*` | V, credit, debit | NEW+PD-05 |

**Completeness 55 %** · **Readiness: BLOCKED (PD-05) + MISS-ACT.**

## 14. System / Settings / Governance
| Operation | Key | Actions | Status |
|---|---|---|---|
| Clinic / branches / languages / specialties | `settings.*` | V,C,E,D,X | OK |
| Role & bundle mgmt | `settings.edit` | E | AMBIG → add `authz.manage` (admin-only) |
| User mgmt (create/reset/delete) | `settings.edit` | E | UMBRELLA → `users.create/.reset_password/.delete` |
| Backup / restore | `settings.export` | X | UMBRELLA → `system.backup/.restore` |
| Import data | — | import | MISS-ACT → `system.import` |
| SaaS billing | `saas_billing.*` | V, manage | NEW |

**Completeness 50 %** · **Readiness: MISSING PERMISSIONS.**

## 15. Audit
| Operation | Key | Actions | Status |
|---|---|---|---|
| Read audit + activity logs | `audit.read` | V | NEW (replaces UMBRELLA `settings.export`) |
| Export audit | — | X | MISS-ACT → `audit.export` |

**Completeness 30 %** · **Readiness: MISSING PERMISSIONS.**

---

## 16. Authorization Completeness Score (by domain)
| Domain | Score |
|---|---|
| Appointments | 92 % |
| Patients | 70 % |
| Queue | 0 % |
| Clinical | 55 % |
| Invoices | 60 % |
| Payments | 0 % |
| Expenses | 0 % |
| Treasury | 65 % |
| Inventory/PO/Services | 45 % |
| HR/Leave/Payroll | 30 % |
| Reports | 70 % |
| Notifications/Communication | 0 % |
| Insurance/Coupons/Loyalty/Wallet | 55 % |
| System / Governance | 50 % |
| Audit | 30 % |
| **System-wide (weighted by BO volume)** | **≈ 44 %** |

## 17. Implementation Readiness
| Domain | Readiness |
|---|---|
| Appointments | READY (post N1-INSERT) |
| Patients | MISSING PERMISSIONS |
| Queue | MISSING PERMISSIONS |
| Clinical | MISSING PERMISSIONS + MISSING ACTIONS |
| Invoices | NEEDS PRODUCT DECISION (PD-01) |
| Payments | BLOCKED (PD-01, PD-02) |
| Expenses | BLOCKED (PD-03) |
| Treasury | MISSING ACTIONS |
| Inventory/PO/Services | MISSING PERMISSIONS |
| HR/Payroll/Performance | BLOCKED (PD-04) |
| Reports | MISSING PERMISSIONS |
| Notifications/Communication | MISSING PERMISSIONS |
| Insurance/Coupons/Loyalty/Wallet | BLOCKED (PD-05) |
| System/Governance | MISSING PERMISSIONS |
| Audit | MISSING PERMISSIONS |

## 18. Detected Anti-patterns
- **Umbrella overloads:** `settings.export` on audit + backup tables; `reports.view/.export` covering domain reports.
- **Overloaded keys:** `settings.edit` gates authz/user mgmt AND generic clinic settings.
- **Missing verbs (system-wide):** void, cancel, close, reopen, refund, sign, amend, archive, restore, import, redeem, transfer, merge.
- **Ambiguous grouping:** work_schedules, expense_categories, insurance_contract_rules, staff_positions/branches/departments — fold-vs-split decision required.
- **Competing permissions:** audit tables reachable via BOTH `settings.export` and future `audit.read` — retire former same wave.
- **Nurse bundle orphan:** `bundle.role.nurse` exists but not bound (N2 finding still open).
- **Never-referenced permissions:** none once umbrella `reports.*` retired (N4).

## 19. Recommended Catalog Additions Beyond Taxonomy v2 (net-new)
1. `appointments.cancel`
2. `patients.merge`, `patients.archive`, `patients.restore`
3. `medical_records.sign`, `medical_records.amend`
4. `prescriptions.sign`, `prescriptions.print`
5. `treatment_plans.approve`, `treatment_plans.close`
6. `invoices.void`, `invoices.reopen`
7. `payments.void`
8. `treasury.transfer`, `treasury.close`, `treasury.reopen`
9. `purchase_orders.cancel`
10. `suppliers.view/.create/.edit/.delete`
11. `payroll.approve`
12. `coupons.redeem`
13. `saved_reports.view/.create/.edit/.delete`
14. `report_schedules.view/.create/.edit/.delete`
15. `authz.manage`
16. `users.create`, `users.reset_password`, `users.delete`
17. `system.backup`, `system.restore`, `system.import`
18. `audit.export`

**Net additions: ~34 keys → Taxonomy v2.1 total = 185 keys (151 + 34).**

---

## 20. FINAL IMPLEMENTATION CHECKLIST
Everything below MUST be complete **before** any `INSERT INTO authz_permissions`.

### A. Governance sign-off
- [ ] Board resolves PD-01 (manager invoice authority)
- [ ] Board resolves PD-02 (refund authority)
- [ ] Board resolves PD-03 (expense approval)
- [ ] Board resolves PD-04 (payroll dual-control)
- [ ] Board resolves PD-05 (patient wallet operators)
- [ ] Board approves N6 anti-pattern retirements (umbrella keys)

### B. Catalog freeze
- [ ] Ratify Taxonomy v2.1 (185 keys)
- [ ] Update `PERMISSION_STATUS_REGISTER.md` with 34 additions
- [ ] Update `OWNERSHIP_MATRIX.md` with owners for new verbs (sign/amend/void/…)
- [ ] Append v2.1 addendum to `N1_PERMISSION_TAXONOMY_V2.md`

### C. Bundle intent
- [ ] Resolve N2 nurse bundle binding
- [ ] Draft bundle diffs per P0/P1 role reflecting v2.1
- [ ] Board-approve bundle diffs (C2 change class)

### D. Frontend & backend audit (no code change yet)
- [ ] Inventory `Can` / `useAuthorization` usages impacted by v2.1
- [ ] Inventory edge functions still calling `has_role()` directly

### E. Safety nets
- [ ] Re-snapshot Golden Authorization Baseline
- [ ] Regression harness green
- [ ] Rollback SQL template prepared for N1-INSERT batch

### F. Sequencing gate
- [ ] All A–E ✅ → N1-INSERT may proceed
- [ ] N1-INSERT restricted to additive rows only
- [ ] N2-BIND-NURSE + N2-INTENT-DECISIONS follow in separate migrations

**Until every checkbox above is ✅, no permission catalog insertion may occur.**

---

## 21. Stop Condition
Documentation complete. No code, SQL, catalog, bundle, or policy changes performed.
Next actionable step: **Board review of PDs 01–05 and ratification of Taxonomy v2.1.**
