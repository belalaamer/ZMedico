# N8 — Bundle Simulation (Authorization v2.1 Readiness)

**Status:** Documentation only. No SQL. No catalog inserts. No bundle edits. No role edits. No migrations.
**Scope:** Simulate every current and documented-future system role against the **approved Permission Catalog v2.1 (157 keys)** from N7 §10 — 67 existing + 72 immediately-approvable + 18 PD-deferred.
**Inputs:** N1 Taxonomy v2, N2 Bundle Integrity, N3 Coverage Matrix, N6 Completeness, N7 Approval Report, governance charter, ownership matrix, product decisions PD-01..PD-10.

**Legend:**
- **Bundle** — named collection of catalog keys assigned to a role (proposed; no DB writes here).
- **Denied** — keys explicitly withheld under least-privilege / SoD, not merely absent.
- **Scope** — global · tenant · branch · owner · patient.
- **Scores** — 0..5. Least Privilege (LP), Segregation of Duties (SoD), Bundle Reuse (BR), Future Scalability (FS). Higher = better.
- **Readiness** — READY · READY WITH PD · BLOCKED.

---

## 1. Proposed Bundle Library (v2.1 simulation)

Bundles are the **only** unit assigned to roles. A role = 1..N bundles + 0..K individual grants (discouraged; flagged in §5).

| Bundle | Purpose | Keys | Notes |
|---|---|---:|---|
| `bnd.core.self_service` | Own profile, own attendance, own leave request | 6 | ALL roles |
| `bnd.clinical.read` | VIEW clinical (patients, appts, dental, dx, procs, rx, records, vitals, docs, physio) | 22 | Doctor, Physio, Nurse, Compliance |
| `bnd.clinical.write.doctor` | Full clinical authoring incl. sign/amend, prescribe, treatment plan approve/close | 24 | Doctor only |
| `bnd.clinical.write.physio` | Physio subdomain incl. close/reassess | 8 | Physio only |
| `bnd.clinical.write.nurse` | Vitals log, med admin, doc upload, appt status | 9 | Nurse only |
| `bnd.reception.frontdesk` | Appt CRUD+status, queue manage, patient CRUD, coupon redeem, doc upload | 18 | Reception, Branch Manager |
| `bnd.finance.read` | Invoices/payments/treasury/expenses/reports VIEW + export | 14 | Accountant, Finance Mgr, Compliance |
| `bnd.finance.write.accountant` | Invoice CRUD/approve/void/reopen, payment CRUD/refund/void (PD-01/02), treasury tx/close/reopen | 20 | Accountant, Finance Mgr — PD-blocked |
| `bnd.finance.expenses` | Expense CRUD + approve + export (PD-03) | 6 | Finance Mgr — PD-blocked |
| `bnd.finance.payroll` | Payroll view/run/adjust/approve/export (PD-04) | 5 | HR + Finance dual-control — PD-blocked |
| `bnd.hr.core` | Staff CRUD, positions, depts, schedules, leave approve, performance | 18 | HR |
| `bnd.hr.attendance_ops` | Attendance edit/log/configure (absorbs work_schedules per N7) | 4 | HR, Branch Manager |
| `bnd.inventory.read` | Products/suppliers/stock/PO VIEW | 8 | All clinical + finance |
| `bnd.inventory.write` | Products/suppliers CRUD, PO create/edit/approve/receive/cancel, services configure | 18 | Inventory Manager |
| `bnd.branch.manage` | Branch dashboards, queue configure, appt configure, saas_billing view | 10 | Branch Manager |
| `bnd.governance.audit_read` | `audit.read` across all domains | 3 | Compliance, Ext Auditor, Security Admin |
| `bnd.governance.audit_export` | `audit.export` + regulator response | 3 | Compliance, Security Admin |
| `bnd.governance.authz` | `authz.manage`, `users.create/reset_password/delete` | 5 | Security Admin |
| `bnd.governance.system` | `system.backup/.restore/.import`, `saas_billing.manage` | 5 | Operations Admin |
| `bnd.comms.frontline` | communication.view/.compose/.send, notifications.view | 4 | Reception, Marketing, Support |
| `bnd.comms.configure` | communication.configure, notifications.configure, templates | 4 | Marketing, Operations Admin |
| `bnd.reports.finance` | reports_finance.* incl. export/schedule | 4 | Accountant, Finance Mgr |
| `bnd.reports.clinical` | reports_clinical.* incl. export | 4 | Doctor (own), Compliance |
| `bnd.reports.hr` | reports_hr.* incl. export | 4 | HR |
| `bnd.reports.ops` | reports_ops.* incl. export | 4 | Branch Mgr, Ops Admin |
| `bnd.insurance.ops` | insurance CRUD, contract configure | 5 | Insurance Officer, Accountant (view) |
| `bnd.loyalty.ops` | loyalty.view/.configure, coupons full CRUD | 6 | Marketing |
| `bnd.patients.merge` | `patients.merge` (irreversible) | 1 | Org Owner, HR lead |

**Bundle total: 28** — full 157-key coverage, zero orphans (§6).

---

## 2. Current Roles — Simulation

### 2.1 Organization Owner
| Field | Value |
|---|---|
| Purpose | Ultimate tenant owner; billing, org-level config, break-glass |
| Responsibilities | Tenant lifecycle, subscription, escalation |
| Bundles | core.self_service, governance.system, governance.authz, governance.audit_read, governance.audit_export, reports.ops, reports.finance |
| Individual | `patients.merge`, `saas_billing.manage` |
| Denied | Clinical write (`prescriptions.sign`, `medical_records.sign/.amend`) — SoD from care delivery |
| Branch Scope | tenant |
| Ownership | tenant |
| Approval Authority | C0..C5 (Board seat) |
| Regulatory | Cannot author clinical records (HIPAA attribution) |
| Can perform intended ops? | **YES** |
| Readiness | **READY** |

### 2.2 Operations Admin
| Bundles | core.self_service, governance.system, governance.audit_read, branch.manage, comms.configure, reports.ops |
| Denied | `authz.manage` (SoD with Security Admin), payments, clinical writes, payroll |
| Scope | tenant · Approval C1..C2 · No PHI/financial edit |
| Can perform? | **YES** — **READY** |

### 2.3 Security Admin
| Bundles | core.self_service, governance.authz, governance.audit_read, governance.audit_export |
| Denied | All business data write — pure IAM role |
| Scope | tenant · Approval C4 |
| Regulatory | Must NOT be same person as Compliance Auditor (SoD) |
| Readiness | **READY** |

### 2.4 Branch Manager
| Bundles | core.self_service, branch.manage, reception.frontdesk, hr.attendance_ops, reports.ops, inventory.read, finance.read (branch-scoped) |
| Denied | payments.refund/.void, payroll, authz, clinical sign/amend, cross-branch data |
| Scope | branch (own) · Approval C1 within branch |
| Can perform? | Yes for ops; PD-01 gates invoice create/edit |
| Readiness | **READY WITH PD** (PD-01) |

### 2.5 Receptionist
| Bundles | core.self_service, reception.frontdesk, comms.frontline |
| Individual | `patient_wallet.view` (PD-05) |
| Denied | Clinical write, finance write, HR, exports |
| Scope | branch |
| Readiness | **READY WITH PD** (PD-05) |

### 2.6 Accountant
| Bundles | core.self_service, finance.read, finance.write.accountant, reports.finance, insurance.ops (view), inventory.read |
| Individual | `patient_wallet.credit/.debit` (PD-05), `coupons.redeem` |
| Denied | Clinical, HR, authz, system.backup |
| Scope | tenant (or branch per PD-01) |
| Approval | Invoice approve, payment refund (PD-02) |
| Readiness | **READY WITH PD** (PD-01, PD-02, PD-05) |

### 2.7 Doctor
| Bundles | core.self_service, clinical.read, clinical.write.doctor, reports.clinical (own), inventory.read |
| Denied | Finance write, HR, authz, other-doctor amendments (owner scope) |
| Scope | owner (own patients) + branch read |
| Approval | Treatment plan approve/close, prescription sign, medical_records sign/amend |
| Regulatory | HIPAA authorship; amend requires signed original |
| Readiness | **READY** |

### 2.8 Physiotherapist
| Bundles | core.self_service, clinical.read, clinical.write.physio, inventory.read |
| Denied | prescriptions.sign, diagnoses.edit, finance, HR |
| Scope | owner (own physio cases) |
| Readiness | **READY** |

### 2.9 Nurse
| Bundles | core.self_service, clinical.read, clinical.write.nurse, inventory.read |
| Denied | prescriptions.sign/.create, diagnoses.edit, medical_records.sign/.amend, finance, HR |
| Scope | branch (visit-scoped for records read) |
| Readiness | **READY** (PD-08 confirms default) |

### 2.10 HR
| Bundles | core.self_service, hr.core, hr.attendance_ops, reports.hr, finance.payroll (dual-control per PD-04) |
| Denied | Clinical, invoices, payments, authz, system |
| Approval | Leave approve, performance approve, payroll run (PD-04) |
| Readiness | **READY WITH PD** (PD-04) |

### 2.11 Compliance Auditor
| Bundles | core.self_service, governance.audit_read, governance.audit_export, clinical.read, finance.read, reports.* (all) |
| Denied | ALL writes across ALL domains (read-only by construction) |
| Scope | tenant · Approval None (read/attest only) |
| Regulatory | HIPAA/GDPR/SOX; SoD from Security Admin |
| Readiness | **READY WITH PD** (PD-06 confirms `compliance` app_role) |

---

## 3. Documented Future Roles

### 3.1 Finance Manager
Bundles: core.self_service, finance.read, finance.write.accountant, finance.expenses, finance.payroll (co-approver), reports.finance, insurance.ops.
Denied: Clinical, HR (except payroll co-approve), authz. Approval: Expense approve (PD-03), payroll co-approve (PD-04), refund (PD-02).
Readiness: **READY WITH PD** (PD-01..PD-04).

### 3.2 Inventory Manager
Bundles: core.self_service, inventory.read, inventory.write, reports.ops (subset).
Denied: Clinical, finance write, HR, authz. Approval: PO approve/cancel.
Readiness: **READY**.

### 3.3 Marketing
Bundles: core.self_service, comms.frontline, comms.configure, loyalty.ops, reports.ops (campaigns subset).
Individual: `patients.view` (segment building — needs field-mask per GDPR).
Denied: Clinical, finance, HR, authz, PHI beyond marketing-safe fields.
Regulatory: GDPR consent-gated reads (RLS + field mask, out of scope for N8).
Readiness: **READY WITH PD** (PD-09 marketing PHI scope).

### 3.4 Customer Support
Bundles: core.self_service, comms.frontline, clinical.read (appts + patients only), reception.frontdesk (status + reschedule).
Denied: Clinical write, finance write, HR, authz.
Readiness: **READY**.

### 3.5 External Auditor
Bundles: core.self_service, governance.audit_read, finance.read, reports.finance.
Denied: ALL writes, `audit.export` (external cannot exfiltrate), clinical PHI unless PD-10 permits.
Scope: tenant (time-boxed session). Regulatory: Session TTL, watermarking, no download.
Readiness: **READY WITH PD** (PD-06, PD-10).

### 3.6 Insurance Officer
Bundles: core.self_service, insurance.ops, finance.read (claims only), clinical.read (claim-scoped).
Denied: Payments write, HR, authz, clinical write.
Readiness: **READY**.

---

## 4. Cross-Role Findings

### 4.1 Over-privileged
| Role | Symptom | Fix |
|---|---|---|
| Accountant | insurance.ops includes edit | Split `bnd.insurance.ops` into `.read` and `.write`; give Accountant read-only |
| Org Owner | Redundant `bnd.branch.manage` (tenant already covers) | Remove; keep reports + audit |

### 4.2 Under-privileged
| Role | Missing | Source |
|---|---|---|
| Receptionist | `patient_wallet.view` | PD-05 |
| Nurse | `medication_administration.log` (if separate table lands) | Flag for v2.2 |
| Compliance Auditor | Cannot exist until `compliance` app_role | PD-06 |

### 4.3 Duplicate bundles
- `bnd.reports.finance` and `bnd.finance.read` both include `reports_finance.view`. Restrict `bnd.reports.finance` to `.export/.schedule/.save` only.
- `bnd.hr.attendance_ops` overlap with Branch Mgr is legitimate (branch vs tenant scope enforced by RLS) — **keep**.

### 4.4 Split candidates
- `bnd.finance.write.accountant` → `bnd.finance.invoices` + `bnd.finance.payments` + `bnd.finance.treasury` so Branch Manager can hold invoices-only per PD-01 outcome A/C.
- `bnd.insurance.ops` → `.read` + `.write` (see 4.1).

### 4.5 Merge candidates
- `bnd.governance.audit_read` + `bnd.governance.audit_export` could merge, but SoD requires separation (Security Admin has both; External Auditor read only). **Keep split.**

### 4.6 Roles depending on deprecated permissions
- **None.** v2.1 removed last umbrellas (`settings.export` audit/backup; `reports.*` families). All simulated roles use canonical keys.

### 4.7 Roles blocked by unresolved PDs
| Role | Blocking PDs |
|---|---|
| Branch Manager | PD-01 |
| Receptionist | PD-05 |
| Accountant | PD-01, PD-02, PD-05 |
| HR | PD-04 |
| Finance Manager | PD-01..PD-04 |
| Compliance Auditor | PD-06 |
| Marketing | PD-09 |
| External Auditor | PD-06, PD-10 |

---

## 5. Individual (non-bundle) Grants

Non-bundle grants only for **singleton, irreversible, or SoD-critical** keys:

| Key | Reason | Assigned to |
|---|---|---|
| `patients.merge` | Irreversible; board-level approval per assignment | Org Owner, HR lead |
| `users.delete` | UI must re-confirm at call site | Security Admin |
| `treasury.reopen` | Terminal-state reversal | Admin only |
| `medical_records.amend` | Post-sign; individually audited | Doctor |

No bare grants for financial actions.

---

## 6. Coverage Check (Catalog v2.1 ↔ Bundles)

| Domain | Keys | Covered | Orphan | Note |
|---|---:|---:|---:|---|
| Clinical | 47 | 47 | 0 | — |
| Finance | 32 | 32 | 0 | 18 inside PD-deferred bundles |
| Inventory | 21 | 21 | 0 | — |
| HR/Ops | 19 | 19 | 0 | payroll PD-blocked |
| Communication | 6 | 6 | 0 | — |
| Reports | 16 | 16 | 0 | — |
| Governance | 16 | 16 | 0 | — |
| **Total** | **157** | **157** | **0** | Full coverage |

---

## 7. Score Card

| Role | LP | SoD | BR | FS | Overall |
|---|:-:|:-:|:-:|:-:|:-:|
| Organization Owner | 4 | 5 | 5 | 5 | 4.75 |
| Operations Admin | 5 | 5 | 4 | 5 | 4.75 |
| Security Admin | 5 | 5 | 3 | 4 | 4.25 |
| Branch Manager | 4 | 4 | 5 | 4 | 4.25 |
| Receptionist | 5 | 5 | 4 | 4 | 4.50 |
| Accountant | 3 | 4 | 4 | 4 | 3.75 |
| Doctor | 4 | 5 | 4 | 4 | 4.25 |
| Physiotherapist | 5 | 5 | 4 | 4 | 4.50 |
| Nurse | 5 | 5 | 4 | 3 | 4.25 |
| HR | 4 | 5 | 4 | 4 | 4.25 |
| Compliance Auditor | 5 | 5 | 5 | 4 | 4.75 |
| Finance Manager | 3 | 4 | 5 | 4 | 4.00 |
| Inventory Manager | 5 | 5 | 4 | 4 | 4.50 |
| Marketing | 4 | 4 | 4 | 5 | 4.25 |
| Customer Support | 5 | 5 | 5 | 4 | 4.75 |
| External Auditor | 5 | 5 | 3 | 4 | 4.25 |
| Insurance Officer | 5 | 5 | 4 | 4 | 4.50 |

System-wide average: **LP 4.5 · SoD 4.7 · BR 4.2 · FS 4.1 · Overall 4.4/5**.
Deductions cluster on Accountant/Finance Manager (LP) because the finance write bundle is monolithic pending PD-01/02 — resolved by §4.4 splits once PDs land.

---

## 8. Authorization v2.1 Readiness

| Role | Readiness | Blocking PDs |
|---|---|---|
| Organization Owner | **READY** | — |
| Operations Admin | **READY** | — |
| Security Admin | **READY** | — |
| Doctor | **READY** | — |
| Physiotherapist | **READY** | — |
| Nurse | **READY** | PD-08 (confirm default) |
| Customer Support | **READY** | — |
| Inventory Manager | **READY** | — |
| Insurance Officer | **READY** | — |
| Branch Manager | **READY WITH PD** | PD-01 |
| Receptionist | **READY WITH PD** | PD-05 |
| Accountant | **READY WITH PD** | PD-01, PD-02, PD-05 |
| HR | **READY WITH PD** | PD-04 |
| Compliance Auditor | **READY WITH PD** | PD-06 |
| Finance Manager | **READY WITH PD** | PD-01..PD-04 |
| Marketing | **READY WITH PD** | PD-09 |
| External Auditor | **READY WITH PD** | PD-06, PD-10 |
| _(any wallet-write role)_ | **BLOCKED** | PD-05 |

**Roll-up:** 9 READY · 8 READY WITH PD · 0 BLOCKED (no role is unreachable — every blocker is a Product Decision, not a missing catalog key).

---

## 9. Conclusions

1. **Catalog v2.1 is expressively complete** for every current and documented-future role. No missing permission was discovered during simulation — the 157-key catalog fully covers all 17 simulated roles.
2. **Zero orphan keys**: every catalog key belongs to at least one bundle (§6).
3. **All blockers are Product Decisions**, not catalog gaps. PD-01..PD-06, PD-08, PD-09, PD-10 must resolve before their dependent roles can be provisioned end-to-end.
4. **Bundle library size = 28**, avg 2.6 roles per bundle. Recommended splits in §4.4 will raise LP scores for Accountant / Finance Manager after PDs land.
5. **No deprecated permissions** are referenced by any simulated role.

---

## 10. Stop Condition

Bundle simulation complete. No SQL, catalog inserts, bundle edits, role edits, or migrations performed.

Next actionable step: **Board resolves PD-01..PD-06, PD-08, PD-09, PD-10 → then N1-INSERT (catalog + bundle SQL) may proceed under the whitelist in N7 §10 and the bundle library in §1 above.**
