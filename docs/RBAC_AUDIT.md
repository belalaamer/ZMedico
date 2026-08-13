# RBAC Deep Audit — Findings & Remediation

Scope: 101 public tables, 8 roles, 4 admin edge functions, 7 scheduled/system jobs, 6 major UI surfaces.

## Assumptions (strict defaults; adjust if wrong)
1. Salary / bank_account / national_id — **admin + hr** in the UI. The DB
   currently lets an employee `SELECT` own `staff_profiles` and own `payroll`
   rows (payslip use case). UI masks the sensitive columns when the current
   user is neither admin nor HR — even on their own profile — so leakage
   requires a direct API call, not a click.
2. Doctor commissions — doctor sees own only; admin + hr + manager (branch) see all.
3. Wallet balances — admin + manager + accountant + receptionist (checkout needs it).
4. Nurse medical history — view-only across all patient history.
5. Accountant — cross-branch (finance role); manager stays branch-scoped.
6. Audit logs viewer — admin only.

### Assumption verification (against live RLS)

| # | Assumption | RLS check | Status |
|---|---|---|---|
| 1 | Salary admin+hr only | `pay_select_self_or_admin` allows self | **Adjusted** — UI masks, DB still allows self |
| 2 | Doctor sees own commissions | `doctor_commissions."View commissions"` allows `doctor_id=auth.uid()` OR admin/hr/manager | Confirmed |
| 3 | Wallet balances for receptionist | `wallets_select_scoped` includes receptionist | Confirmed |
| 4 | Nurse reads medical history | `medical_records` SELECT policy includes nurse role | Confirmed |
| 5 | Accountant cross-branch | `branch_isolation` runs on invoices/treasury. `user_has_branch_access()` does not grant admin/accountant any bypass — only `system_owner` is exempted inside that function. Admin/accountant cross-branch coverage observed in practice comes solely from `staff_branches` rows assigned at seed time, not from a function-level bypass; this remains a seed-data convention, not an enforced guarantee. | Confirmed by convention (accountants get all branches at seed time) |
| 6 | Audit logs admin-only | `al_select_admin` = admin only | Confirmed |

## Critical findings

| # | Severity | Finding | Fix in this pass |
|---|---|---|---|
| F1 | HIGH | `anon` role has `arwdDxtm` (all privileges) on every public table by default. RLS is the only gate. Least-privilege violation. | REVOKE all from anon on 12 sensitive tables (HR/PHI/finance/audit). Keep on public-facing (pricing/tenants/languages). |
| F2 | HIGH | `staff_profiles.salary`, `bank_account`, `national_id`, `date_of_birth` are readable to any user matching `(id = auth.uid())` — a linked employee can read own salary. | Add `staff_profiles_self` view without sensitive fields; restrict base-table SELECT for non-admin/non-HR via WHEN column list. |
| F3 | MED | `insurance_contracts.SELECT = true` — any authenticated user reads contract terms. | Restrict to admin + manager + accountant. |
| F4 | MED | `role_permissions.SELECT = true` — leaks full permission matrix. Acceptable (client needs it) but should be documented. | Keep, document. |
| F5 | MED | No audit trigger on `user_roles` or `role_permissions` — privilege escalations invisible. | Add audit triggers. |
| F6 | MED | `staff_profiles` salary/bank/commission changes not audited. | Add audit trigger for column-level changes. |
| F7 | LOW | `payroll.INSERT` policy `hr_payroll_insert` has no WITH CHECK — any HR can insert any row. | Add `WITH CHECK (has_role(...,'hr'))`. |
| F8 | LOW | `staff_profiles.INSERT` policy `hr_staff_insert` has no WITH CHECK. | Add WITH CHECK. |
| F9 | INFO | UI `usePermissions` accepts DB `role_permissions` overrides — an admin editing the seed can grant themselves more but that's expected. | No change. |

## Verified OK
- Admin edge functions (`admin-create-user`, `admin-delete-user`, `admin-reset-password`, `admin-export`) all verify `has_role(admin)` server-side via JWT.
- DELETE = admin gate present on: appointments, invoices, payments, medical_records, treasury, treasury_transactions, doctor_commissions, staff_profiles (via `staff_admin` ALL), expenses, patients.
- `has_role` is SECURITY DEFINER on `public.user_roles` (no recursion).
- `apply_wallet_tx`, `apply_inventory_tx`, `apply_coupon_code` — all have explicit role checks inside.
- `tg_staff_self_update_guard` blocks self-edit of employment/salary fields.
- Branch isolation via `user_has_branch_access(branch_id)` on 60+ tables.

## Out of scope for this pass (recommended next)
- Column-masking views for `patient_wallet_transactions` (notes may leak PII).
- Rate limiting on `admin-export` (denial-of-service via large tables).
- Deno tests for edge functions with non-admin JWT.
- Playwright deep RBAC tests per role (allow-list + deny-list from HTTP status, not UI).

## Matrix authoritative source
See `docs/RBAC_MATRIX.md` — enforced by `role_permissions` seed + RLS policies below.
