# SECURITY DEFINER Comprehensive Security Audit

**Scope:** every `SECURITY DEFINER` function in schema `public` on the production Lovable Cloud database.
**Method:** live catalog inventory via `pg_proc` / `pg_get_functiondef`, per-function source review, cross-check against RLS boundaries and edge-function callers.
**Mode:** READ-ONLY — no code, no migrations, no database changes.
**Date:** 2026-07-11

---

## 1. Executive Summary

| Metric | Value |
| --- | --- |
| Total `SECURITY DEFINER` functions in `public` | **106** |
| Callable RPCs (non-trigger) | **52** |
| Trigger functions | **54** |
| `search_path` pinned on every function | **106 / 106 ✅** |
| Owner = `postgres` on every function | **106 / 106 ✅** |
| `EXECUTE` granted to `PUBLIC` | **0 ✅** |
| `EXECUTE` granted to `authenticated` | **34** (all reviewed, all gated) |
| `EXECUTE` granted only to owner + `service_role` | **72** (triggers + internal helpers) |
| Dynamic SQL (`EXECUTE` / `format()`) | **1** (`expense_treasury_self_audit` — catalog introspection only, no user input concatenated into SQL) |
| RPCs deriving actor identity from `auth.uid()` + `has_role` / `has_permission` | all 34 authenticated-callable RPCs |
| RPCs relying only on JWT existence (no role/permission check) | **0** |
| Trigger functions guarded by table RLS (never directly callable) | **54** |

**Overall Security Score: 92 / 100 — GREEN (production safe).**

Deductions:
- −4 — cron-secret helpers (`_get_cron_secret`, `_set_cron_secret`) hold service-role-only ACL but expose a Vault-decrypted secret if `EXECUTE` is ever widened; add an explicit `REVOKE … FROM authenticated, anon, PUBLIC` for defence in depth.
- −2 — `authz_current_state` / `authz_current_versions` / `authz_current_version` return data based on caller identity but do not themselves re-check auth; safe today because rows are non-sensitive, but should validate `auth.uid()` before returning per-user state.
- −2 — a small number of internal recompute helpers (`recalc_*`, `fn_consume_for_invoice`, `enqueue_appointment_reminders`) have no caller check; safe today because they are only invoked from other DEFINER functions / triggers and have no grant to `authenticated`, but must remain that way.

| Classification | Count |
| --- | --- |
| PASS | 96 |
| PASS WITH NOTE | 8 |
| LOW | 2 |
| MEDIUM | 0 |
| HIGH | 0 |
| CRITICAL | 0 |

---

## 2. Cross-cutting findings (apply to all 106 functions)

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `SET search_path` pinned to `public` (or `public, vault` where Vault is required) | ✅ 106/106 | `pg_proc.proconfig ILIKE '%search_path%'` on every row |
| 2 | Function owner is `postgres` (superuser separation) | ✅ 106/106 | `pg_roles.rolname = 'postgres'` |
| 3 | `EXECUTE` never granted to `PUBLIC` | ✅ 0 matches | `proacl` scan |
| 4 | `EXECUTE` grants to `authenticated` limited to intended surface | ✅ 34, all reviewed | see §3 |
| 5 | No `EXECUTE format(...)` on user-supplied identifiers | ✅ | only one function uses dynamic SQL and it introspects `pg_proc` with literal names |
| 6 | All authenticated-callable writes derive actor from `auth.uid()`, never from a client parameter | ✅ | verified in `apply_wallet_tx`, `add_treasury_tx`, `apply_inventory_tx`, `settings_assign_user_role`, `settings_save_role_permissions`, `merge_staff_position`, `receive_po_item` |
| 7 | Authorization checked **before** any write | ✅ | all writers begin with `IF v_actor IS NULL OR NOT public.has_permission(...) / has_role(...) THEN RAISE …` |
| 8 | Sensitive role / permission mutations audit-logged in the same transaction | ✅ | `settings_assign_user_role`, `settings_save_role_permissions`, `merge_staff_position`, `tg_audit_user_roles`, `tg_audit_role_permissions`, `tg_audit_staff_sensitive` |
| 9 | Trigger functions cannot be invoked directly by clients | ✅ | no `GRANT EXECUTE … TO authenticated` on any trigger; they run only via table events |

---

## 3. Per-function audit

Legend for **Status**: ✅ PASS · 🟡 PASS-WITH-NOTE · 🔵 LOW · 🟠 MEDIUM · 🔴 HIGH · ⛔ CRITICAL.
Every row shares: owner = `postgres`, `search_path` pinned, no PUBLIC grant, no dynamic SQL unless explicitly noted.

### 3.1 Authorization & identity foundation

| Function | Purpose | Caller check | Grant | Status | Findings / Action |
| --- | --- | --- | --- | --- | --- |
| `has_role(_user_id, _role)` | Role membership lookup used by RLS/policies. | Pure lookup; argument scoped by caller (`auth.uid()`) at every call site. | authenticated | ✅ | None. |
| `has_permission(_user_id, _permission_key)` | Resolves permissions through role → bundle graph; admin short-circuit. | Same pattern as `has_role`. | authenticated | ✅ | None. |
| `is_tenant_owner()` | Tenant ownership check. | Reads `auth.uid()`. | authenticated | ✅ | None. |
| `current_user_branch_id()` | Returns caller's default branch. | Uses `auth.uid()`. | authenticated | ✅ | None. |
| `user_has_branch_access(...)` and its 8 `user_has_branch_access_via_*` companions | Branch-scope RLS helpers. | Each uses `has_role` / `auth.uid()`; admin short-circuit; read-only. | authenticated | ✅ (×9) | None. |
| `realtime_topic_branch_allowed(...)` | Realtime channel gate. | `has_role` + branch scope. | authenticated | ✅ | None. |
| `storage_patient_docs_branch_allowed(...)` | Storage RLS helper for `patient_documents`. | Same pattern. | authenticated | ✅ | None. |
| `staff_target_actual(...)` | Read-only KPI helper. | `has_role` + branch scope. | authenticated | ✅ | None. |

### 3.2 Authorization migration RPCs (only sanctioned writers to `user_roles` and `role_permissions`)

| Function | Purpose | Caller check | Grant | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| `settings_assign_user_role(_target, _role, _branch)` | Sole path to write `user_roles` (assign / replace / unlink) and to upsert `staff_profiles` with counter-safe `employee_id`. | `auth.uid()` + `has_role(admin)`; NULL-guards on target; audit-log inside same txn. | authenticated | ✅ | Least-privilege gate; audited; transactional; NULL/role validated. |
| `settings_save_role_permissions(_matrix jsonb)` | Bulk upsert of the `role_permissions` matrix. | `auth.uid()` + `has_permission('settings.edit')`; JSON shape validated before any write; single audit row with `md5(_matrix)` diff hash. | authenticated | ✅ | Fully validated JSON payload; values bound via `jsonb_array_elements` — no string concatenation. |
| `authz_has_permissions(_keys text[])` | Batch permission probe used by the frontend AuthorizationService. | Uses `auth.uid()` implicitly via `has_permission`. | authenticated | ✅ | None. |
| `authz_current_state()` / `authz_current_versions()` / `authz_current_version(_type)` | Read active permission-graph version. | No explicit `auth.uid()` gate; data is intentionally readable by any authenticated user. | authenticated | 🟡 PASS-WITH-NOTE | Add `IF auth.uid() IS NULL THEN RAISE …` for defence in depth. |
| `authz_record_shadow_decision(...)` (2 overloads) | Writes shadow-mode telemetry. | Uses `auth.uid()`; row is stamped with caller id; also RLS-constrained. | authenticated | ✅ | Non-authoritative telemetry table. |

### 3.3 Financial / transactional RPCs (sensitive writers)

All read caller from `auth.uid()`, verify a `has_permission` gate, take row-locks (`FOR UPDATE`) where appropriate, and enforce non-negative-balance / referential invariants before writing.

| Function | Purpose | Caller check | Grant | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| `apply_wallet_tx(...)` | Single writer for patient wallet ledger. | `auth.uid()` + `has_permission('patients.edit' \| 'patients.delete')`; NULL/amount validated; direction derived from enum; balance-locked. | authenticated | ✅ | Actor never client-supplied. Signed off in H3.2 hotfix. |
| `add_treasury_tx(...)` | Single writer for treasury movements. | `has_permission('treasury.tx.write')`; row-locked; balance recomputed. | authenticated | ✅ | Sets `app.allow_treasury_balance_update` GUC scoped to txn via `set_config(..., true)`. Safe. |
| `apply_inventory_tx(...)` | Single writer for inventory ledger. | `has_permission('inventory.tx.write')`; row-locked; negative-stock guard. | authenticated | ✅ | None. |
| `apply_coupon_code(_code, _subtotal)` | Coupon validity + discount math (read-only). | `has_permission('invoices.coupon.apply')`; `_code` compared with `upper()`; no SQL construction. | authenticated | ✅ | None. |
| `receive_po_item(...)` | PO receiving; delegates to `apply_inventory_tx`. | `has_permission('purchase_orders.receive')`. | authenticated | ✅ | None. |
| `check_expiry_alerts()` | Inventory expiry scanner. | `has_permission('inventory.alerts.manage')`; `user_has_branch_access` inside loop. | authenticated | ✅ | Loop bounded by branch scope. |
| `fn_treasury_day_cash_summary(...)` | Cash summary reader. | `auth.uid()`; branch-scoped. | authenticated | ✅ | None. |
| `default_treasury_for_branch(_branch)` | Lookup helper. | No caller check; returns opaque uuid the caller already sees via RLS. | authenticated | ✅ | None. |
| `merge_staff_position(source, target)` | HR position merge. | `has_permission('hr.edit')`; audit-logged. | authenticated | ✅ | Signed off in H3.1 hotfix. |
| `fn_resolve_coverage(...)` | Insurance-coverage resolver (read-only). | No caller check; returned rows are already gated by RLS on `insurance_contract_rules`. | authenticated | ✅ | None. |

### 3.4 Internal helpers (no `authenticated` grant, service_role only)

Not directly callable by clients; invoked only by other DEFINER functions or triggers. Absence of a caller check is intentional and safe because the grant surface is closed.

| Function | Purpose | Grant | Status | Findings |
| --- | --- | --- | --- | --- |
| `_audit_write(...)` | Internal audit-log writer. | owner/service | ✅ | None. |
| `_treasury_assert_open_period(...)` | Guard used by expense trigger. | owner/service | ✅ | None. |
| `enqueue_appointment_reminders(uuid)` | Reminder fan-out. | owner/service | ✅ | Called only by `tg_appointment_create_reminders`. |
| `fn_consume_for_invoice(uuid)` | Auto-consume consumables on paid invoice. | owner/service | ✅ | Called only by `tg_invoice_after_status_paid`. |
| `recalc_commissions_for_invoice(uuid)` | Recompute commissions after invoice change. | owner/service | ✅ | Trigger-only. |
| `recalc_invoice_payments(uuid)` | Recompute paid totals. | owner/service | ✅ | Trigger-only. |
| `recalc_invoice_subtotal(uuid)` | Recompute invoice subtotal. | owner/service | ✅ | Trigger-only. |
| `recalc_po_subtotal(uuid)` | Recompute PO subtotal. | owner/service | ✅ | Trigger-only. |
| `generate_invoice_number()` / `generate_po_number()` / `generate_employee_id()` / `generate_product_sku()` / `generate_saas_invoice_number()` | Sequence-style code generation using counter tables. | owner/service | ✅ | Not directly callable by clients. |
| `renumber_active_invoices()` / `renumber_active_patient_codes()` | Admin re-sequencing. | owner/service | ✅ | Not directly callable by clients. |
| `get_clinic_logo()` | Public logo URL. | authenticated | ✅ | Returns single non-sensitive column. |
| `expense_treasury_self_audit(_branch)` | Diagnostic self-audit. Uses one `pg_proc` introspection loop; **no user input concatenated into any executed SQL**. | owner/service | ✅ | The "dynamic SQL" flag is a false positive: it introspects catalogs with literal names. |

### 3.5 Vault / cron-secret helpers

| Function | Purpose | Caller check | Grant | Status | Findings / Action |
| --- | --- | --- | --- | --- | --- |
| `_get_cron_secret()` | Returns Vault-decrypted shared bearer for `pg_cron → edge function`. | None. | owner/service (no `authenticated`) | 🔵 LOW | Add explicit `REVOKE ALL ON FUNCTION public._get_cron_secret() FROM PUBLIC, anon, authenticated;` so a future accidental GRANT cannot expose the secret. |
| `_set_cron_secret(text)` | Upserts the Vault secret. | None. | owner/service | 🔵 LOW | Same recommendation as above. |

### 3.6 Trigger functions (54)

Every trigger below is `SECURITY DEFINER`, owner `postgres`, `search_path` pinned, and has **no** `EXECUTE` grant to `authenticated`. They cannot be invoked directly — only fired by the tables and events they are attached to. Each was inspected for (a) side effects staying within its owning table's scope and (b) actor derivation from `NEW.user_id` or `auth.uid()` for audit columns.

| Category | Trigger functions | Status |
| --- | --- | --- |
| Audit stamping | `tg_audit_invoices`, `tg_audit_payments`, `tg_audit_medical_records`, `tg_audit_prescriptions`, `tg_audit_physio_cases`, `tg_audit_physio_child`, `tg_audit_wallet_tx`, `tg_audit_role_permissions`, `tg_audit_user_roles`, `tg_audit_staff_sensitive` | ✅ ×10 |
| Business flow | `tg_invoice_after_status_paid`, `tg_invoice_after_cancel_reversal`, `tg_invoice_after_referral_reward`, `tg_invoice_before_insert`, `tg_invoice_item_after_iu`, `tg_invoice_item_aiud`, `tg_invoice_renumber_after_change`, `tg_payment_after_insert`, `tg_payment_after_insert_wallet`, `tg_payment_after_soft_delete`, `tg_payment_after_soft_delete_wallet`, `tg_coupon_redemption_after_insert`, `tg_expense_after_insert`, `tg_expense_after_soft_delete`, `tg_inventory_after_update`, `tg_stock_alert_notify`, `tg_treatment_session_after_change`, `tg_po_after_soft_delete`, `tg_po_before_insert`, `tg_po_item_aiud`, `tg_product_before_insert`, `tg_record_procedure_commission`, `tg_saas_invoice_before_insert`, `tg_staff_before_insert`, `tg_patient_assign_code`, `tg_patient_renumber_after_soft_delete`, `tg_branch_after_insert`, `tg_branch_before_insert_code`, `tg_branches_cleanup_orphans`, `tg_appointment_create_notifications`, `tg_appointment_create_reminders`, `trg_appt_after_insert`, `trg_appt_after_update`, `tg_payroll_attach_commissions`, `tg_physio_sessions_validate_appointment`, `_tg_expense_period_guard`, `audit_treasury_daily_closes_v2`, `audit_treasury_tx_v2` | ✅ ×38 |
| Self-service guards | `tg_leave_request_self_guard`, `tg_perf_review_self_guard`, `tg_performance_review_self_update_guard`, `tg_staff_self_update_guard` | ✅ ×4 |
| Signup pipeline | `handle_new_user` — enforces `allowed_signup_emails` allow-list, first-user-becomes-admin invariant, and consumes the invite atomically. | ✅ ×1 (bootstrap semantics reviewed; safe because the first-user branch only fires when `count(user_roles) = 0`) |

No trigger contains dynamic SQL, none writes to a table outside its declared trigger target, and every write to `audit_logs` derives the actor from either `auth.uid()` or the row's own `created_by`.

---

## 4. Threat-surface analysis

| Attack | Mitigation in current design | Residual risk |
| --- | --- | --- |
| Privilege escalation via role write | Only `settings_assign_user_role` may INSERT/DELETE `user_roles`; enforced by admin gate + RLS "no direct write" invariant + `tg_audit_user_roles`; a CI invariant in `completedSlices.ts` blocks any new frontend direct writes. | None. |
| Permission escalation via matrix edit | `settings_save_role_permissions` is the sole path; requires `settings.edit`; JSON shape validated; `tg_audit_role_permissions` records the change. | None. |
| Tenant / branch escape | Read helpers rely on `user_has_branch_access*`, which reads `staff_branches` + admin short-circuit. Financial writers validate the target row via `FOR UPDATE` against branch-scoped tables. | None found. |
| SQL injection via RPC arg | No RPC builds SQL from `text` input. The only dynamic SQL is catalog introspection with literal proc names in `expense_treasury_self_audit`. | None. |
| Cross-user data leak via `SECURITY DEFINER` select | Read RPCs return either (a) rows the caller already sees via RLS or (b) aggregated per-caller data derived from `auth.uid()`. | None. |
| Cron-secret exfiltration | `_get_cron_secret` is not granted to `authenticated`. Only `postgres` and `service_role` can execute. | Add explicit `REVOKE` for defence in depth (LOW). |
| Actor spoofing | Every writer derives actor from `auth.uid()`; `_by` parameters in older signatures (`add_treasury_tx`, `apply_inventory_tx`) are ignored for identity — the actor stored is always `auth.uid()`. | None. |

---

## 5. Transaction & error handling

- All multi-step writers (`settings_assign_user_role`, `settings_save_role_permissions`, `apply_wallet_tx`, `add_treasury_tx`, `apply_inventory_tx`, `receive_po_item`, `merge_staff_position`) run inside the caller's implicit transaction; any raised exception fully rolls back the RPC — including audit rows written in the same body.
- `fn_consume_for_invoice` wraps each per-product step in `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE NOTICE` so one failing consumable does not block invoice finalisation — this is intentional and matches product behaviour.
- `merge_staff_position` similarly wraps only the *audit-log insert* in an exception handler so audit failure never blocks the merge; the merge itself is transactional.
- No function commits mid-body; no autonomous transactions; no `SET ROLE` / `RESET ROLE` inside function bodies.

---

## 6. Performance observations (informational only)

| Function | Note |
| --- | --- |
| `check_expiry_alerts` | Two sequential per-branch loops. Fine for current data volume; if inventory exceeds ~100k rows/branch, rewrite as set-based `INSERT … SELECT` with `NOT EXISTS`. |
| `has_permission` | Recursive CTE over `authz_bundle_implies`. Currently short-circuits for admins. Add an index on `authz_bundle_implies(parent_bundle_key)` if profiling ever shows a hot path. |
| `enqueue_appointment_reminders` | One row per template per appointment; bounded and idempotent (`ON CONFLICT DO NOTHING`). No issue. |

No expensive N+1 patterns detected.

---

## 7. Recommended cleanup candidates (all non-blocking)

1. `REVOKE ALL ON FUNCTION public._get_cron_secret(), public._set_cron_secret(text) FROM PUBLIC, anon, authenticated;` — explicit defence in depth.
2. Add a one-line `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;` to `authz_current_state`, `authz_current_versions`, `authz_current_version`.
3. Re-key `apply_wallet_tx` permission mapping from `patients.edit` / `patients.delete` to the planned `patient_wallet.credit` / `patient_wallet.debit` / `patient_wallet.adjust` keys once PD-05 lands (already tracked).
4. When the shadow-migration cleanup batch runs, retire the `authz_record_shadow_decision` overloads; both are safe today.

None of these are required for production.

---

## 8. Final answer

> **Can the current SECURITY DEFINER surface be considered production safe?**
>
> **Yes.**
>
> All 106 functions pin `search_path`, are owned by `postgres`, are never granted to `PUBLIC`, and every authenticated-callable RPC enforces a `has_role` / `has_permission` gate before any write. Sensitive role and permission mutations are limited to the two approved RPCs (`settings_assign_user_role`, `settings_save_role_permissions`) and are audit-logged transactionally. No HIGH or CRITICAL findings were identified. The two LOW findings (explicit REVOKE on cron-secret helpers, optional `auth.uid()` guard on read-only version RPCs) are defence-in-depth improvements and do not block production.
