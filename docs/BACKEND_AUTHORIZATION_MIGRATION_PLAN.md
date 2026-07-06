# Backend Authorization Migration Plan — Sprint 2

**Phase:** Backend Authorization Readiness  
**Status:** Planning · additive only · no SQL, no RLS, no function, no behavior changes  
**Prereqs met:** Wave 1 (foundation), Wave 1.5 (frontend inventory), Wave 1.6 (business ops catalog), Sprint 1 Batches 1 & 2A (nav + declarative wrappers migrated).

This document prepares Wave 3 (backend enforcement). It is the canonical
plan the Wave 3 executor will read before touching a single policy.

---

## 1 · RLS Policy Inventory

### 1.1 Aggregate metrics (source: `pg_policies` @ sprint start)

| Metric                                | Count |
| ------------------------------------- | ----- |
| Total policies (`public.*`)           | 368   |
| Reference `public.has_role()`         | 286   |
| Reference `public.user_has_branch_access*()` | 53 |
| Reference `auth.uid()` (owner/self)   | 296   |
| Tables with ≥ 1 policy                | 105   |

`has_role()` is invoked in ~78 % of policies. It is the single largest
backend authorization primitive and the migration's biggest lever.

### 1.2 Per-policy record shape

Rather than enumerate 368 rows in Markdown, the executor generates the
working inventory into `docs/generated/rls_policy_inventory.csv` at the
start of each batch, using:

```sql
SELECT tablename, policyname, cmd,
       (qual ILIKE '%has_role%'               OR with_check ILIKE '%has_role%')               AS uses_has_role,
       (qual ILIKE '%user_has_branch_access%' OR with_check ILIKE '%user_has_branch_access%') AS uses_branch,
       (qual ILIKE '%auth.uid()%'             OR with_check ILIKE '%auth.uid()%')             AS uses_ownership,
       qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Each row is annotated with these fields (see also §1.4 buckets):

| Field                          | Meaning                                              |
| ------------------------------ | ---------------------------------------------------- |
| `table`                        | Target table                                         |
| `policy`                       | Policy name                                          |
| `operation`                    | `SELECT` / `INSERT` / `UPDATE` / `DELETE` / `ALL`    |
| `mechanism`                    | `role`, `branch`, `ownership`, `composite`, `open`   |
| `uses_has_role`                | Boolean                                              |
| `uses_user_has_branch_access`  | Boolean                                              |
| `uses_ownership`               | Boolean (`auth.uid()` in `qual`/`with_check`)        |
| `uses_security_definer_helper` | Any `public.user_has_*` / `is_tenant_owner` call     |
| `candidate_permission_key`     | e.g. `invoices.record.read`, from Permission Catalog |
| `candidate_scope`              | `organization` / `branch` / `own`                    |
| `complexity`                   | `L`ow / `M`edium / `H`igh (see §1.5)                 |

### 1.3 Coverage snapshot by table cluster

| Cluster           | Tables (sample)                                                   | Policies | Notes                                                        |
| ----------------- | ----------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| Clinical core     | patients, medical_records, prescriptions, dental_chart, physio_*  | 44       | Branch + role composite. Highest sensitivity.                |
| Finance           | invoices, invoice_items, payments, expenses, treasury*, coupons   | 79       | Composite: has_role + branch + period guards via triggers.   |
| Inventory         | products, inventory, inventory_transactions, purchase_order*      | 25       | Mostly role-only; branch inferred through joined location.   |
| HR                | staff_profiles, attendance, leave_*, payroll, performance_reviews | 39       | Self-access + HR/admin bundle overrides.                     |
| Config / catalog  | services, procedures, medical_specialties, templates, settings    | 30       | admin-write / authenticated-read; simple migration.          |
| IAM & audit       | role_permissions, user_roles, authz_*, audit_logs                 | 24       | Admin-only. Must NOT loosen; migrate last.                   |
| Storage helpers   | audit_export_presets, notifications, saved_reports                | 15       | Ownership + branch. Straightforward.                         |
| Multi-tenancy SaaS| tenants, subscriptions, saas_invoices, saas_payments              | 12       | `is_tenant_owner()` — orthogonal to app RBAC; leave for now. |

### 1.4 Mechanism buckets

1. **Ownership-only** — `auth.uid() = <owner_col>`. ~10 %. No mapping needed; already correct.
2. **Role-only** — `has_role(auth.uid(), 'x')`. Replace call site with `has_permission(auth.uid(), '<key>')`.
3. **Branch-only** — `user_has_branch_access(branch_id)`. Keep; scope helper stays.
4. **Composite** — role AND branch. Replace role half with permission key; keep branch half.
5. **SECURITY DEFINER helper** — `user_has_branch_access_via_*`. Wrap unchanged; audit for privilege leaks.
6. **Admin-only bypass** — `has_role('admin')`. Replace with `has_permission('<domain>.<op>.<verb>')` where a key exists; otherwise keep `has_role('admin')` under a temporary shim `is_bundle_admin(auth.uid())` for a single release cycle.

### 1.5 Complexity rubric

| Level | Signals                                                                                   |
| ----- | ----------------------------------------------------------------------------------------- |
| L     | Single mechanism; no helper; ≤ 1 role reference; no trigger interaction.                  |
| M     | Composite (role + branch); references one `user_has_*` helper; touched by ≤ 2 triggers.   |
| H     | Multi-role bundle, cross-table joins, period guard triggers, or wallet/treasury domain.   |

---

## 2 · SECURITY DEFINER Function Inventory

All 40+ SECURITY DEFINER functions are grouped by role in the authz surface.

### 2.1 Authorization primitives (retain, wrap, or add sibling)

| Function                                      | Purpose                                 | Wave 3 disposition                                                                 |
| --------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `has_role(uuid, app_role)`                    | Role membership                         | **Keep.** New `has_permission(uuid, text)` added beside it; migrate call sites.    |
| `user_has_branch_access(uuid)`                | Branch scope                            | **Keep unchanged.** Wave 3 scope layer builds on it.                               |
| `user_has_branch_access_via_invoice/*` (×5)   | Scope via linked entity                 | **Keep.** Add unit tests before Wave 3.                                            |
| `is_tenant_owner(uuid)`                       | SaaS tenancy                            | **Keep.** Out of scope for RBAC migration.                                         |
| `realtime_topic_branch_allowed(text)`         | Realtime allowlist                      | **Keep.** Extend allowlist as new topics land.                                     |
| `storage_patient_docs_branch_allowed(text)`   | Storage object gating                   | **Keep.** Verified via storage smoke tests before Wave 3.                          |

### 2.2 Business functions with embedded authorization

Functions that RAISE on role mismatch or silently branch on role:

| Function                             | Current check                              | Required permission (from Catalog)     | Wave 3 action                                                    |
| ------------------------------------ | ------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------- |
| `apply_wallet_tx`                    | admin / manager / receptionist; admin-only for adjustments | `wallet.tx.post`, `wallet.tx.adjust` | Swap RAISE clauses to `has_permission`; keep same behavior.       |
| `fn_treasury_day_cash_summary`       | admin / accountant / manager               | `treasury.day.read`                    | Same swap; add regression fixture per role.                       |
| `tg_staff_self_update_guard`         | admin / hr bypass; else field-lock         | `hr.staff.employment.edit`             | Trigger keeps semantics; replace role check with permission.      |
| `tg_performance_review_self_update_guard` | admin / hr bypass                     | `hr.performance.edit`                  | Same.                                                             |
| `tg_stock_alert_notify`              | Filters recipients by role                 | `inventory.alerts.receive`             | Replace `WHERE ur.role IN (...)` with permission-holder subquery. |
| `tg_appointment_create_notifications`| Filters recipients by role                 | `appointments.notification.receive`    | Same.                                                             |

### 2.3 Data-plumbing functions with no authz (leave alone)

Counter generators (`generate_*_number`), recalc helpers
(`recalc_invoice_*`, `recalc_po_subtotal`, `recalc_commissions_*`), audit
writers (`_audit_write`, `tg_audit_*`), trigger utilities
(`touch_updated_at`, `_tg_*_period_guard`, `tg_po_*`, `tg_invoice_*`,
`tg_product_before_insert`, `tg_staff_before_insert`), template renderer
(`render_template`), cron secret helpers (`_get_cron_secret`,
`_set_cron_secret`), consumables (`fn_consume_for_invoice`), coverage
resolver (`fn_resolve_coverage`), physio validators
(`tg_physio_sessions_validate_appointment`,
`tg_physio_cases_clear_followup_on_close`), `default_treasury_for_branch`,
`get_clinic_logo`, `queue_settings_touch_updated_at`,
`generate_product_sku`, `generate_employee_id`, and the branch cleanup
trigger `tg_branches_cleanup_orphans`.

**Wave 3 policy:** these do not require `has_permission()` on EXECUTE
because their callers (triggers / other definer functions) are already
authorized. Adding EXECUTE gates here would break internal invocation.

### 2.4 EXECUTE-gate candidates (Wave 4+)

Only functions that are (a) directly RPC-callable from the client AND (b)
perform a business decision should gain an EXECUTE-time
`has_permission()` guard **inside the body** (not via `REVOKE EXECUTE`,
which would break triggers). Candidates: `apply_wallet_tx`,
`fn_treasury_day_cash_summary`. Everything else stays trigger-only.

---

## 3 · RPC Inventory

Client-callable RPCs and their target authorization:

| RPC                                | Permission key (target)          | Scope        | Current backend authz                          | Notes                                    |
| ---------------------------------- | -------------------------------- | ------------ | ---------------------------------------------- | ---------------------------------------- |
| `apply_wallet_tx`                  | `wallet.tx.post` / `.adjust`     | branch / org | Internal RAISE on role                         | Convert to `has_permission()` in Wave 3. |
| `fn_treasury_day_cash_summary`     | `treasury.day.read`              | branch       | Internal RAISE on role                         | Same.                                    |
| `has_role`                         | (identity primitive)             | n/a          | Public read via SECURITY DEFINER               | Keep; used by RLS.                       |
| `user_has_branch_access*`          | (scope primitive)                | n/a          | Public read via SECURITY DEFINER               | Keep.                                    |
| `is_tenant_owner`                  | (tenancy primitive)              | tenant       | Public read via SECURITY DEFINER               | Out of scope.                            |
| `realtime_topic_branch_allowed`    | `realtime.subscribe`             | branch       | Definer-scoped                                 | Keep, extend allowlist.                  |
| `storage_patient_docs_branch_allowed` | `patients.documents.read`     | branch       | Definer-scoped                                 | Keep.                                    |
| `fn_resolve_coverage`              | Pure computation, no authz       | —            | STABLE, no side effects                        | No change.                               |
| `get_clinic_logo`                  | Public read                      | —            | STABLE                                         | No change.                               |

No RPCs will change signature in Wave 3. Behavior contract preserved.

---

## 4 · Migration Dependency Graph

```text
                    ┌──────────────────────────┐
                    │ 0. Additive foundation   │  (new: has_permission, permission_for_role view)
                    └────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
 ┌────────────────┐   ┌───────────────────┐   ┌──────────────────┐
 │ 1. Catalog RLS │   │ 2. Ownership-only │   │ 3. HR self-scope │
 │  (services,    │   │  (notifications,  │   │  (attendance,    │
 │  procedures,   │   │  saved_reports,   │   │  leave_requests, │
 │  templates,    │   │  audit_export_    │   │  performance_    │
 │  settings)     │   │   presets)        │   │   reviews)       │
 └───────┬────────┘   └─────────┬─────────┘   └────────┬─────────┘
         │                      │                      │
         └──────────┬───────────┴──────────┬───────────┘
                    ▼                      ▼
        ┌────────────────────┐   ┌────────────────────┐
        │ 4. Inventory RLS   │   │ 5. Finance RLS     │
        │  (products, PO*,   │   │  (invoices, items, │
        │   suppliers, stock)│   │  payments, wallet, │
        └─────────┬──────────┘   │  treasury, coupons)│
                  │              └─────────┬──────────┘
                  ▼                        ▼
        ┌────────────────────┐   ┌────────────────────┐
        │ 6. Clinical RLS    │   │ 7. Business defs   │
        │  (patients, MR,    │   │  (apply_wallet_tx, │
        │  Rx, dental, phy*) │   │  treasury_summary) │
        └─────────┬──────────┘   └─────────┬──────────┘
                  └───────────┬────────────┘
                              ▼
                    ┌────────────────────┐
                    │ 8. IAM & audit RLS │  (last: role_permissions,
                    │                    │   user_roles, authz_*,
                    └─────────┬──────────┘   audit_logs)
                              ▼
                    ┌────────────────────┐
                    │ 9. Cleanup / drop  │  (retire temporary
                    │  shims             │   `is_bundle_admin` shim)
                    └────────────────────┘
```

**Independent batches:** 1, 2, 3, 4 can ship in any order (no shared
helper edits).  
**Serial dependencies:** 5 depends on the wallet/treasury definer swap
landing in 7; 8 must be last so the very tables that gate IAM edits are
never in an intermediate state.  
**High-risk:** 5, 6, 8. Everything else is low or medium risk.

---

## 5 · `has_role()` Usage Classification

| Class          | Sites                                                     | Action                                                                                  |
| -------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Replace**    | 286 policy call sites + ~6 definer bodies (§2.2)          | Swap for `has_permission(auth.uid(), '<key>')` per Permission Catalog mapping.          |
| **Keep temp.** | Notification-recipient filters (`WHERE ur.role IN (...)`) | Migrate in Wave 3 Batch 4/5 alongside the corresponding domain table.                   |
| **Keep perm.** | Auth triggers on `user_roles` / `role_permissions` audit  | These write history about roles; `has_role` reference is descriptive, not decision.     |
| **Remove**     | None during Wave 3                                        | `has_role()` itself is retained. Removal is deferred to Wave 5 (post-adoption cleanup). |

No policy loses admin bypass. Where a Permission Catalog key does not yet
exist for an "admin-only" surface (e.g. tenants, saas_invoices), the
admin bypass is preserved via a temporary `is_bundle_admin(auth.uid())`
shim that simply calls `has_role(auth.uid(), 'admin')`. The shim is
dropped in Batch 9.

---

## 6 · Ordered Backend Migration Plan

Every batch: additive migration → parity tests → soak (1 release) → swap
old policy → drop only after next release confirms clean.

### Batch 0 — Foundation (additive; zero policy edits)
- Add `public.has_permission(_user_id uuid, _permission text) returns boolean` (SECURITY DEFINER, STABLE) that resolves via `authz_role_bundles` → `authz_bundle_permissions` → `authz_permissions.key`, plus role-bundle transitive closure through `authz_bundle_implies`.
- Add `public.is_bundle_admin(_user_id uuid)` transitional shim.
- Add view `public.v_effective_permissions` (user_id, permission_key) for tests.
- **Regression:** parity test `has_permission == has_role` for every seeded (role, permission) pair.
- **Rollback:** `DROP FUNCTION has_permission, is_bundle_admin; DROP VIEW v_effective_permissions`.

### Batch 1 — Catalog & settings RLS (Low)
Tables: services, service_categories, procedures, medical_specialties, diagnoses, medications, sms_templates, email_templates, whatsapp_templates, communication_templates, invoice_settings, appointment_settings, notification_settings, clinic_settings, reminders_settings equivalents, insurance_companies, insurance_contracts, insurance_contract_rules, loyalty_settings, payment_methods, expense_categories, product_categories, staff_positions, departments, leave_types, medical_specialties, system_languages, subscription_plans, subscription_addons.  
- Duplicate each policy under a new `*_v2` name using `has_permission` and drop the old after soak.  
- **Regression:** for every (role, catalog-table, op) combination, assert `pg_authenticate_as(role_user) → SELECT/INSERT/UPDATE/DELETE` returns identical row set / same permission-denied error.  
- **Rollback:** drop `*_v2` policies; originals untouched.

### Batch 2 — Ownership-only RLS (Low)
Tables: notifications, saved_reports, audit_export_presets, saas_payments (owner), profiles (self).  
- Ownership rules are already correct; the batch normalizes them to reference `has_permission('notifications.receive')` etc. for admin surfaces only.  
- **Regression:** self-visibility + admin visibility unchanged; anon still blocked.  
- **Rollback:** drop `*_v2`.

### Batch 3 — HR self-scope RLS (Medium)
Tables: staff_profiles, attendance, leave_requests, leave_types, performance_reviews, payroll, salary_adjustments, staff_targets, staff_branches, work_schedules, salary_adjustments.  
- Preserve the `hr` / `admin` bundle bypass via `has_permission('hr.<res>.<verb>')`.  
- Self-edit fields remain gated by `tg_staff_self_update_guard` and `tg_performance_review_self_update_guard`.  
- **Regression:** matrix test for (employee, manager, hr, admin) × (own row, peer row) × (SELECT, UPDATE).  
- **Rollback:** drop `*_v2`; guards unchanged.

### Batch 4 — Inventory RLS (Medium)
Tables: products, product_categories, inventory, inventory_transactions, purchase_orders, purchase_order_items, suppliers, stock_alerts, service_consumables.  
- Composite (role + branch). Replace role half only.  
- **Regression:** stock movements, PO create/receive, low-stock alert visibility across 3 branches × 4 roles.  
- **Rollback:** drop `*_v2`.

### Batch 5 — Finance RLS (High)
Tables: invoices, invoice_items, payments, expenses, treasury, treasury_transactions, treasury_daily_closes, coupons, coupon_redemptions, doctor_commissions, patient_wallets, patient_wallet_transactions.  
- Requires Batch 7 (definer swap) to be already staged so policies and functions agree.  
- Period guards remain on triggers, unmodified.  
- **Regression:** end-to-end (create invoice → partial payment → refund → wallet spend → daily close) per role, with row counts and totals asserted.  
- **Rollback:** drop `*_v2`; wave-3 definer changes remain but are behavior-compatible.

### Batch 6 — Clinical RLS (High)
Tables: patients, medical_records, medical_history, prescriptions, prescription_items, record_diagnoses, record_procedures, dental_chart, patient_documents, vital_signs, treatment_plans, treatment_sessions, physio_cases, physio_sessions, physio_reassessments.  
- Highest sensitivity — depends on `user_has_branch_access_via_medical_record` and `_via_treatment_plan`. Helpers stay untouched.  
- **Regression:** doctor-only, cross-branch-deny, admin-org-wide tests + PHI export sanity.  
- **Rollback:** drop `*_v2`.

### Batch 7 — Business definer functions (Medium)
Functions: `apply_wallet_tx`, `fn_treasury_day_cash_summary`, `tg_staff_self_update_guard`, `tg_performance_review_self_update_guard`, `tg_stock_alert_notify`, `tg_appointment_create_notifications`.  
- Replace `has_role(...)` calls with `has_permission(...)` inside each body. No signature change.  
- **Regression:** unit tests per function, each seeded role must produce identical PASS/RAISE outcomes to today's snapshot.  
- **Rollback:** `CREATE OR REPLACE FUNCTION ...` back to prior body (kept in migration file header comment).

### Batch 8 — IAM & audit RLS (High, last)
Tables: role_permissions, user_roles, authz_permissions, authz_bundles, authz_bundle_permissions, authz_bundle_implies, authz_role_bundles, audit_logs, user_activity_logs.  
- Preserve `admin-only` posture via `has_permission('iam.roles.edit')` and `has_permission('audit.logs.read')`.  
- Must be the last batch — these tables gate every other bundle assignment.  
- **Regression:** admin can still edit; non-admin still cannot read audit_logs; anon still blocked. Break-glass path documented in security memory.  
- **Rollback:** drop `*_v2`; originals restore instantly.

### Batch 9 — Cleanup (Low)
- Retire `is_bundle_admin` shim.  
- Drop `*_v2` naming by renaming to canonical.  
- **Regression:** re-run every prior batch's suite.  
- **Rollback:** rename back; shim reinstatable in one migration.

---

## 7 · Regression Test Requirements (per batch)

Each batch ships with a pgTAP or SQL-based fixture file under
`supabase/tests/authz/batchN.sql`:

1. **Seed** a synthetic user per role (admin, manager, doctor, nurse, receptionist, hr, accountant, physio) linked to two branches.
2. **Snapshot** `SELECT count(*) FROM <table>` per (role, table) BEFORE migration.
3. **Apply** the additive migration.
4. **Assert** `count(*)` and `permission_denied` responses are IDENTICAL post-migration.
5. **Assert** `EXPLAIN` shows the same helper functions in the plan.
6. **Cross-check** with the frontend Playwright RBAC deep suite
   (`tests/playwright/rbac.deep.spec.ts`).

No batch may ship if any assertion diverges from the pre-migration snapshot.

---

## 8 · Rollback Strategy

Every batch uses **additive-then-swap**:

```
step 1: create *_v2 policy / new function body
step 2: run parity tests against both
step 3: soak for one release window
step 4: drop old policy / restore function on failure
```

Instant-rollback rules:

- **RLS batches:** rollback = `DROP POLICY <name>_v2 ON <table>`. The
  legacy policy was never removed, so effective authorization reverts in
  a single migration.
- **Function batches (7):** each `CREATE OR REPLACE FUNCTION` migration
  includes the previous body inline as a comment; rollback replays that
  exact body.
- **Foundation (0):** rollback drops the new function/view; nothing else
  depends on them until Batch 1 ships.
- **Cleanup (9):** rollback re-adds the `is_bundle_admin` shim and
  renames policies back. Migration ordering makes this a 5-line SQL
  operation.

No batch requires data movement, so no data rollback is ever needed.

---

## 9 · Success Criteria for Wave 3 Kickoff

Wave 3 may begin only when:

- [ ] Batch 0 foundation is designed with signatures matching this doc.
- [ ] Every table in §1.3 has a candidate permission key assigned in the Permission Catalog.
- [ ] Every function in §2.2 has an owning permission key.
- [ ] pgTAP harness exists and green on today's schema.
- [ ] Frontend `AuthorizationService.can("<key>")` returns identical
      answers to `has_permission(auth.uid(), '<key>')` for every seeded
      user (front↔back parity gate).

Until all five boxes are checked, Wave 3 remains blocked.