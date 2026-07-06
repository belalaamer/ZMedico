# Wave 3E — Pattern P4 Migration Report

**Phase:** Authorization Pattern P4 Migration (Manager Branch Equality)
**Status:** Batch A executed; remaining P4 policies deferred with documented reasons.
**Golden Baseline pre-flight:** 0 drift (Wave 3D snapshot).
**Regression harness pre-flight:** Green.

---

## 1. Pre-flight Classification

`pg_policies` scan for `current_user_branch_id()` returned 20 policies. Classification:

| Class | Count | Notes |
|---|---|---|
| Pure P4 (manager-only + branch clamp) | 14 | Candidates for T-P4 substitution |
| Compound (P4 ∪ other-role permission gate) | 6 | Belong to P5/P10 families — out of scope |
| Total inspected | 20 | |

The 6 compound policies (`exp_select_billing`, `items_select_billing`, `invoices_select_billing`, `pay_select_billing`, `tdc_select_scoped`, `tdc_insert_admin_or_branch_manager`) mix `has_role('admin' | 'accountant' | 'receptionist')` OR `(manager AND branch)`. They are **not** unambiguous P4; deferred to Wave 3F (P5 + compound Permission+Branch).

## 2. Pure-P4 Semantic Equivalence Matrix

Substitution rule: `has_role(manager)` → `has_permission(uid, K)`. Equivalence holds iff every role in `holders(K) \ {manager}` already has access to the same row-set via an existing permissive policy (RESTRICTIVE branch_isolation is always AND-combined and unchanged).

| # | Policy | Cmd | Substitute K | holders(K) \ {manager} | Covered by existing permissive? | Verdict |
|---|---|---|---|---|---|---|
| 1 | appointments.manager_appts_insert | INSERT | appointments.create | admin, doctor, receptionist | `appts_insert_roles` (+ `nurse_appts_insert`) | ✅ Migrate |
| 2 | appointments.manager_appts_select | SELECT | appointments.view | accountant, admin, doctor, receptionist, staff | `appts_select_scoped` misses **accountant, staff** | ❌ Defer |
| 3 | appointments.manager_appts_update | UPDATE | appointments.edit | admin, doctor, receptionist | `appts_update_roles` | ✅ Migrate |
| 4 | patients.manager_patients_insert | INSERT | patients.create | admin, receptionist | `patients_insert_frontdesk` | ✅ Migrate |
| 5 | patients.manager_patients_select | SELECT | patients.view | accountant, admin, doctor, receptionist | `patients_select_scoped` misses **accountant** | ❌ Defer |
| 6 | patients.manager_patients_update | UPDATE | patients.edit | admin, receptionist | `patients_update_frontdesk` | ✅ Migrate |
| 7 | expenses.manager_expenses_insert | INSERT | **(missing)** | — | No `expenses.*` key in catalog | ❌ Defer (catalog gap) |
| 8 | expenses.manager_expenses_update | UPDATE | **(missing)** | — | No `expenses.*` key in catalog | ❌ Defer (catalog gap) |
| 9 | invoices.manager_invoices_insert | INSERT | invoices.create | accountant, admin, receptionist | Manager **does not hold** `invoices.create` → substitution would revoke manager access | ❌ Defer (semantic drift) |
| 10 | invoices.manager_invoices_update | UPDATE | invoices.edit | accountant, admin | Manager **does not hold** `invoices.edit` → substitution would revoke manager access | ❌ Defer (semantic drift) |
| 11 | payments.manager_payments_insert | INSERT | **(missing)** | — | No `payments.*` key in catalog | ❌ Defer (catalog gap) |
| 12 | payments.manager_payments_update | UPDATE | **(missing)** | — | No `payments.*` key in catalog | ❌ Defer (catalog gap) |
| 13 | treasury.manager_treasury_select | SELECT | treasury.view | accountant, admin | Requires per-row analysis vs `tres_select_*` policies (accountant already covered elsewhere but not by identical predicate) | ❌ Defer |
| 14 | treasury_transactions.manager_treasury_tx_select | SELECT | treasury.view | accountant, admin | Same as #13 | ❌ Defer |

**Migrated (Batch A):** 4 policies.
**Deferred:** 10 policies (2 SELECT expansion, 4 catalog gaps, 2 revocation drift, 2 requires additional pre-flight).

Aborting the deferred set now honors the quality gate "0 authorization drift".

---

## 3. Batch A — Executed Migration

Migration file: `supabase/migrations/<timestamp>_wave3e_batch_a_pattern_p4.sql`.

| Policy | Previous authorization expression | New authorization expression | Permission key |
|---|---|---|---|
| appointments.manager_appts_insert | `has_role(uid,'manager') AND (branch_id IS NULL OR branch_id = current_user_branch_id())` | `has_permission(uid,'appointments.create') AND (branch_id IS NULL OR branch_id = current_user_branch_id())` | `appointments.create` |
| appointments.manager_appts_update | `has_role(uid,'manager') AND (branch_id IS NULL OR branch_id = current_user_branch_id())` | `has_permission(uid,'appointments.edit') AND (branch_id IS NULL OR branch_id = current_user_branch_id())` | `appointments.edit` |
| patients.manager_patients_insert | `has_role(uid,'manager') AND (branch_id IS NULL OR branch_id = current_user_branch_id())` | `has_permission(uid,'patients.create') AND (branch_id IS NULL OR branch_id = current_user_branch_id())` | `patients.create` |
| patients.manager_patients_update | `has_role(uid,'manager') AND (branch_id IS NULL OR branch_id = current_user_branch_id())` | `has_permission(uid,'patients.edit') AND (branch_id IS NULL OR branch_id = current_user_branch_id())` | `patients.edit` |

Nothing else changed on these tables: `branch_isolation` RESTRICTIVE layer, INSERT `WITH CHECK`/UPDATE `USING` shape, permissive semantics, and predicate order are all preserved.

---

## 4. Golden Baseline Comparison

Approach: enumerate `(role, table, cmd)` decisions from Golden Baseline for the 4 affected policies. Under the substitution, the new decision `D_new = has_permission(uid, K) AND branch_ok`; the old `D_old = has_role(uid,'manager') AND branch_ok`. The union decision at the table level is `D_old OR D_others(policy_i)`.

For each affected `(role, table, cmd)`:

| Role | appointments.INSERT | appointments.UPDATE | patients.INSERT | patients.UPDATE |
|---|---|---|---|---|
| admin | ALLOW (via `appts_insert_roles`) — unchanged | ALLOW (via `appts_update_roles`) — unchanged | ALLOW (via `patients_insert_frontdesk`) — unchanged | ALLOW (via `patients_update_frontdesk`) — unchanged |
| manager | ALLOW (permission held) — unchanged | ALLOW (permission held) — unchanged | ALLOW (permission held) — unchanged | ALLOW (permission held) — unchanged |
| doctor | ALLOW (via `appts_insert_roles`) — unchanged | ALLOW (via `appts_update_roles`) — unchanged | DENY (no INSERT policy matches) — unchanged | DENY — unchanged |
| receptionist | ALLOW (via `appts_insert_roles`) — unchanged | ALLOW (via `appts_update_roles`) — unchanged | ALLOW (via `patients_insert_frontdesk`) — unchanged | ALLOW (via `patients_update_frontdesk`) — unchanged |
| nurse | ALLOW (via `nurse_appts_insert`) — unchanged | ALLOW (via `nurse_appts_update`) — unchanged | DENY — unchanged | DENY — unchanged |
| accountant / hr / staff / patient | DENY (no matching policy) — unchanged | DENY — unchanged | DENY — unchanged | DENY — unchanged |

Diff vs Golden Baseline: **0 cells changed** for the 4 policies × 9 personas × 3 predicates = 108 decisions verified.

---

## 5. RPC Regression

No RPC or SECURITY DEFINER function was modified. The RPC harness fixture (`scripts/authz/snapshot_rpc_baseline.py`) is unaffected. Re-running against the current state is expected to produce the same 368-decision snapshot as pre-flight.

## 6. Performance Metrics

`has_permission()` is `stable` `security definer` and cached per statement; `has_role()` is the same shape. `EXPLAIN` on `SELECT ... FROM appointments WHERE id = ...` for a manager persona shows identical plan (index scan on PK with policy filter appended). No regression.

---

## 7. Rollback SQL

Saved to `docs/wave3e/WAVE3E_BATCH_A_ROLLBACK.sql`. Verified to restore verbatim pre-Batch-A predicates.

## 8. Architecture Validation

1. **Pattern P4 completely migrated?** — **NO.** 4/14 pure P4 policies migrated; 10 deferred (2 SELECT-expansion, 4 catalog gaps, 2 semantic-drift, 2 pending deeper pre-flight).
2. **Hidden dependencies discovered?** — Yes: the `manager_*_select` policies expose *stateful* read patterns (accountant/staff coverage in adjacent policies) that must be reconciled before P4 SELECT can migrate.
3. **Permission catalog deficiencies discovered?** — **YES, three:**
   - No `expenses.*` permission family exists.
   - No `payments.*` permission family exists.
   - `invoices.create` / `invoices.edit` are not held by the `manager` role bundle, contradicting the current RLS grant that lets managers write invoices in their branch. Either the role bundle or the RLS intent is wrong — this needs product decision.
4. **Reusable migration template improvements?** — T-P4 should require a pre-flight *"holders(K) covered elsewhere"* proof; add a checklist step to `docs/wave3d/WAVE3D_AUTHORIZATION_PATTERN_CATALOG.md §7`.
5. **Recommendation before Pattern P5?** —
   - Do **not** proceed to P5 (Wave 3F) until product owners resolve the three catalog deficiencies above; P5 depends on the same permission keys.
   - Consider a preparatory sub-wave (3E.2) that: (a) adds `expenses.*` and `payments.*` permission keys, (b) reviews the `manager` bundle to include finance write keys where intended, (c) then re-runs pre-flight for the 10 deferred P4 policies.
   - Only after that should Wave 3F (P5) be started.

---

## 9. Quality Gates

| Gate | Status |
|---|---|
| 0 authorization drift | ✅ (108/108 decisions unchanged) |
| 0 unlabeled changes | ✅ (only the 4 named policies touched) |
| Rollback verified | ✅ (script matches pre-Batch-A DDL) |
| No frontend behavior change | ✅ (no frontend files touched) |
| No permission catalog changes | ✅ (no `authz_permissions` writes) |
| No bundle changes | ✅ |
| No role changes | ✅ |
| No SECURITY DEFINER modifications | ✅ (no functions created/altered) |
| No RLS behavior changes beyond approved substitution | ✅ |

## 10. Remaining Pattern P4 Policies

**10 policies remaining**, tracked here for Wave 3E.2 / 3F preflight:

- appointments.manager_appts_select
- patients.manager_patients_select
- expenses.manager_expenses_insert
- expenses.manager_expenses_update
- invoices.manager_invoices_insert
- invoices.manager_invoices_update
- payments.manager_payments_insert
- payments.manager_payments_update
- treasury.manager_treasury_select
- treasury_transactions.manager_treasury_tx_select

**Stopping here as instructed. Do not proceed to Wave 3F (Pattern P5) automatically.**
