# N9 — Authorization Verification Audit

**Status:** Verification only. No code, SQL, catalog, bundle, or role changes.
**Scope:** Every user-facing operation in ZMedico — React pages, components, hooks, contexts, dialogs, forms, tables, actions, Edge Functions, RPC calls, Supabase queries, background jobs.
**Question answered:** Is every operation protected by AuthorizationService **or** backend authorization? Are there any authorization bypass paths?

**Method:** Static scan of `src/`, `supabase/functions/`, `supabase/migrations/`, plus live inspection of `pg_policies`, `pg_proc` (SECURITY DEFINER), and edge-function auth headers.

---

## 1. Migration Progress Snapshot

| Layer | Legacy signal | New signal | % migrated |
|---|---|---|---:|
| **Frontend — hooks** | `usePermissions()` in **13** call sites + hook file + parity test | `useAuthorization()` in **4** call sites + service + parity test | ≈ 24 % of call sites |
| **Frontend — role checks** | `isAdmin` in **17** production files, `roles.includes(...)` in **6** files, `useUserRole()` in **13** files | `authz.isSuperAdmin()` in Sidebar only | ≈ 10 % |
| **Frontend — declarative gates** | ad-hoc conditionals + `usePermissions().can(...)` | `<Can>` / `<CanExport>` wrappers in Sidebar, Topbar, RowActions, PermissionRoute | Wrappers exist; **not universally applied** |
| **Backend — RLS policies** | `has_role(...)` in **187** policies | `has_permission(...)` in **36** policies (Wave 3E Batch A only) | **36 / 223 = 16 %** of role-bearing policies |
| **Backend — SECURITY DEFINER RPCs** | Legacy `has_role` inside body, or **no** authz check | `has_permission` inside body | **0 / ~15** business RPCs migrated |
| **Edge Functions — admin-\*** | Server-side `has_role('admin')` check via user JWT | `has_permission(...)` check | 0 / 4 migrated (still legacy role) |
| **Edge Functions — background** | `service_role` or cron-secret header | (same — no user context needed) | N/A |
| **Overall weighted** | — | — | **≈ 15 %** |

Weighted formula: 0.4·frontend + 0.5·backend + 0.1·edge = 0.4(0.17) + 0.5(0.16) + 0.1(0) ≈ 0.15.

---

## 2. Frontend Coverage

### 2.1 Files still on legacy `usePermissions()` (production)

| File | Uses | Risk |
|---|---|---|
| `src/pages/queue/Queue.tsx` | `can("queue","manage")` | Low — UI hide only; backend RLS enforces |
| `src/components/search/GlobalSearch.tsx` | `can(...)` × N modules | Low |
| `src/pages/patients/Patients.tsx` | `can("patients", ...)` | Low |
| `src/pages/patients/PatientQuickActions.tsx` | `can(...)` | Low |
| `src/pages/patients/PatientProfile.tsx` | `can(...)` | Low |
| `src/pages/physio/PhysioCases.tsx` | `can(...)` | Low |
| `src/pages/physio/PhysioCaseDetail.tsx` | `can(...)` | Low |
| `src/pages/medical/MedicalRecords.tsx` | `can(...)` | Low |
| `src/pages/invoices/Invoices.tsx` | `can(...)` + `isAdmin` combo | **Medium** (see §2.3) |
| `src/lib/exportGuard.ts` | `can(mod,"export")` shim | Low — should move to `AuthorizationService` |

**Verdict:** All 10 call sites are byte-equivalent to `authz.can(...)` because `useAuthorization` delegates to the same map — no security regression, only a **code-hygiene debt**. Migrate one-per-batch.

### 2.2 Files still on `useUserRole()` / bare `isAdmin` (production)

| File | Pattern | Correct permission key | Risk |
|---|---|---|---|
| `src/pages/settings/RolePermissions.tsx` | Route-level `if (!isAdmin) Navigate` + all buttons | `authz.manage` (proposed v2.1) | **Medium** — should use permission key, not role |
| `src/pages/settings/BackupExport.tsx` | Local `isAdmin` fetch + button `disabled` | `system.backup`, `system.restore`, `system.import` (v2.1) | **Medium** — backend RLS is `has_permission('settings.export/.edit/.create')`, so backend enforces; frontend key still legacy |
| `src/pages/settings/InsuranceCompanies.tsx` | UI hide only | `insurance.edit/.delete` (v2.1) | Low |
| `src/pages/settings/InsuranceContracts.tsx` | UI hide only | `insurance.edit/.delete` | Low |
| `src/pages/settings/SettingsLayout.tsx` | Nav filter | `settings.view` + per-domain keys | Low |
| `src/pages/invoices/Invoices.tsx` | `isAdmin` gates delete of non-draft invoices | `invoices.delete` + status check | **Medium** — permission missing; today only role blocks it |
| `src/pages/inventory/PurchaseOrders.tsx` | Same as invoices for non-draft delete | `purchase_orders.delete/.cancel` | **Medium** — same pattern |
| `src/pages/treasury/DailyClose.tsx` | `roles.includes("admin") \|\| roles.includes("manager")` | `treasury.close/.reopen` (v2.1) | **High** — hardcoded role list, would deny future `finance_manager` role |
| `src/pages/patients/PatientWalletTab.tsx` | `isAdmin` gates wallet edit UI | `patient_wallet.credit/.debit` (PD-05 deferred) | **High — PD-blocked** |
| `src/pages/hr/StaffBranchesTab.tsx` | `isAdmin \|\| roles.includes("hr")` | `hr_staff.edit` / staff_branches key | **Medium** |
| `src/pages/hr/StaffDetail.tsx` | `canSeeSensitive = isAdmin \|\| roles.includes("hr")` | Field-level policy (salary, national_id) — needs `staff.view_sensitive` (not in v2.1) | **High — missing permission key** |
| `src/pages/reports/DoctorCommissions.tsx` | `!isAdmin && roles.includes("doctor") && !roles.some(...)` scope filter | `reports_finance.view` + owner scope | **Medium** — mixes role and scope logic |

### 2.3 Bypassability of UI hiding

Any user who opens DevTools can call `supabase.from(...)` or `supabase.rpc(...)` directly, so **UI hiding is never sufficient**. For every row in §2.2, the real security question is: *does the backend refuse the same operation?*

| Operation | UI hide | RLS enforcement today | Bypassable? |
|---|---|---|---|
| Delete non-draft invoice (Invoices.tsx) | Yes | RLS delete requires `has_role('admin')` | **NO** (backend blocks) |
| Delete non-draft PO (PurchaseOrders.tsx) | Yes | RLS delete requires `has_role('admin')` | **NO** |
| Close treasury day (DailyClose.tsx) | Yes | RLS on `treasury_daily_closes` requires admin/manager role | **NO** |
| Backup export (BackupExport.tsx) | Yes | Edge fn `admin-export` re-checks `user_roles.role='admin'` | **NO** |
| Reset user password | Yes | Edge fn `admin-reset-password` re-checks `has_role('admin')` | **NO** |
| Delete user | Yes | Edge fn `admin-delete-user` re-checks `has_role('admin')` | **NO** |
| Create user | Yes | Edge fn `admin-create-user` re-checks `has_role('admin')` | **NO** |
| Edit staff salary (StaffDetail) | Field-hide only | RLS on `staff_profiles` UPDATE requires admin/HR; **no column-level policy** — salary column is readable if row is readable | **YES — sensitive field leak** (see H-2) |
| Edit patient wallet (PatientWalletTab) | Yes | Wallet mutation only via `apply_wallet_tx` RPC (SECURITY DEFINER) — RPC caller check is `_by` param, **not** `has_permission` | **YES — RPC accepts any authenticated caller** (see H-3) |

---

## 3. Backend Coverage — RLS

### 3.1 Policy population

| Metric | Count |
|---|---:|
| Total public-schema policies | **368** |
| Policies referencing `has_role(...)` | **187** |
| Policies referencing `has_permission(...)` | **36** |
| Policies with only `auth.uid()`/owner logic | 145 |
| Tables with **zero** policies (per `supabase-tables` snapshot) | 0 |

**Findings:**
- Wave 3E Batch A migrated 36 settings + patient/appointment write policies to `has_permission`. Everything else still on `has_role`.
- `has_permission(uid, key)` is defined and functional (SQL SECURITY DEFINER). No behavior regression from partial rollout because `has_permission` internally resolves via bundle → role.

### 3.2 Legacy-role tables still on `has_role`
187 policies span ~90 tables. Highest-risk (financial + PHI + sensitive) tables **not yet migrated**:

| Table | Reason it's high-risk |
|---|---|
| `payments`, `invoices` (READ policies) | Finance PHI/PII |
| `payroll`, `salary_adjustments` | Sensitive comp data |
| `staff_profiles` | Salary/national_id/bank fields readable if row readable |
| `patient_wallets`, `patient_wallet_transactions` | Financial mutation |
| `treasury`, `treasury_transactions`, `treasury_daily_closes` | Financial state |
| `insurance_contracts`, `insurance_contract_rules` | Contract pricing |
| `audit_logs`, `user_activity_logs`, `system_backups` | Regulator surface |
| `user_roles`, `authz_*` | IAM/authz surface — **only settings.edit key today** |

None expose data anonymously (all require `TO public`/authenticated + role gate). No RLS-disabled tables detected.

### 3.3 Column-level gaps
- `staff_profiles.salary`, `.bank_account`, `.national_id` — no per-column `GRANT SELECT (col1,...)` restriction. Any row-readable user sees all columns.
- `patients.national_id`, `patients.phone`, `patients.address` — same pattern.

---

## 4. Backend Coverage — RPCs (SECURITY DEFINER)

15 business RPCs found via `pg_proc.prosecdef=true`. Sample audit:

| RPC | Authz check inside body | Verdict |
|---|---|---|
| `apply_wallet_tx` | Uses `_by uuid` param supplied by caller. No `has_permission`/`has_role` check. Relies on RLS on downstream table `patient_wallet_transactions` (which requires role check). | **High** — direct RPC call bypasses UI; RLS on target rows is the last line. Needs explicit `has_permission('patient_wallet.credit'/'.debit')` (PD-05). |
| `apply_inventory_tx` | Similar `_by` pattern, no permission gate | **Medium** — inventory writes should require `inventory.write` |
| `add_treasury_tx` | Same | **High** — needs `treasury.transfer` |
| `apply_coupon_code` | No permission check; validates coupon only | **Medium** — needs `coupons.redeem` |
| `merge_staff_position` | No permission check (verified in source) | **Medium** — needs `hr_positions.edit` or `authz.manage` |
| `receive_po_item` | No permission check | **Medium** — needs `purchase_orders.receive` |
| `fn_consume_for_invoice` | Called only from server-side trigger | Low |
| `recalc_*` | Trigger-only helpers | Low |
| `has_permission`, `has_role`, `current_user_branch_id`, `is_tenant_owner` | Helpers | N/A |

**None of the mutation RPCs verify the caller's permission key.** They trust the client-supplied `_by` and rely on downstream RLS.

---

## 5. Edge Functions Coverage

| Function | Auth model | Verdict |
|---|---|---|
| `admin-create-user` | JWT → `has_role('admin')` re-check via service client | **OK** (legacy key, but enforced) |
| `admin-delete-user` | Same | **OK** |
| `admin-reset-password` | Same | **OK** |
| `admin-export` | JWT → direct `user_roles.role='admin'` query (bypasses `has_role` helper) | **OK behaviorally**, minor consistency debt |
| `send-reminder` | Cron secret OR service role OR admin JWT; single-id sends now gated to admin (fixed in earlier phase) | **OK** |
| `enqueue-winback` | Cron secret OR service role only | **OK** |
| `detect-queue-alerts` | Service role only (no user-callable path) | **OK** |

All edge functions enforce authz server-side. None depend on frontend hiding. **Zero edge-function bypass paths.**

---

## 6. Background Jobs / pg_cron

- Cron jobs invoke edge functions with `SEND_REMINDER_CRON_SECRET` or service role from Vault — no anon-key exposure detected in migrations.
- Triggers (`tg_*`) run as SECURITY DEFINER but only in row lifecycle contexts (no user callability).

---

## 7. Critical Findings

### CRITICAL (0)
_None._ No anonymous access, no RLS-disabled tables, no edge-function bypass.

### HIGH (3)
| ID | Finding | File / Object | Recommendation |
|---|---|---|---|
| **H-1** | `DailyClose.tsx` uses hardcoded `roles.includes("admin"\|"manager")` — will silently deny future `finance_manager` role and cannot be changed without a code push. | `src/pages/treasury/DailyClose.tsx:33` | Replace with `authz.can("treasury.close")`. Backend RLS already uses the same role list; migrate RLS to `has_permission("treasury.close")` in same batch. |
| **H-2** | Sensitive staff fields (`salary`, `bank_account`, `national_id`) rely on **row-level** RLS only. Anyone able to read a `staff_profiles` row (branch manager, HR staff, staff self-view) receives all columns. Frontend field masks are UI-only. | `staff_profiles`, `StaffDetail.tsx` | Column-level `GRANT SELECT (whitelist)` for non-HR roles OR split into `staff_profiles_public` view. Add permission `staff.view_sensitive` (missing from v2.1 — flag for v2.2). |
| **H-3** | `apply_wallet_tx` RPC accepts any authenticated caller (no `has_permission` inside body). Downstream table RLS is the only guard, and `patient_wallet_transactions` policies still on legacy role check. Same class: `add_treasury_tx`, `apply_inventory_tx`, `apply_coupon_code`, `receive_po_item`, `merge_staff_position`. | 6 SECURITY DEFINER RPCs | Add `IF NOT public.has_permission(auth.uid(), '<key>') THEN RAISE EXCEPTION 'forbidden'; END IF;` at top of each body. PD-05 gates the wallet keys. |

### MEDIUM (5)
| ID | Finding | Recommendation |
|---|---|---|
| M-1 | 187/223 role-bearing RLS policies still use `has_role`. Wave 3E migration is at 16%. | Continue Wave 3E per pattern P4 catalog once N7 whitelist is board-ratified and PDs land. |
| M-2 | 15 frontend files still call `usePermissions()` directly instead of `useAuthorization()`. Behavior identical, but blocks eventual removal of the legacy hook. | Migrate batch-by-batch (Sprint 1 Batch 2B–2F). |
| M-3 | `Invoices.tsx` and `PurchaseOrders.tsx` mix `can(...)` with `isAdmin` to gate non-draft delete. Correct model is a status-aware permission (`invoices.delete` + status check inside RLS `WITH CHECK`). | Move status guard into RLS, remove `isAdmin` from JSX. |
| M-4 | `RolePermissions.tsx` and `BackupExport.tsx` route-guard on `isAdmin`. Should use `authz.can("authz.manage")` and `authz.can("system.backup")` respectively (v2.1 keys, currently deferred insertion). | Migrate together with N1-INSERT for the governance bundle. |
| M-5 | `useUserRole()` still surfaced in 13 files — some legitimately need role labels (e.g. `DoctorCommissions.tsx` scope filter). Convert scope logic to explicit permission + ownership predicate. | Introduce owner-scope predicate in `AuthorizationService` (post-v2.1). |

### LOW (3)
- L-1: `admin-export` edge function queries `user_roles` directly instead of calling `has_role` RPC — behavioral equivalence, cosmetic inconsistency.
- L-2: `exportGuard.ts` uses `usePermissions().can` shim; should call `AuthorizationService` for uniform admin-bypass semantics.
- L-3: `Can.parity.test.tsx` and `navigation.parity.test.ts` mock `useAuthorization`; keep them until legacy hook is removed.

---

## 8. Authorization Coverage Summary

| Surface | Enforced? | Bypass paths? | Notes |
|---|---|---|---|
| **Frontend** | Partial (UI hide) | Yes by design (never a security boundary) | Migration debt only |
| **Backend RLS** | Yes, comprehensive | None found | 16% on new key model; rest legacy roles (equivalent behavior) |
| **Edge Functions** | Yes | None found | 4 admin-* re-check server-side; 3 background gated by cron secret / service role |
| **RPCs (SECURITY DEFINER)** | **Partial** | **Yes** — see H-3 | Business RPCs trust downstream RLS; need in-body permission gate |
| **RLS relying on legacy roles** | Yes | Blocks future roles cleanly | Migration in progress (Wave 3E) |
| **Background jobs** | Yes | None found | Service role / cron secret only |

---

## 9. Orphan / Unused Permissions

Per N4 Dead Permission Report (unchanged):
- 0 keys granted but referenced by 0 RLS policy after Wave 3E Batch A (all 36 substitutions have call sites).
- 2 legacy keys deprecated (documented in N7).
- 34 v2.1 candidate keys not yet inserted → no orphans (they don't exist yet).

No newly discovered orphans.

---

## 10. AUTHORIZATION IMPLEMENTATION READINESS

**Verdict: READY WITH FIXES**

- **READY**: Edge functions, background jobs, RLS coverage (no anon exposure, no missing policies), core `AuthorizationService` scaffolding, `has_permission` DB helper, Sidebar/Topbar/RowActions gates.
- **FIXES required (blocking prod-hardening)**: H-1 (DailyClose hardcoded roles), H-2 (staff sensitive columns), H-3 (SECURITY DEFINER RPCs without permission gates).
- **NOT BLOCKED**: migration debt (M-1..M-5) is behavior-neutral — can proceed incrementally per Wave 3E cadence.

---

## 11. Implementation Plan (Risk-Ordered)

_Documentation only — do not execute. Sequence for the next implementation waves:_

### Phase A — Close HIGH findings (must ship before any new role)
1. **H-3a** — Add `has_permission` gate at top of `apply_wallet_tx`, `add_treasury_tx`, `apply_inventory_tx`, `apply_coupon_code`, `receive_po_item`, `merge_staff_position`. Keys already exist except wallet (PD-05).
2. **H-2** — Introduce `staff_profiles_public` view (masking salary/bank/national_id) + `GRANT SELECT` per role; add `staff.view_sensitive` key to Catalog v2.2 candidate list. Update `StaffDetail.tsx` to read from view when no permission.
3. **H-1** — Replace `roles.includes(...)` in `DailyClose.tsx` with `authz.can("treasury.close"/".reopen")`. Simultaneously migrate the 3 `treasury_daily_closes` policies to `has_permission`.

### Phase B — Complete Wave 3E RLS migration (continue N7 whitelist)
4. Migrate the remaining 187 `has_role` policies to `has_permission`, batch by domain (Finance → HR → Clinical → Governance) per Pattern P4 catalog. Golden Baseline harness enforces zero drift per batch.

### Phase C — Frontend hygiene (behavior-neutral)
5. Convert all 13 `usePermissions()` call sites to `useAuthorization()`; delete legacy hook.
6. Convert 6 `roles.includes(...)` + 17 `isAdmin` sites to permission-key calls; delete `useUserRole()` (keep read-only export for scope predicates).
7. Move `exportGuard.ts` and PDF/print gates onto `<CanExport>`.

### Phase D — Governance bundle rollout
8. Once PDs resolve, run N1-INSERT for the 72 approved keys and the 28-bundle library from N8, then migrate `RolePermissions.tsx`, `BackupExport.tsx`, and IAM screens to the new keys.

### Phase E — Column-level & catalog v2.2
9. Add `staff.view_sensitive`, `patients.view_sensitive`, `medication_administration.log` (from N8 §4.2) to a v2.2 review pass.

---

## 12. Stop Condition
Audit complete. No SQL, code, catalog, bundle, or role changes performed.

Next actionable step: **Ratify H-1..H-3 as a hotfix batch** (independent of Wave 3E cadence), then continue N7-whitelisted RLS migration.
