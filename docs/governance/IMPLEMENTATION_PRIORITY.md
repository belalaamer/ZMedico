# Implementation Priority (Business-Criticality Order)

This ranking replaces the earlier technical grouping (patterns P4→P9). It sequences work by *business risk of the gap remaining*, not by SQL similarity.

## 1. Priority Tiers

### P0 — Regulatory & Financial Integrity (start immediately once PDs land)
Business rationale: unresolved gaps here create direct legal, financial, or licensing exposure.

1. **PD-02 Payments refund authority** → catalog + RLS for `payments.*`
   - Why: PCI-DSS-adjacent, currently no key = no auditable control on refunds.
2. **PD-04 Payroll run authority** → catalog + RLS for `payroll.*`
   - Why: tax/SOX; unauthorized payroll = material misstatement.
3. **PD-06 Compliance role + `audit.read`** → repoint audit_logs / user_activity_logs
   - Why: HIPAA/GDPR audit rights currently misgated via `settings.export`.
4. **Documents family** (`documents.view/upload/delete`)
   - Why: patient PHI attachments; no gate today.

### P1 — Clinical Safety
5. **PD-07 Prescription dispense** → `prescriptions.*`
   - Why: controlled-substance recordkeeping.
6. **Diagnoses & procedures** (`diagnoses.*`, `procedures.*`, `dental.*`)
   - Why: clinical accuracy of the record.
7. **Physio workflow** (`physio.*`)

### P2 — Financial Operations (unblock Wave 3E completion)
8. **PD-01 Manager invoice authority** → bundle update, then RLS
9. **PD-03 Expense approval** → `expenses.*`
10. **PD-05 Patient wallet** → `patient_wallet.*`
11. **Insurance** (`insurance.*`)

### P3 — People Operations
12. **HR leave workflow** (`hr_leave.*`) — Pattern P9
13. **Performance reviews** (`performance.*`) — Pattern P9
14. **Attendance** (`attendance.*`)

### P4 — Operations Efficiency
15. **Queue** (`queue.*`)
16. **Communication** (`communication.*`) — pending PD-08
17. **Notifications** (`notifications.*`)
18. **Purchase orders** (`purchase_orders.*`) — Pattern P9
19. **Products & services** (`products.*`, `services.*`)

### P5 — Reporting Hygiene
20. **Deprecate umbrella `reports.view/export`** — PD-10
21. **`reports_<domain>` gap-fill** (hr, inventory, medical export UIs)

### P6 — Platform
22. **`saas_billing.*`** — pending PD-09
23. **Loyalty** (`loyalty.*`)

## 2. Sequencing Constraint Matrix

| Priority | Depends on | Unblocks |
|---|---|---|
| P0-1 (payments) | PD-02 | Wave 3E-C, Wave 3F |
| P0-2 (payroll) | PD-04 | Wave 3H part |
| P0-3 (audit) | PD-06 | Wave 3F.2 |
| P0-4 (documents) | — | Wave 3G (ownership) |
| P1 clinical | — | Wave 3G/3H clinical |
| P2 (finance) | PD-01, PD-03, PD-05 | Rest of Wave 3E |
| P3 (people) | — | Wave 3H approvals |
| P4 ops | PD-08 for communication | Wave 3F |
| P5 hygiene | PD-10 | Cleanup |
| P6 platform | PD-09 | SaaS wave |

## 3. Recommended Execution Calendar

Assuming Board can decide PDs on a bi-weekly cadence:

| Sprint | Board actions | Engineering actions |
|---|---|---|
| S1 | Decide PD-02, PD-04, PD-06 | Draft insert SQL for P0 keys (no execute) |
| S2 | Ratify P0 catalog additions; execute N1-INSERT scoped to P0 | Bundle-bind P0 keys; harness re-baseline |
| S3 | Decide PD-01, PD-03, PD-05 | Execute Wave 3E Batch B (manager invoices) if PD-01 = A |
| S4 | Ratify P1 catalog additions | Wave 3E Batch C (expenses/payments) |
| S5 | Decide PD-07, PD-08 | Wave 3F (P5 permission+branch) starts |
| S6 | Decide PD-09, PD-10 | Wave 3G (ownership) begins |
| S7–S8 | Deprecation window opens on umbrella keys | Wave 3H (state + approval) |
| S9 | Retire umbrella keys | Final audit; readiness score ≥ 90 |

## 4. Non-negotiables

- No P2/P3/P4 work merges before P0 keys are in the catalog (regulatory-first).
- No RLS wave restarts until Migration Readiness Score ≥ 75 (per N5).
- Every merge carries a Golden Baseline diff and a rollback file.
