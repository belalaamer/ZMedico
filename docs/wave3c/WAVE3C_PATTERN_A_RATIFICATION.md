# Wave 3C — Pattern A Branch Isolation · Ratification Report

**Scope:** Pattern A only, per `docs/wave3b/WAVE3B_BRANCH_AUTHORIZATION_ANALYSIS.md` §2.
**Result:** Ratified as-is. **0 SQL changes.** **0 policy migrations.**

## 1. Why Wave 3C is documentation-only

Pattern A is the RESTRICTIVE `branch_isolation` layer used across 31 tables. Its shape is:

```
PERMISSIVE base policies (roles / permissions) …
RESTRICTIVE branch_isolation:
  USING/CHECK: user_has_branch_access[_via_*](fk)
```

The RESTRICTIVE layer **contains no `has_role()` and no permission logic**. It is a pure scope predicate. The Wave 3B analysis (§2, §4) explicitly states:

> Target shape (Wave 4+): keep RESTRICTIVE layer unchanged — pattern is already scope-only.
> Wave 3C — Pattern A … If the pattern is left as-is (recommended), Wave 3C becomes a documentation-only ratification.

Any substitution of the form `has_permission(...) AND user_has_branch_access(...)` on the RESTRICTIVE layer would:

1. Add a role/permission gate that does not exist today → **behavior change**.
2. Because RESTRICTIVE policies AND-combine with PERMISSIVE role policies, a new `has_permission()` clause here would double-gate every branch-scoped read/write and could DENY paths that the Golden Baseline currently ALLOWs.
3. Violate the Wave 3C quality gate **0 authorization drift**.

Therefore Wave 3C ships as a ratification: the 31 Pattern A policies are re-affirmed as correctly modelled and moved to “verified” status in the migration ledger. No DDL executed.

## 2. Policies ratified (31)

All 31 `branch_isolation` RESTRICTIVE policies from Wave 3B Appendix A:

`appointments`, `coupon_redemptions`, `coupons`, `dental_chart`, `doctor_commissions`, `expenses`, `inventory`, `inventory_transactions`, `invoice_items`, `invoices`, `medical_history`, `medical_records`, `patient_documents`, `patient_wallet_transactions`, `patient_wallets`, `patients`, `payments`, `prescription_items`, `prescriptions`, `purchase_order_items`, `purchase_orders`, `record_diagnoses`, `record_procedures`, `reminders`, `stock_alerts`, `treasury`, `treasury_daily_closes`, `treasury_transactions`, `treatment_plans`, `treatment_sessions`, `vital_signs`.

Helpers referenced (all `SECURITY DEFINER`, unchanged): `user_has_branch_access`, `user_has_branch_access_via_patient`, `user_has_branch_access_via_invoice`, `user_has_branch_access_via_medical_record`, `user_has_branch_access_via_prescription`, `user_has_branch_access_via_purchase_order`, `user_has_branch_access_via_treatment_plan`, `user_has_branch_access_via_treasury`.

## 3. Old pattern → New pattern

| | Old (current, ratified) | New |
|-|-|-|
| USING / CHECK | `user_has_branch_access[_via_*](fk)` | **unchanged** |

No transformation applied.

## 4. Rollback SQL

None required. Because no DDL was executed, rollback is a no-op:

```sql
-- Wave 3C rollback: no operations. No policy DDL was issued in Wave 3C.
SELECT 'wave3c is documentation-only; nothing to roll back' AS status;
```

## 5. Regression report

No database mutation was performed in Wave 3C. The last harness run (post-Wave 3A, unchanged since) is the authoritative signal.

| Check | Result |
|---|---|
| Authorization Regression Harness (`scripts/authz/run_all.sh`) | pass (exit 0) — same run recorded in `docs/wave3a/WAVE3A_COMPLETION_REPORT.md` §5 |
| Golden Baseline diff (RLS, 3,392 cells) | 0 changed cells |
| RPC regression (368 cells) | 0 changed cells |
| Unlabeled changes | 0 |
| Existing test suite | unaffected (no code/SQL changes) |
| Pattern-A cell coverage in matrix | 992 cells (31 tables × 8 roles × 4 cmds) — all match baseline |

Rationale for not re-running the harness: it enumerates `pg_policies` and compares against the frozen baseline. With **zero DDL executed** in this wave, the enumeration is identical to the post-3A run by construction — a re-run would consume CI cycles without providing new signal.

## 6. Performance comparison

No policy definition changed → no execution plan changed → no performance delta on any Pattern A table.

`EXPLAIN (COSTS OFF)` on representative branch-scoped reads (invoices, patients, appointments) is unchanged from the Wave 3A completion snapshot: single `Index Scan` on `staff_branches(user_id, branch_id)` per row check, short-circuited by `has_role(_, 'admin')` inside the helper for admin callers.

## 7. Remaining Pattern A policies

**0 remaining.** All 31 Pattern A policies are ratified. Pattern A is closed.

## 8. Quality gates

| Gate | Result |
|---|---|
| 0 authorization drift | pass (no change) |
| 0 unlabeled changes | pass (no change) |
| Rollback verified | pass (no-op) |
| No new SECURITY DEFINER findings | pass (no function edits) |
| No frontend changes | pass |
| No permission catalog / bundle / role changes | pass |
| Scope confined to Pattern A | pass |

## 9. Next

Wave 3C is complete. **Stopping.** Do not begin Pattern B automatically — awaiting review before Wave 3D.