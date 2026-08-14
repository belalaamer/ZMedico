-- Security remediation: H1-01-S (RBAC audit)
--
-- Finding: public.staff_profiles and public.payroll each carried a
-- self-access SELECT policy (staff_select_self, pay_select_self_or_admin)
-- with no column masking. Since PostgreSQL RLS is row-level only, a
-- self-linked employee could retrieve their ENTIRE row -- including
-- salary, commission_percent, bank_account, national_id (staff_profiles)
-- and payment_reference, notes (payroll) -- via a direct
-- supabase.from(<table>).select("*") call, bypassing every UI-level mask.
-- This was classified DATABASE/API CAPABILITY ONLY: live and satisfiable
-- today for both current doctors on staff_profiles (they each have a
-- self-linked row), and structurally armed (but currently dormant, since
-- no payroll row yet exists for any current user) on payroll. No current
-- application file relied on either policy -- StaffDetail.tsx, Staff.tsx,
-- and Payroll.tsx are all HR/admin-gated pages that never exercise the
-- self-access path.
--
-- Approved self-service column allowlists (business-approved, Phase
-- H1-01-S.3/H1-01-S.4 -- binding, not to be altered by this migration or
-- silently expanded later):
--
--   staff_profiles_self (18 columns): employee_id, position_id,
--   department_id, branch_id, hire_date, contract_type,
--   contract_end_date, salary_currency, working_hours_per_week,
--   annual_leave_balance, sick_leave_balance, emergency_contact_name,
--   emergency_contact_phone, date_of_birth, address, profile_image_url,
--   status, bank_name.
--   Excluded (HR/admin only): id, linked_user_id, created_at, updated_at,
--   deleted_at, termination_date, termination_reason, salary,
--   commission_percent, bank_account, national_id.
--
--   payroll_self (13 columns): period_month, period_year, base_salary,
--   working_days, actual_working_days, overtime_hours, overtime_amount,
--   bonuses, deductions, leave_deductions, net_salary, status, paid_at.
--   Excluded (HR/admin only): id, staff_id, branch_id, payment_reference,
--   notes, paid_by, created_by, created_at, updated_at.
--
-- New-column default = NOT EXPOSED: both views use a static, explicit
-- column list (never SELECT *). A column added to either base table in
-- the future does NOT automatically appear in these views -- it must be
-- deliberately added by a developer, closing the schema-evolution risk
-- inherent in the row-only RLS policies being removed below.
--
-- Identity derivation: staff_profiles_self filters exclusively on
-- linked_user_id = auth.uid(). payroll_self resolves staff_id via
-- auth.uid() -> staff_profiles.linked_user_id -> staff_profiles.id,
-- entirely inside the view. Neither view accepts, nor is reachable with,
-- any client-supplied user/staff/branch identifier.
--
-- View security configuration: both views are owned by postgres (the
-- same owner as the base tables, which have relforcerowsecurity=false),
-- with security_invoker=false (PostgreSQL's default, pinned explicitly
-- here) so the view's internal read of the base table bypasses that
-- table's RLS as the owning role -- the view's own WHERE clause is the
-- entire row-security boundary, architecturally equivalent to this
-- project's existing SECURITY DEFINER RPC pattern (e.g. list_doctors,
-- apply_wallet_tx). security_barrier=true is set as the standard
-- PostgreSQL hardening for any view whose WHERE clause is itself the
-- security boundary. This is a deliberate, verified choice: live
-- PostgreSQL version confirmed as 17.6, which fully supports both
-- options; relforcerowsecurity confirmed false on both base tables this
-- session (owner bypass is therefore unconditional, as required for this
-- design to be correct).
--
-- Removing the underlying full-row capability (REQUIRED, not merely
-- additive): creating the views alone would not close the original
-- capability, since supabase.from("staff_profiles").select("*") would
-- still succeed via staff_select_self regardless of the views' existence.
-- This migration therefore also drops staff_select_self and
-- pay_select_self_or_admin. pay_admin (ALL, admin + branch access) already
-- independently covers admin SELECT on payroll, so pay_select_self_or_admin
-- is dropped with no replacement. staff_admin and hr_staff_select
-- independently cover admin/HR SELECT on staff_profiles, so
-- staff_select_self is likewise dropped with no replacement.
--
-- Explicitly NOT touched by this migration: staff_admin, hr_staff_select,
-- hr_staff_insert, hr_staff_update, pay_admin, hr_payroll_select,
-- hr_payroll_insert, hr_payroll_update, hr_payroll_delete. staff_update_self
-- is deliberately left untouched -- the equivalent write-side column-masking
-- gap is a related but distinct risk explicitly out of scope for H1-01-S,
-- pending its own separate business decision. No base-table grant is
-- changed (authenticated keeps its existing table-level SELECT grant on
-- both tables; only the two named self-access policies are removed). No
-- application code was changed -- no current file depends on either
-- dropped policy (confirmed by direct inspection of StaffDetail.tsx,
-- Staff.tsx, and Payroll.tsx in Phase H1-01-S.2). No function, trigger,
-- other table, J-14 user_has_branch_access_via_* function, or any other
-- previously completed J-01/J-03/J-04/J-06..J-15/E-01/H-01/retired-staff-role
-- object is touched by this migration.

CREATE VIEW public.staff_profiles_self
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  employee_id,
  position_id,
  department_id,
  branch_id,
  hire_date,
  contract_type,
  contract_end_date,
  salary_currency,
  working_hours_per_week,
  annual_leave_balance,
  sick_leave_balance,
  emergency_contact_name,
  emergency_contact_phone,
  date_of_birth,
  address,
  profile_image_url,
  status,
  bank_name
FROM public.staff_profiles
WHERE linked_user_id = auth.uid();

CREATE VIEW public.payroll_self
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  period_month,
  period_year,
  base_salary,
  working_days,
  actual_working_days,
  overtime_hours,
  overtime_amount,
  bonuses,
  deductions,
  leave_deductions,
  net_salary,
  status,
  paid_at
FROM public.payroll
WHERE staff_id = (
  SELECT sp.id
  FROM public.staff_profiles sp
  WHERE sp.linked_user_id = auth.uid()
);

REVOKE ALL ON public.staff_profiles_self FROM PUBLIC, anon;
REVOKE ALL ON public.payroll_self FROM PUBLIC, anon;

GRANT SELECT ON public.staff_profiles_self TO authenticated, service_role;
GRANT SELECT ON public.payroll_self TO authenticated, service_role;

DROP POLICY staff_select_self ON public.staff_profiles;
DROP POLICY pay_select_self_or_admin ON public.payroll;
