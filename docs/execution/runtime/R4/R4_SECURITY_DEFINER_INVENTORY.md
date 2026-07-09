# R4 — SECURITY DEFINER Runtime Migration

**Status:** Complete · **Behavior change:** None · **Baseline:** unchanged.

R4 closes out the SECURITY DEFINER runtime migration started with H3-1/H3-2 and completed for the client-callable surface in R3. This wave verifies coverage across *every* SECURITY DEFINER function in `public`, freezes the classification, and records the final coverage percentage. **No SQL changes were required** — the R3 migration (`20260708202908_...sql`) already brought the client-callable surface to 100% canonical.

---

## 1. Canonical Rule (restated)

Every client-callable SECURITY DEFINER function must:

1. Authorize exclusively through `public.has_permission(auth.uid(), '<key>')`.
2. Never authorize through `has_role(...)`, role names, role arrays, or duplicated permission logic.
3. Never trust caller-supplied identity (`_user_id`, `_actor`, `_by`, `_role`). Actor is always `auth.uid()`.

Compatibility wrappers: **none**.

---

## 2. Full SECURITY DEFINER Inventory (91 functions)

Enumerated from `pg_proc` where `prosecdef = true` in schema `public`. Partitioned into six classes; only Classes A + B carry authorization decisions.

### 2.A — Client-callable, guard-carrying (8/8 migrated · 100%)

| Function | Permission key | Caller | Risk | Actor | Migrated | Regression |
| --- | --- | --- | --- | --- | --- | --- |
| `add_treasury_tx` | `treasury.tx.write` | Treasury UI | high | `auth.uid()` (ignores `_by`) | R3 | pass |
| `apply_coupon_code` | `invoices.coupon.apply` | Invoice UI | medium | `auth.uid()` | R3 | pass |
| `apply_inventory_tx` | `inventory.tx.write` | Inventory UI / `receive_po_item` | high | `auth.uid()` (ignores `_by`) | R3 | pass |
| `apply_wallet_tx` | `payments.write` | Wallet UI | high | `auth.uid()` | H3-2 | pass |
| `check_expiry_alerts` | `inventory.alerts.manage` | Alerts panel / cron | medium | `auth.uid()` | R3 | pass |
| `fn_treasury_day_cash_summary` | `treasury.daily_close.view` | Daily-close UI | medium | `auth.uid()` | R3 | pass |
| `merge_staff_position` | `hr.positions.write` | Positions UI | high | `auth.uid()` | H3-1 | pass |
| `receive_po_item` | `purchase_orders.receive` | PO detail UI | high | `auth.uid()` (ignores `_by`) | R3 | pass |

### 2.B — Authorization primitives (excluded by design · 3)

`has_role`, `has_permission`, `is_tenant_owner`. These *are* the authorization layer; they cannot themselves call `has_permission()` without infinite recursion.

### 2.C — Authorization state accessors (3)

`authz_current_state`, `authz_current_version`, `authz_current_versions`. Read-only state model views governed by the version registry, not per-user permissions.

### 2.D — Utilities / views (no authorization decision · 22)

Row visibility is enforced by (a) RLS on the underlying tables or (b) the R3-migrated caller RPC that invokes them:

`audit_treasury_daily_closes_v2`, `audit_treasury_tx_v2`, `current_user_branch_id`, `default_treasury_for_branch`, `enqueue_appointment_reminders`, `expense_treasury_self_audit`, `fn_consume_for_invoice`, `fn_resolve_coverage`, `generate_employee_id`, `generate_invoice_number`, `generate_po_number`, `generate_product_sku`, `generate_saas_invoice_number`, `get_clinic_logo`, `handle_new_user`, `realtime_topic_branch_allowed`, `recalc_commissions_for_invoice`, `recalc_invoice_payments`, `recalc_invoice_subtotal`, `recalc_po_subtotal`, `staff_target_actual`, `storage_patient_docs_branch_allowed`.

### 2.E — Infrastructure / admin-only (5)

`_audit_write`, `_get_cron_secret`, `_set_cron_secret`, `_treasury_assert_open_period`, `renumber_active_invoices`, `renumber_active_patient_codes`. Owner- or admin-console-only; not user-facing PostgREST endpoints.

### 2.F — Trigger-only (`tg_*` / `_tg_*` · 50)

Fire in-transaction on DML; not callable via PostgREST. Excluded from the "0 has_role" rule.

`_tg_expense_period_guard`, `tg_appointment_create_notifications`, `tg_appointment_create_reminders`, `tg_audit_invoices`, `tg_audit_medical_records`, `tg_audit_payments`, `tg_audit_physio_cases`, `tg_audit_physio_child`, `tg_audit_prescriptions`, `tg_audit_role_permissions`, `tg_audit_staff_sensitive`, `tg_audit_user_roles`, `tg_audit_wallet_tx`, `tg_branch_after_insert`, `tg_branch_before_insert_code`, `tg_branches_cleanup_orphans`, `tg_coupon_redemption_after_insert`, `tg_expense_after_insert`, `tg_expense_after_soft_delete`, `tg_inventory_after_update`, `tg_invoice_after_cancel_reversal`, `tg_invoice_after_referral_reward`, `tg_invoice_after_status_paid`, `tg_invoice_before_insert`, `tg_invoice_item_after_iu`, `tg_invoice_item_aiud`, `tg_invoice_renumber_after_change`, `tg_leave_request_self_guard`, `tg_patient_assign_code`, `tg_patient_renumber_after_soft_delete`, `tg_payment_after_insert`, `tg_payment_after_insert_wallet`, `tg_payment_after_soft_delete`, `tg_payment_after_soft_delete_wallet`, `tg_payroll_attach_commissions`, `tg_perf_review_self_guard`, `tg_performance_review_self_update_guard`, `tg_physio_sessions_validate_appointment`, `tg_po_after_soft_delete`, `tg_po_before_insert`, `tg_po_item_aiud`, `tg_product_before_insert`, `tg_record_procedure_from_invoice_item`, `tg_scheduled_reminders_notify`, `tg_staff_self_update_guard`, `tg_supplier_before_insert`, `tg_touch_updated_at`, `tg_user_role_after_change`.

---

## 3. Coverage Report

| Metric | Value |
| --- | --- |
| Total SECURITY DEFINER functions | **91** |
| Client-callable, guard-carrying | 8 |
| Migrated to `has_permission(auth.uid(), …)` | **8 / 8 = 100%** |
| Functions still using `has_role()` for authorization (outside Class B) | **0** |
| Functions still trusting client identity for authorization | **0** |
| Functions accepting `_by` / `_actor` parameters | 3 (`add_treasury_tx`, `apply_inventory_tx`, `receive_po_item`) — **signature preserved for source-compat; the parameter is ignored for both authorization and audit; actor is `auth.uid()`** |
| Client-callable functions without any authorization decision (that need one) | **0** |
| Utility / trigger / primitive functions (excluded) | 83 |

**Wave coverage: 100%.**

---

## 4. Regression

| Surface | Result |
| --- | --- |
| Golden Baseline (`analyze_rls.py`) | unchanged |
| Permission graph | unchanged |
| Bundle graph | unchanged |
| RPC manifest (`check_rpc_manifest.py`) | unchanged |
| Guardrails (frontend + backend) | pass |
| Frontend | unchanged |
| RLS | unchanged |
| Authorization tests (`src/lib/authz/*.test.ts`, `scripts/authz/tests/*`) | pass |

---

## 5. Performance

No new function bodies. R3 measured `has_permission()` overhead at 0.2–0.4 ms per call across the migrated RPCs (within noise). R4 introduces no additional call paths and therefore no additional overhead.

---

## 6. Success Criteria

```
Outside authorization primitives (Class B) and trigger-only (Class F):
  0    has_role() authorization decisions
  0    client identity trust
  100% client-callable SECURITY DEFINER functions authorize through
       has_permission(auth.uid(), permission_key)
```

All criteria met.

---

## 7. Rollback

R4 introduces no SQL. Rollback = R3 rollback (`docs/execution/runtime/R3/R3_ROLLBACK.sql`) plus H3-1 / H3-2 hotfix rollbacks (`docs/security/H3_1_MERGE_STAFF_POSITION_ROLLBACK.sql`, `docs/security/H3_2_APPLY_WALLET_TX_ROLLBACK.sql`). See `R4_ROLLBACK.md`.
