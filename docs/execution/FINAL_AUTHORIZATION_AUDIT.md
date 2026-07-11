# Final Authorization Audit — Post-Migration 2

**Date:** 2026-07-11
**Scope:** Repository-wide, read-only. No code, migration, or DB changes.
**Migrated slices (status = `complete`):** settings, patients, medical_records, hr, invoices.

---

## 1. Legacy authorization inventory (remaining matches)

Scanned `src/**/*.{ts,tsx}` (excluding tests) for every pattern in the audit brief.

### 1.1 `<Can module="…">` — 10 call sites

| # | File:Line | Module referenced | Owning slice of file | Classification |
|---|---|---|---|---|
| 1 | `src/pages/hr/StaffDetail.tsx:215` | `settings` | hr (complete) | **Cross-slice dependency** — gates admin-only "edit staff" UI on `settings.edit`. Not forbidden by HR invariant (HR forbids only `module="hr"`). Legacy but legitimate. |
| 2 | `src/pages/patients/PatientProfile.tsx:332` | `treatment_plans` | patients (complete) | **Future slice** — `treatment_plans` not yet migrated. |
| 3 | `src/pages/patients/PatientProfile.tsx:337,349` | `medical_records` | patients (complete) | **Cross-slice dependency** on a completed slice. Polish candidate: swap to `permission="medical_records.view/create"`. |
| 4 | `src/pages/patients/PatientProfile.tsx:395` | `invoices` | patients (complete) | Cross-slice into completed `invoices`. Polish candidate. |
| 5 | `src/pages/patients/PatientWalletTab.tsx:99` | `invoices` | patients (complete) | Cross-slice into completed `invoices`. Polish candidate. |
| 6 | `src/pages/patients/PatientTreatmentPlans.tsx:240` | `treatment_plans` | patients (complete) | Future slice. |
| 7 | `src/pages/physio/PhysioCases.tsx:158` | `medical_records` | physio (not migrated) | Future slice. |
| 8 | `src/pages/physio/PhysioCaseDetail.tsx:192,240,294,345,349` | `medical_records` | physio (not migrated) | Future slice. |
| 9 | `src/pages/invoices/OutstandingDebts.tsx:142` | `payments` | invoices (complete) | Cross-slice — `payments` not a completed slice. |
| 10 | `src/components/CanExport.tsx:12` | dynamic `{module}` | shared component | **False positive** — canonical export wrapper; delegates through `<Can>`. |

None of these matches falls inside any completed slice's `forbiddenLegacyPatterns` for its own owned module. The invariant test (`completedSlices.invariant.test.ts`) is green.

### 1.2 `usePermissions()` — 8 call sites

| File | Classification |
|---|---|
| `src/hooks/usePermissions.ts` | Legitimate — hook definition. |
| `src/lib/authz/useAuthorization.ts` | Legitimate — canonical adapter wraps `usePermissions` internally. |
| `src/lib/authz/{settings,patients,medical,hr,invoices}ShadowProbe.ts` (5) | Legitimate — shadow probes, retained per instruction. |

No production page/component under any completed slice calls `usePermissions()` or `.can(module, …)` directly.

### 1.3 `.can(module, …)` on legacy module ids

`rg "\.can\(\s*['\"](settings|patients|medical_records|hr|invoices)['\"]\s*,"` inside `src/pages/{settings,patients,medical,hr,invoices,payments}` → **0 matches**.

### 1.4 Direct role-name / role-boolean checks

- `role === '…'` / `role == '…'` outside tests → **0 matches** (the sole hit is a doc comment in `AuthorizationService.ts:126`).
- `isManager`, `isHR`, `isDoctor`, `isReceptionist`, `isAccountant`, `isNurse` helpers → **0 matches**. None exist.
- `isAdmin` (23 occurrences) — all inside:
  - `src/hooks/useUserRole.ts`, `src/hooks/usePermissions.ts` — canonical role source.
  - `src/lib/authz/AuthorizationService.ts`, `src/lib/authz/useAuthorization.ts` — service internals.
  - `src/pages/settings/QAIdentities.tsx` — legitimate admin-only bootstrap route that must gate BEFORE permission data is loaded.

### 1.5 Verdict

| Classification | Count |
|---|---|
| Regression (violates completed-slice invariant) | **0** |
| Legitimate cross-slice / future slice / bootstrap | 17 |
| False positive | 1 |
| Dead code | 0 |

---

## 2. Direct writes to gated identity tables

### 2.1 `role_permissions`
`RolePermissions.tsx:56` and `usePermissions.ts:47` — both `.select` (reads). **Writes: 0.** All matrix mutations route through `settings_save_role_permissions`.

### 2.2 `employee_id_counter`
No client-side references. Only touched by `generate_employee_id()` (invoked from `settings_assign_user_role`).

### 2.3 `user_roles`

**Reads (permitted, all `.select`)**: `useUserRole.ts`, `usePermissions.ts`, `systemSelfAudit.ts`, `calendar/CalendarPage.tsx`, `reports/DoctorPerformance.tsx`, `patients/EditPatientDialog.tsx`, `patients/PatientTreatmentPlans.tsx`, `physio/PhysioCaseDetail.tsx`, `settings/UserManagement.tsx:226,268`, `hr/StaffDetail.tsx:64,93`.

**Writes outside the two approved RPCs:**

| File:Line | Op | Context | Verdict |
|---|---|---|---|
| `src/pages/hr/StaffDetail.tsx:108` | `.delete().eq('user_id', linkedUid)` | `unlinkUser()` — revokes all roles when unlinking a staff user. | ⚠️ **Technical debt.** Not blocked by the Settings-slice invariant (scoped to `src/pages/settings`). Semantically identical to the write surface protected by `settings_assign_user_role`. Currently protected by the `user_roles` RLS policy (admin/manager). |
| `src/pages/hr/StaffDetail.tsx:157` | `.delete().eq('user_id', prevLinkedUid)` | `confirmLink()` in `replace` mode. | ⚠️ Same as above. |

No `insert`/`update`/`upsert` on `user_roles` outside `settings_assign_user_role`.

### 2.4 Verdict
- Regressions inside the Settings slice's protected surface: **0**.
- Cross-slice policy gap (HR): 2 `.delete()` calls in `StaffDetail.tsx`. Documented as debt in §5.

---

## 3. Completed-slice canonical-model conformance

| Slice | Owned path | Legacy `<Can module="<slice>">` inside path | Legacy `.can('<slice>', …)` inside path | Direct writes to gated tables | Status |
|---|---|---|---|---|---|
| settings | `src/pages/settings` | 0 | 0 | 0 write (SELECT-only) | ✅ Canonical |
| patients | `src/pages/patients` | 0 | 0 | n/a | ✅ Canonical |
| medical_records | `src/pages/medical` | 0 | 0 | n/a | ✅ Canonical |
| hr | `src/pages/hr` | 0 | 0 | n/a for Settings scope (see §2.3 debt) | ✅ Invariant-clean |
| invoices | `src/pages/invoices`, `src/pages/payments` | 0 | 0 | n/a | ✅ Canonical |

All five completed slices pass their permanent invariant.

---

## 4. SECURITY DEFINER function catalog (106 total, `public` schema)

### 4.1 Approved Settings-cutover RPCs (2) — new in Migration 2

| Function | Caller | Auth check | Required? |
|---|---|---|---|
| `settings_assign_user_role(_target_user_id, _new_role, _branch_id)` | `settings/UserManagement.tsx` | `has_role(auth.uid(), 'admin')`; raises `Forbidden` otherwise. | ✅ Yes. |
| `settings_save_role_permissions(_matrix jsonb)` | `settings/RolePermissions.tsx` | `has_role(auth.uid(), 'admin')`. | ✅ Yes. |

### 4.2 Authorization primitives (5)
`has_role`, `has_permission`, `authz_current_state`, `authz_current_version(s)`, `authz_has_permissions`, `authz_record_shadow_decision` (2 overloads) — all required; predicates and shadow telemetry, self-scoped to `auth.uid()`.

### 4.3 Branch-scope helpers (9)
`current_user_branch_id`, `user_has_branch_access`, `user_has_branch_access_via_{invoice,medical_record,patient,physio_case,prescription,purchase_order,treasury,treatment_plan}`, `realtime_topic_branch_allowed`, `storage_patient_docs_branch_allowed` — called from RLS/Realtime/Storage hooks. Required.

### 4.4 Transactional business RPCs (~16)
`add_treasury_tx`, `apply_inventory_tx`, `apply_wallet_tx`, `apply_coupon_code`, `fn_consume_for_invoice`, `fn_resolve_coverage`, `fn_treasury_day_cash_summary`, `receive_po_item`, `recalc_invoice_{payments,subtotal}`, `recalc_po_subtotal`, `recalc_commissions_for_invoice`, `staff_target_actual`, `default_treasury_for_branch`, `_treasury_assert_open_period`, `enqueue_appointment_reminders`. Each atomic multi-step mutation; role guards where admin/manager-only, otherwise delegate to underlying RLS. All required.

### 4.5 Merge / renumber utilities (3)
`merge_staff_position`, `renumber_active_invoices`, `renumber_active_patient_codes` — admin maintenance; `has_role(..., 'admin')` guarded. Required.

### 4.6 Counters / generators (5)
`generate_employee_id`, `generate_invoice_number`, `generate_po_number`, `generate_product_sku`, `generate_saas_invoice_number` — sequence advancers on tables without direct grants. Required.

### 4.7 Audit / self-audit helpers (5)
`_audit_write`, `expense_treasury_self_audit`, `check_expiry_alerts`, `audit_treasury_daily_closes_v2`, `audit_treasury_tx_v2`. Required.

### 4.8 Cron / infra plumbing (3)
`_get_cron_secret`, `_set_cron_secret`, `_tg_expense_period_guard`. Required.

### 4.9 Trigger functions (~55, `tg_*` / `trg_*`)
All are SECURITY DEFINER triggers on specific tables (audit, cascade, denormalization). Not client-callable via PostgREST. Required.

### 4.10 Auth bootstrap (2)
`handle_new_user`, `is_tenant_owner`. Required.

### 4.11 Verdict
- Total: **106**. New in Migration 2: **2**. No DEFINER function is redundant; **0 removal candidates.**

---

## 5. Recommended cleanup candidates (non-blocking)

1. **Polish canonical `<Can permission="…">` migration** for cross-slice references inside completed slices (`PatientProfile.tsx`, `PatientWalletTab.tsx`, `OutstandingDebts.tsx`). Zero behavior change.
2. **Close HR `user_roles` delete gap** (`StaffDetail.tsx:108,157`). Options: extend `settings_assign_user_role` with a `_clear := true` mode, or add a small `hr_unlink_staff_user` DEFINER RPC.
3. **Retire physio `module="medical_records"` legacy refs** when the physio slice migrates.
4. **Shadow-framework retirement** — probes, `authz_shadow_decisions` telemetry, `.github/workflows/*-shadow-qa.yml`, and the two `authz_record_shadow_decision` overloads. Explicitly deferred per instruction; do not touch until at least one stable production release after Migration 2.

---

## 6. Security observations

- Every completed slice routes gated writes exclusively through either RLS (where policies are first-class allowlists) or the two Settings DEFINER RPCs.
- No client bundle contains a raw role-name comparison, an `is<Role>` helper, or a `.can('<completed-slice>', …)` call.
- `isAdmin` bypasses are contained to authz internals and one admin-only bootstrap page (`QAIdentities.tsx`).
- DEFINER surface unchanged apart from the 2 approved additions; both enforce `has_role(auth.uid(), 'admin')` at entry.
- RLS unchanged. Permission bundles unchanged. Shadow infrastructure intact.
- Sole security debt: HR `user_roles.delete` gap (§2.3). Severity **low** (RLS still blocks non-admin/manager), priority **medium** (funnel through single audited RPC).

---

## 7. Final production readiness assessment

| Criterion | Result |
|---|---|
| All 5 slices `status = "complete"` in `completedSlices.ts` | ✅ |
| Permanent invariant test passes for every completed slice | ✅ |
| Zero legacy `<Can module="<slice>">` inside owned paths | ✅ |
| Zero legacy `.can('<slice>', …)` inside owned paths | ✅ |
| Zero direct writes to `user_roles`/`role_permissions`/`employee_id_counter` inside `src/pages/settings` | ✅ |
| Exactly 2 new SECURITY DEFINER RPCs introduced | ✅ |
| RLS unchanged | ✅ |
| Permission bundles unchanged | ✅ |
| Shadow infrastructure preserved | ✅ |
| Cross-slice legacy references documented and classified | ✅ |
| Outstanding technical debt inventoried | ✅ |

**Verdict:** ✅ **Production-ready.** Migration 2 is complete for all five vertical slices. The residual legacy authorization surface consists exclusively of (a) cross-slice references awaiting later slice migrations, (b) a documented HR `user_roles.delete` funneling opportunity, and (c) the deliberately-retained shadow framework. None constitutes a regression, blocker, or security defect for the current cutover.

---

*This report is read-only. No files, migrations, or database objects were modified.*
