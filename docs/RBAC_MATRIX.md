# ZMedico — RBAC Verification Matrix (Strict)

Authoritative matrix. Enforced in three layers that MUST agree:
1. UI defaults — `src/lib/rolePermissions.ts` (`DEFAULT_PERMISSIONS`)
2. DB seed — `public.role_permissions` table (read by `usePermissions`)
3. RLS policies on each table

## Governing rules

- **Delete = Admin only.** No other role can hard-delete any row. Cancel /
  Void / Soft-archive are exposed via UI where appropriate.
- **Segregation of Duties (strict).** Each role sees only what it needs.
- **Branch isolation.** All branch-scoped tables enforce
  `user_has_branch_access(branch_id)`. Only `system_owner` receives an
  unconditional bypass from this function; `admin` does not — where a
  policy AND-combines an admin role check with `user_has_branch_access(branch_id)`
  (e.g. `payroll.pay_admin`), an admin still needs a matching `staff_branches`
  row for that branch. Some policies separately grant admin an unconditional
  allow via an explicit `has_role(admin)` OR-branch in the policy expression
  itself, independent of `user_has_branch_access()` — check the specific
  policy, not this function, to know which applies.

## Modules x Actions

Legend: `V`=view  `C`=create  `E`=edit  `X`=export  `—`=no access.
Delete column omitted — Admin-only everywhere.

| Module / Role        | admin | manager | doctor | nurse | receptionist | accountant | hr    | staff |
|----------------------|:-----:|:-------:|:------:|:-----:|:------------:|:----------:|:-----:|:-----:|
| patients             | VCEX  | VCEX    | V      | V     | VCE          | V          | —     | —     |
| appointments         | VCEX  | VCEX    | VCE    | VCE   | VCE*         | V          | —     | —     |
| medical_records      | VCEX  | V       | VCE    | V     | —            | —          | —     | —     |
| vitals               | VCEX  | V       | VCE    | VCE   | —            | —          | —     | —     |
| treatment_plans      | VCEX  | V       | VCE    | V     | V            | V          | —     | —     |
| invoices             | VCEX  | VX      | —      | —     | VC           | VCEX**     | —     | —     |
| treasury             | VCEX  | VX      | —      | —     | —            | VCEX       | —     | —     |
| inventory            | VCEX  | VCEX    | —      | V     | —            | V          | —     | —     |
| coupons              | VCEX  | VX      | —      | —     | V            | VCEX       | —     | —     |
| hr                   | VCEX  | V       | —      | —     | —            | —          | VCEX  | —     |
| settings             | VCEX  | V       | —      | —     | —            | —          | —     | —     |
| reports              | VX    | VX      | V      | —     | —            | VX         | V     | —     |
| reports_finance      | VX    | VX      | —      | —     | —            | VX         | —     | —     |
| reports_medical      | VX    | VX      | V      | —     | —            | —          | —     | —     |
| reports_operational  | VX    | VX      | V      | —     | —            | VX         | —     | —     |
| reports_hr           | VX    | —       | —      | —     | —            | —          | VX    | —     |
| reports_inventory    | VX    | VX      | —      | —     | —            | VX         | —     | —     |

\* Receptionist "cancel" on appointments is a status update (`status=cancelled`),
   not a row delete. UI hides Delete for receptionist.

\** Accountant "edit" on invoices excludes hard-delete; use Void (which triggers
   `tg_invoice_after_cancel_reversal` for wallet refund + treasury reversal +
   commission cancellation).

## Recent changes (this reset)

- Manager lost Create/Edit on invoices and coupons — now view/export only.
- Receptionist lost Delete on appointments, Edit on invoices, and all coupon
  writes. Also lost create/edit on expenses.
- Doctor lost invoice view and all patient demographics edits.
- Nurse lost medical_records/treatment_plans writes.
- Accountant lost any medical_records access; gained treatment_plans view.
- HR unchanged in scope, but confirmed strict isolation to HR modules.
- Staff was retired from the operational permission matrix; existing QA staff identities remain for negative-access regression tests and receive Dashboard-only access.

## Per-role expectations

### admin
Sees every sidebar entry; passes every `PermissionRoute` (including all
`adminOnly` routes). All CRUD + export allowed everywhere.

### manager
Sidebar: Operations, Patients & Clinical (view), Finance (view), Inventory,
HR (view), Settings (view), Reports (all except HR). No delete in any
module. Cannot edit invoices, treasury, coupons, medical records.

### doctor
Clinical only. Patients V, Appointments VCE, Medical Records VCE,
Vitals VCE, Treatment Plans VCE, Medical/Operational Reports V.
Own commissions only (RLS on `doctor_commissions.doctor_id = auth.uid()`).
Blocked: Invoices, Treasury, Inventory, HR, Settings, Coupons, financial reports.

### nurse
Assistant. Vitals VCE (nurses take vitals). Patients/Medical Records/
Treatment Plans view-only. Appointments VCE. Inventory V. No reports.

### receptionist
Front desk. Patients VCE, Appointments VCE (cancel via status update), Treatment
Plans V, Invoices VC (create initial invoice, no edit), Coupons V (apply codes only). No expenses, no treasury, no reports. The `/payments` collection flow is intentionally available through the legacy `invoices.create` gate; the `20260804130000_reception_can_record_payments.sql` migration permits only ledger entries derived from an already-authorized payment and still blocks arbitrary treasury adjustments.


### accountant
Finance only. Invoices VCEX (void, no hard-delete), Treasury VCEX,
Coupons VCEX, Treatment Plans V, Inventory V, Finance/Operational/Inventory
reports VX. No clinical access, no HR, no settings.

### hr
HR VCEX, HR Reports VX. Nothing else.

### staff
Retired/minimal QA role. Dashboard-only access is intentional after migration `20260805085000_retire_staff_and_scope_catalogs.sql`; all operational routes, including appointments, are denied.

## RLS policy alignment

Tables tightened alongside this matrix:
- `patients`: doctor/nurse INSERT+UPDATE dropped; write access = admin + manager (branch) + receptionist.
- `coupons`: receptionist write dropped; write = admin + manager + accountant.
- `expenses`: receptionist INSERT dropped; SELECT restricted to admin + accountant + manager (branch).
- `appointments` / `invoices` / `payments` / `medical_records` / `treasury` /
  `treasury_transactions` / `doctor_commissions` / `staff_profiles`: DELETE
  gated to `has_role(auth.uid(),'admin')` via dedicated DELETE policies.

## Backend safeguards worth verifying alongside the matrix

- `add_treasury_tx`, `default_treasury_for_branch`, `apply_coupon_code`,
  `check_expiry_alerts` — SECURITY DEFINER with explicit role checks inside.
- `tg_invoice_after_cancel_reversal` — wallet refund + treasury reversal +
  commission cancellation on invoice void.
- `tg_staff_self_update_guard` — non-admin/non-HR users cannot modify their
  own employment / salary / identity fields.
- `tg_branches_cleanup_orphans` — reminders/alerts purged on branch delete.
- Edge functions (`admin-create-user`, `admin-reset-password`,
  `admin-delete-user`, `admin-export`) — verify admin role server-side.
