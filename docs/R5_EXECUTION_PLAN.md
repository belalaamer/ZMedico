# R5 — RLS Migration Execution Plan

**Status:** Ratified execution plan. Documentation only. No SQL, migration, RLS, function, bundle, permission, catalog, role, frontend, or backend change is performed by this document.
**Effective:** This is the **only allowed implementation order** for R5. Any deviation requires a full-quorum Board amendment recorded in `docs/governance/CHARTER_HISTORY.md`.
**Governing standards:** `docs/AUTHORIZATION_STANDARDS.md` (constitution), `docs/wave3d/WAVE3D_AUTHORIZATION_PATTERN_CATALOG.md` (pattern taxonomy P1–P12), `docs/execution/runtime/R4_5/RUNTIME_READINESS_CERTIFICATION.md` (readiness conditions).

---

## 0. Preconditions (already satisfied by R4.5)

- R1–R4 complete; canonical stack (`has_permission(auth.uid(), key)`) live.
- Guardrails run in CI with `GUARDRAILS_STRICT=1`.
- Golden Baseline snapshot tagged and checksummed.
- `scripts/authz/intentional_changes.txt` labelling protocol in effect.
- Two-phase recipe (`add has_permission OR-branch → soak 24h → drop has_role`) adopted for Ownership/Branch/Compound patterns.
- Final batch reserved exclusively for state-machine policies (§5 rule of `AUTHORIZATION_STANDARDS.md` §6).

If any precondition regresses, R5 must halt and re-certify.

---

## 1. Scope

Remaining RLS policies to migrate = **358** (of 424 inventoried in Wave 3D; 66 already done in Waves 3, 3a, 3e batch A).

Distribution by pattern (from Wave 3D catalog + delta since):

| Pattern | Remaining | Risk archetype |
|---|---:|---|
| P1 Admin Permission Gate | 34 | Low |
| P3 Branch Isolation (RESTRICTIVE) | 0 (ratified as-is; skipped) | — |
| P4 Manager Branch Equality | 62 | Low–Medium |
| P5 Permission + Branch (Compound) | 118 | Medium |
| P6 Ownership (Self-row) | 41 | Medium |
| P7 Ownership + Branch | 44 | Medium–High |
| P8 Stateful (business-state guard) | 38 | **High — reserved for final batch** |
| P9 Approval Chain | 9 | High — grouped with P8 |
| P10 Compliance / Audit-Read | 8 | Medium |
| P11 Infrastructure Counters | 0 (deferred; not user-facing) | — |
| P12 Legacy Public-Read | 4 | Low (retire, don't rewrite) |

Total to migrate in R5: **358 policies across 8 batches**.

---

## 2. Batch Design Rules

Every batch MUST satisfy, in this order:

1. **Independent rollback** — the batch ships with its own `ROLLBACK.sql` reverting only its own policies; no cross-batch dependency.
2. **Zero authorization drift** — every rewrite is proven semantically equivalent under the Golden Baseline (0 decision diff or labelled intentional).
3. **Golden Baseline verification** — `scripts/authz/diff_baseline.py` returns 0 or an intentional-changes entry.
4. **Regression harness verification** — `scripts/authz/run_all.sh` green with `GUARDRAILS_STRICT=1`.
5. **CI pass** — including guardrails backend/frontend, RPC manifest, permission naming (`AUTHORIZATION_STANDARDS.md` §1.1).
6. **Production-safe deployment** — two-phase recipe applied where the pattern requires it; ≥24h soak between phase 1 and phase 2.

Batches are ordered lowest to highest risk. **B8 is exclusively state-machine.**

---

## 3. Batches

### B1 — P12 Legacy Public-Read Retirement
- **Policies affected (4):** `system_languages` public-read, `medical_specialties` public-read, `subscription_plans` public-read, `service_categories` public-read.
- **Permission keys:** `settings.language.view`, `settings.specialty.view`, `saas_billing.plan.view`, `services.category.view` (all Active).
- **Change:** Drop `USING (true)`; replace with `has_permission(auth.uid(), <key>)`. Keep `anon` GRANT only where product confirms public catalog exposure.
- **Dependencies:** None. Grandfathered two-segment keys allowed (Standards §1.4).
- **Risk:** **Low**. Behavior change is intentional (from anon-readable to authenticated-permissioned); labelled in `intentional_changes.txt`.
- **Rollback:** `docs/execution/runtime/R5/B1_ROLLBACK.sql` — restore `USING (true)` policies verbatim.
- **Regression tests:** Anonymous smoke (should now 401 on these tables); authenticated user with view key succeeds; harness rerun.
- **Harness delta:** +4 policy rewrites, expected labelled non-zero diff on anon rows only.
- **Performance:** Neutral; single `has_permission` call ≤0.4ms.

### B2 — P1 Admin Permission Gate Sweep
- **Policies affected (34):** all remaining `has_role(auth.uid(),'admin')` policies on `authz_*`, `tenants`, `subscription_addons`, `tenant_addons`, `tenant_usage`, `system_backups`, `allowed_signup_emails`, `report_templates`, `report_schedules`, `clinic_profile`, `clinic_settings`, `insurance_*` (admin-managed subset), `medical_specialties` (write), `system_languages` (write), `loyalty_settings`, `notification_settings`, `queue_settings`, `queue_alerts` (admin subset), `queue_alert_runs`.
- **Permission keys:** `settings.<resource>.<verb>` and `saas_billing.<resource>.<verb>` — all Active.
- **Change:** Substitute `has_role(...,'admin')` with `has_permission(auth.uid(), <key>)`. Semantic equivalence proved because the admin bundle already grants every settings key.
- **Dependencies:** B1 (retires P12 first to avoid overlap on settings tables).
- **Risk:** **Low**. One-for-one substitution; admin bundle superset guaranteed.
- **Rollback:** `B2_ROLLBACK.sql` — restore `has_role(...,'admin')` predicates.
- **Regression tests:** Admin user CRUD across all 34 policies; non-admin denied; harness diff 0.
- **Harness delta:** 0 expected.
- **Performance:** Neutral or slight improvement (single indexed lookup vs role scan).

### B3 — P10 Compliance / Audit-Read
- **Policies affected (8):** `audit_logs` read, `user_activity_logs` read, `audit_export_presets` (4 policies), plus 2 export policies on `saved_reports`.
- **Permission keys:** `audit.log.read`, `audit.log.export`, `audit.preset.view|create|edit|delete`.
- **Change:** Substitute role-based reads with `has_permission`. DPO memo required (regulated data).
- **Dependencies:** B2 (admin key wiring stable).
- **Risk:** **Medium** (regulatory). Class C4 change requires DPO sign-off per Charter §5.
- **Rollback:** `B3_ROLLBACK.sql`.
- **Regression tests:** DPO test matrix — auditor role reads succeed, non-auditor denied, admin retains override, export logged.
- **Harness delta:** 0 expected.
- **Performance:** Neutral.

### B4 — P4 Manager Branch Equality
- **Policies affected (62):** manager/coordinator branch-scoped reads across `staff_profiles`, `staff_positions`, `staff_branches`, `departments`, `work_schedules`, `leave_types`, `attendance` (read subset), `payroll` (read subset), `performance_reviews` (read subset), `doctor_commissions` (read subset), `salary_adjustments`, `staff_targets`, `queue_alerts` (branch subset).
- **Permission keys:** `hr.staff.view`, `hr.staff.edit`, `hr_leave.request.view`, `attendance.log.view`, `payroll.run.view`, `performance.review.view`, plus scope-friendly `.list` variants where required.
- **Change:** Apply two-phase recipe:
  - Phase 1 (Day 1): Add `has_permission` OR-branch alongside existing `has_role`.
  - Phase 2 (Day ≥2, after ≥24h green): Drop `has_role` branch.
- **Dependencies:** B2 (settings admin surface stable).
- **Risk:** **Medium**. Branch scope preserved as separate clause; AUTHZ ∧ STATE-of-scope split enforced.
- **Rollback:** `B4_ROLLBACK.sql` reverts both phases in one script.
- **Regression tests:** Manager in branch A cannot read branch B; permission-holder without branch scope denied by RESTRICTIVE isolation.
- **Harness delta:** 0 expected (soak proves parity).
- **Performance:** +≤0.2ms during OR-phase; neutral after phase 2.

### B5 — P5 Permission + Branch (Compound)
- **Policies affected (118):** all remaining `has_role AND branch = ...` compound policies across `appointments`, `invoices`, `invoice_items`, `payments`, `payment_methods`, `expenses`, `expense_categories`, `treasury`, `treasury_transactions`, `treasury_daily_closes`, `inventory`, `inventory_transactions`, `stock_alerts`, `products`, `product_categories`, `purchase_orders`, `purchase_order_items`, `suppliers`, `services`, `service_consumables`, `coupons`, `coupon_redemptions`, `reminders`, `notifications` (branch subset), `communication_templates` (branch subset).
- **Permission keys:** `<domain>.<resource>.<verb>` across appointments, invoices, payments, expenses, treasury, inventory, products, purchase_orders, services, coupons, communication.
- **Change:** Two-phase recipe. Every policy rewritten as:
  ```
  USING (
    -- AUTHZ
    has_permission(auth.uid(), '<key>')
    AND
    -- SCOPE
    branch_id = ANY (public.user_branches(auth.uid()))
  )
  ```
- **Dependencies:** B4 (manager scope helper migration proven).
- **Risk:** **Medium**. Largest batch; split into 4 sub-batches by domain (B5a Finance, B5b Inventory/Procurement, B5c Scheduling, B5d Communication) each independently rollback-able.
- **Rollback:** `B5a..d_ROLLBACK.sql`.
- **Regression tests:** Per-domain matrix from Golden Baseline; cross-branch denial; cross-tenant denial via RESTRICTIVE.
- **Harness delta:** 0 expected.
- **Performance:** Neutral; scope helper is STABLE and indexed.

### B6 — P6 Ownership (Self-row)
- **Policies affected (41):** `profiles` (self), `notifications` (recipient), `leave_requests` (own), `attendance` (own), `saved_reports` (owner), `audit_export_presets` (owner), `patient_wallet_transactions` (own patient link via helper), `reminders` (assignee).
- **Permission keys:** `hr.staff.view` (self-scope N/A stage), `hr_leave.request.view`, `attendance.log.view`, `reports.saved.view`, plus new: `notifications.notification.view` (self).
- **Change:** AUTHZ ∧ OWNERSHIP split — permission clause + `owner_id = auth.uid()` clause, no role checks. Two-phase.
- **Dependencies:** B5 (compound helpers proven).
- **Risk:** **Medium**. Ownership predicate is now a first-class stage (Standards §5). Any missing ownership column blocks the row and requires product decision — flagged pre-batch.
- **Rollback:** `B6_ROLLBACK.sql`.
- **Regression tests:** Own-row read succeeds, other-user row denied; admin superuser override preserved via bundle.
- **Harness delta:** 0 expected.
- **Performance:** Neutral.

### B7 — P7 Ownership + Branch
- **Policies affected (44):** `patients` (assigned doctor), `medical_records` (author or attending), `medical_history`, `vital_signs`, `prescriptions` (prescriber), `prescription_items`, `treatment_plans` (attending), `treatment_sessions`, `dental_chart`, `record_diagnoses`, `record_procedures`, `patient_documents` (uploader or attending), `physio_cases` (assigned), `physio_sessions`, `physio_reassessments`, `doctor_commissions` (self subset).
- **Permission keys:** `medical_records.record.view|edit|create|delete|export`, `patients.patient.view|edit|export`, `physio.case.view|edit|create|delete|close|reassess`, `prescriptions.prescription.*`.
- **Change:** Three-stage clause per policy — AUTHZ (`has_permission`) ∧ SCOPE (branch) ∧ OWNERSHIP (`assigned_doctor_id = auth.uid()` OR bundle-authorised viewer). Two-phase migration; add-then-soak-then-drop.
- **Dependencies:** B5 (branch scope helper), B6 (ownership pattern proven).
- **Risk:** **Medium–High**. Clinical data. DPO memo required (regulated); C4 approval.
- **Rollback:** `B7_ROLLBACK.sql`.
- **Regression tests:** Attending doctor sees assigned patients only; reception with `patients.patient.view` sees roster without clinical detail; cross-branch denied; admin unaffected.
- **Harness delta:** 0 expected.
- **Performance:** +≤0.3ms during OR-phase; neutral after.

### B8 — P8 Stateful + P9 Approval Chain (final, exclusive)
- **Policies affected (47):** `invoices` (status ≠ paid/void guards), `payments` (refund window), `expenses` (approval chain, 3 policies), `leave_requests` (workflow states, 3 policies), `performance_reviews` (submit/approve chain), `purchase_orders` (draft/approved/received chain, 4 policies), `treasury_daily_closes` (open/closed), `physio_cases` (open/closed transitions), `treatment_plans` (draft/active/completed), `treatment_sessions` (locked-after-completion), `prescriptions` (dispensed lock), `payroll` (locked-after-run), `queue_alert_runs` (append-only), `authz_versions` (append-only), plus 9 approval-chain policies (`expenses.approve`, `purchase_orders.approve`, `leave_requests.approve`, `performance_reviews.approve`, `invoices.approve`).
- **Permission keys:** `<domain>.<resource>.<verb>` plus dedicated `.approve` where required — every key must already be Active (verified pre-batch).
- **Change:** Enforce `AUTHZ ∧ STATE` rule (Standards §6). Every policy split as:
  ```
  USING (
    -- AUTHZ
    has_permission(auth.uid(), '<key>')
    AND
    -- STATE
    (<row state predicate>)
  )
  ```
  State predicates MUST NOT call `has_permission` or `has_role`.
- **Dependencies:** B7 complete AND ≥7-day soak with zero incident.
- **Risk:** **High**. State machines. C4 change, DPO sign-off required, quorum + Technical chair, freeze on other authz merges during window.
- **Rollback:** `B8_ROLLBACK.sql` per sub-domain (B8a Finance-state, B8b HR-state, B8c Clinical-state, B8d Procurement-state) so a single domain failure does not force a global revert.
- **Regression tests:** State transition matrix — every (state × action) cell tested; approval chain double-signature required; append-only tables reject UPDATE/DELETE.
- **Harness delta:** 0 expected; any diff blocks the merge.
- **Performance:** Neutral (state predicates are index-friendly).

---

## 4. Critical Path

```
B1 (P12 retire)
  └─► B2 (P1 admin sweep)
        └─► B3 (P10 audit)      [parallel-safe with B4]
        └─► B4 (P4 manager scope)
              └─► B5a Finance ─┐
                  B5b Inventory├─► B6 (Ownership) ─► B7 (Owner+Branch) ─► B8 (State+Approval)
                  B5c Scheduling│                                              ↑
                  B5d Comms ────┘                                              │
                                                                        soak ≥7d
```

**Critical path length:** B1 → B2 → B4 → B5 → B6 → B7 → soak → B8 = 8 sequential gates.
**Off-critical-path (parallelisable with B4):** B3.

---

## 5. Batch Dependency Graph

| Batch | Depends on | Blocks | May run in parallel with |
|---|---|---|---|
| B1 | — | B2 | — |
| B2 | B1 | B3, B4 | — |
| B3 | B2 | (none) | B4 |
| B4 | B2 | B5 | B3 |
| B5a | B4 | B6 | B5b, B5c, B5d |
| B5b | B4 | B6 | B5a, B5c, B5d |
| B5c | B4 | B6 | B5a, B5b, B5d |
| B5d | B4 | B6 | B5a, B5b, B5c |
| B6 | B5 (all) | B7 | — |
| B7 | B6 | B8 (via soak) | — |
| B8 | B7 + 7d soak | — | — (freeze) |

---

## 6. Estimated Timeline (working days)

| Batch | Prep | Phase 1 (add) | Soak | Phase 2 (drop) | Total |
|---|---:|---:|---:|---:|---:|
| B1 | 1 | 1 | 1 | — | 3 |
| B2 | 1 | 1 | 1 | — | 3 |
| B3 | 2 (DPO) | 1 | 2 | — | 5 |
| B4 | 2 | 1 | 2 | 1 | 6 |
| B5a | 2 | 1 | 2 | 1 | 6 |
| B5b | 2 | 1 | 2 | 1 | 6 (parallel B5a) |
| B5c | 2 | 1 | 2 | 1 | 6 (parallel) |
| B5d | 2 | 1 | 2 | 1 | 6 (parallel) |
| B6 | 2 | 1 | 3 | 1 | 7 |
| B7 | 3 (DPO) | 1 | 3 | 1 | 8 |
| Soak before B8 | — | — | 7 | — | 7 |
| B8 | 4 (DPO + freeze prep) | 2 | 3 | 2 | 11 |
| **Total (critical path)** | | | | | **~57 working days (≈12 weeks)** |

---

## 7. Recommended Deployment Order

1. **B1** — Monday of week 1; Wednesday cutover.
2. **B2** — Thursday week 1 → Monday week 2.
3. **B3** and **B4** in parallel starting week 2; B3 ships when DPO approves, B4 continues per two-phase.
4. **B5 sub-batches** launched together at start of week 4; each ships independently on completion of its own two-phase.
5. **B6** starts once all B5 sub-batches phase-2 merged.
6. **B7** week 8; DPO sign-off gate before phase 1.
7. **Soak** week 10 (mandatory 7-day quiet window; no other authz merges).
8. **B8** week 11; freeze on unrelated authz PRs; DPO + full quorum; sub-domains B8a→B8d shipped in-order over the week.

Every merge lands early in the week (Mon–Wed) to allow same-week rollback if the harness detects drift.

---

## 8. Go / No-Go Criteria (evaluated before EVERY batch)

A batch may proceed only if **all** criteria are green. Any red → No-Go, batch blocked until remediated.

| # | Criterion | Signal |
|---|---|---|
| 1 | Preceding batches complete and stable | Golden Baseline diff = 0 for ≥24h |
| 2 | Guardrails green | `scripts/authz/run_all.sh` exit 0 with `GUARDRAILS_STRICT=1` |
| 3 | Regression harness green | `docs/AUTHORIZATION_REGRESSION_HARNESS.md` matrix pass |
| 4 | Golden Baseline snapshot fresh | Snapshot hash matches current `main`; drift labelled |
| 5 | Rollback artifact reviewed | `Bn_ROLLBACK.sql` opened, signed off by Technical chair |
| 6 | Permission keys Active | Every key in the batch is state `Active` in `authz_permissions` |
| 7 | Bundle bindings verified | Every consumer role holds the required bundle (coverage matrix check) |
| 8 | DPO sign-off if regulated | Required for B3, B7, B8 |
| 9 | Freeze window declared if High risk | Required for B8; announced in weekly digest |
| 10 | On-call engineer identified | Named responder for the 24–72h post-merge window |
| 11 | Two-phase soak completed | ≥24h between phase 1 and phase 2 (≥7d before B8) |
| 12 | AUTHZ ∧ STATE split verified | Every policy in the batch passes the split linter (Standards §6, CI blocker §9-13) |
| 13 | No open Sev-1 or Sev-2 authz incidents | Incident register clean |
| 14 | PR checklist complete | 20/20 boxes ticked (Standards §Authorization Contract) |

---

## 9. Rollback Doctrine

- Every batch ships `docs/execution/runtime/R5/Bn_ROLLBACK.sql` reverting only its own policies.
- Sub-batches (B5a–d, B8a–d) each own their own file — never share.
- Rollback restores the previous policy text verbatim from the pre-batch snapshot captured in the migration description.
- After rollback: harness re-run, Golden Baseline re-verified, incident post-mortem within 48h, batch re-planned before retry.
- **No batch may be re-attempted without a written post-mortem and Board acknowledgment.**

---

## 10. Metrics & Reporting

Weekly Board digest during R5 MUST report:

- Batches merged vs planned.
- Cumulative RLS migration coverage (% of 424).
- Golden Baseline diff count (labelled vs unlabelled — unlabelled must be 0).
- Harness pass rate.
- Any rollback executed (with post-mortem link).
- Open PDs blocking upcoming batches.

Success criterion for R5 completion: **100% of 358 policies migrated, 0 unlabelled baseline diff, all rollbacks archived, no open Sev-≥2 authz incidents.**

---

*This document is the sole authoritative execution order for R5. Any change to batch composition, ordering, or gates requires a full-quorum Board amendment recorded in `docs/governance/CHARTER_HISTORY.md`.*
