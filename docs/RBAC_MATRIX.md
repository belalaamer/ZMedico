# ZMedico — RBAC Verification Matrix

Derived from `src/lib/rolePermissions.ts` (`DEFAULT_PERMISSIONS`, `moduleForPath`),
`src/components/PermissionRoute.tsx`, `src/components/Can.tsx`, the route table in
`src/App.tsx`, the navigation in `src/components/layout/Sidebar.tsx` /
`src/pages/settings/SettingsLayout.tsx`, and Supabase RLS policies on the
tables listed in the schema summary.

## Modules x Actions (DEFAULT_PERMISSIONS)

Legend: `V`=view  `C`=create  `E`=edit  `D`=delete  `X`=export  `—`=no access

| Module / Role        | admin | manager | doctor | nurse | receptionist | accountant | hr | staff |
|----------------------|:-----:|:-------:|:------:|:-----:|:------------:|:----------:|:--:|:-----:|
| patients             | VCEDX | VCEX    | VE     | V     | VCE          | V          | —  | —     |
| appointments         | VCEDX | VCEX    | VCE    | VCE   | VCED*        | V          | —  | V     |
| medical_records      | VCEDX | VCEX    | VCE    | VCE   | —            | —          | —  | —     |
| treatment_plans      | VCEDX | VCEX    | VCE    | VE    | V            | V          | —  | —     |
| invoices             | VCEDX | VCEX    | V      | V     | VCE          | VCEX**     | —  | —     |
| treasury             | VCEDX | VCEX    | —      | —     | —            | VCEX       | —  | —     |
| inventory            | VCEDX | VCEX    | —      | V     | —            | V          | —  | —     |
| reports              | VCEDX | VX      | V      | —     | —            | VX         | V  | —     |
| hr                   | VCEDX | V       | —      | —     | —            | —          | VCEX | —   |
| settings             | VCEDX | V       | —      | —     | —            | —          | —  | —     |
| coupons              | VCEDX | VCEX    | —      | —     | V            | VCEX       | —  | —     |

* Receptionist "delete" on appointments is intentionally surfaced in UI as
  **Cancel** (soft cancel → status=`cancelled`) via `RowActions.tsx` and
  `CalendarPage.tsx`. True hard-delete is gated to admin.

** Accountant has `edit` on invoices but **no `delete`** — UI exposes Void/Cancel
  only (`InvoiceDetail.tsx` action gating + `tg_invoice_after_cancel_reversal`
  trigger refunds wallet, reverses treasury and cancels commissions).

## Route guards (from `App.tsx` + `PermissionRoute` + `moduleForPath`)

| Route prefix                  | Inferred module      | Notes |
|-------------------------------|----------------------|-------|
| `/calendar`, `/reminders`     | `appointments`       | |
| `/queue`, `/queue/audit`      | `appointments`       | `/queue/self-audit` is `adminOnly` |
| `/physio`                     | `medical_records`    | |
| `/patients`                   | `patients`           | |
| `/invoices`, `/payments`      | `invoices`           | |
| `/treasury`, `/expenses`      | `treasury`           | `/expenses/self-audit` is `adminOnly` |
| `/coupons`                    | `coupons`            | |
| `/inventory`                  | `inventory`          | |
| `/medical/*`                  | `medical_records`    | |
| `/hr/*`                       | `hr`                 | |
| `/reports/*`                  | `reports`            | doctor commissions scoped via RLS to self |
| `/settings/*`, `/branches/*`  | `settings`           | admin-only: `/settings/roles`, `/settings/users`, `/settings/backup`, `/settings/audit` |
| `/pricing`                    | `settings`           | manager+ only (SaaS billing) |
| `/system/self-audit`          | `adminOnly`          | |
| `/trust`                      | public               | no auth required |

`PermissionRoute` always admits `admin`. Otherwise: if `adminOnly` is set the
route is blocked; else `can(module, "view")` from `usePermissions()` is
required. Children inside pages use `<Can module="..." action="...">` to gate
individual buttons (create / edit / delete / export).

## Per-role expectations

### admin
- Sees every sidebar entry; passes every `PermissionRoute` (including all
  `adminOnly` routes: Roles, Users, Backup, Audit, Self-audits, System).
- All CRUD + export allowed everywhere. RLS on all tables admits admins via
  `has_role(auth.uid(), 'admin')`.

### manager (strict scope)
- Sidebar: Operations, Patients & Clinical, Finance, Inventory, HR (view-only),
  Settings (view-only), Reports.
- **No delete in any module.** Cannot reach `/settings/roles`, `/settings/users`,
  `/settings/backup`, `/settings/audit`. Cannot toggle `Can action="delete"`
  buttons.
- `/pricing` allowed.

### doctor
- Allowed: Patients (V/E), Appointments (VCE), Medical Records (VCE),
  Treatment Plans (VCE), Reports (V), Invoices (V only).
- Sidebar exposes "Commissions" but RLS on `doctor_commissions` restricts to
  `staff_id = auth.uid()` — own commissions only.
- Blocked: Treasury, Inventory, HR, Settings, Coupons.

### nurse
- Allowed: Patients (V), Appointments (VCE), Medical Records (VCE),
  Treatment Plans (VE), Invoices (V), Inventory (V).
- Blocked: Treasury, Reports, HR, Settings, Coupons.

### receptionist
- Allowed: Patients (VCE), Appointments (VCE + soft-cancel as D),
  Treatment Plans (V), Invoices (VCE), Coupons (V).
- Blocked: Medical Records, Treasury, Inventory, Reports, HR, Settings.
- UI: appointment "Delete" replaced with "Cancel"; invoice delete hidden.

### accountant
- Allowed: Patients (V), Appointments (V), Treatment Plans (V),
  Invoices (VCEX, **no delete** — void only),
  Treasury (VCEX), Inventory (V), Reports (VX), Coupons (VCEX).
- Blocked: Medical Records, HR, Settings.

### hr
- Allowed: HR (VCEX), Reports (V).
- Blocked: every clinical / financial module and Settings.

### staff
- Allowed: Appointments (V) only.
- Blocked: everything else.

## Branch isolation (RLS)

`branches`, `appointments`, `patients`, `invoices`, `payments`, `treasury`,
`treasury_transactions`, `expenses`, `inventory`, `medical_records`,
`prescriptions`, `physio_cases`, `physio_sessions`, `queue_alerts`,
`queue_settings`, `notification_settings`, `attendance`, etc. all enforce
access through `public.user_has_branch_access(branch_id)` (joins
`staff_branches` for non-admins). Admins bypass via `has_role`. Frontend
selection uses `BranchContext`; data queries always filter on the
currently-selected branch and re-check on the server.

## Backend safeguards worth verifying alongside the matrix

- `add_treasury_tx`, `default_treasury_for_branch`, `apply_coupon_code`,
  `staff_target_actual`, `fn_treasury_day_cash_summary` — SECURITY DEFINER with
  explicit role checks inside the function body.
- `tg_invoice_after_cancel_reversal` — wallet refund + treasury reversal +
  commission cancellation on invoice void.
- `tg_branches_cleanup_orphans` — reminders/alerts purged on branch delete
  (EXECUTE revoked from PUBLIC/anon/authenticated; trigger-only).
- `admin-create-user`, `admin-reset-password`, `admin-delete-user`,
  `admin-export` — Edge Functions require service-role / admin context.