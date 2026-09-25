-- Align Finance/HR RLS with canonical action permissions.
--
-- Legacy role-based ALL policies drifted from the canonical permission model
-- and gave Manager coupon writes, HR payroll hard-delete, and mutable coupon
-- redemption ledger rows. All affected tables are empty in Production at the
-- time of this migration.

-- ---------------------------------------------------------------------------
-- Coupons: action-specific canonical permissions.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS coupons_manage_billing_admin ON public.coupons;
DROP POLICY IF EXISTS coupons_select_reception ON public.coupons;
DROP POLICY IF EXISTS coupons_select_authorized ON public.coupons;
DROP POLICY IF EXISTS coupons_insert_authorized ON public.coupons;
DROP POLICY IF EXISTS coupons_update_authorized ON public.coupons;
DROP POLICY IF EXISTS coupons_delete_authorized ON public.coupons;

CREATE POLICY coupons_select_authorized ON public.coupons
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'coupons.view')
);

CREATE POLICY coupons_insert_authorized ON public.coupons
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'coupons.create')
);

CREATE POLICY coupons_update_authorized ON public.coupons
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'coupons.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'coupons.edit')
);

CREATE POLICY coupons_delete_authorized ON public.coupons
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'coupons.delete')
);

-- ---------------------------------------------------------------------------
-- Coupon redemption ledger: read/apply only; no browser UPDATE/DELETE.
-- The existing RESTRICTIVE branch policy still scopes every permitted row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Coupon redemptions by privileged roles"
  ON public.coupon_redemptions;
DROP POLICY IF EXISTS coupon_redemptions_select_billing
  ON public.coupon_redemptions;
DROP POLICY IF EXISTS coupon_redemptions_insert_apply
  ON public.coupon_redemptions;

CREATE POLICY coupon_redemptions_select_billing
ON public.coupon_redemptions
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'invoices.view')
);

CREATE POLICY coupon_redemptions_insert_apply
ON public.coupon_redemptions
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'invoices.coupon.apply')
);

-- ---------------------------------------------------------------------------
-- Salary adjustments: HR edit surface, employee self-read, canonical delete.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS sa_admin ON public.salary_adjustments;
DROP POLICY IF EXISTS sa_select_self_or_admin ON public.salary_adjustments;
DROP POLICY IF EXISTS sa_select_hr_or_self ON public.salary_adjustments;
DROP POLICY IF EXISTS sa_insert_hr_edit ON public.salary_adjustments;
DROP POLICY IF EXISTS sa_update_hr_edit ON public.salary_adjustments;
DROP POLICY IF EXISTS sa_delete_hr_delete ON public.salary_adjustments;

CREATE POLICY sa_select_hr_or_self ON public.salary_adjustments
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.view')
  OR EXISTS (
    SELECT 1
    FROM public.payroll p
    JOIN public.staff_profiles sp ON sp.id = p.staff_id
    WHERE p.id = salary_adjustments.payroll_id
      AND sp.linked_user_id = (SELECT auth.uid())
  )
);

CREATE POLICY sa_insert_hr_edit ON public.salary_adjustments
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.edit')
);

CREATE POLICY sa_update_hr_edit ON public.salary_adjustments
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.edit')
);

CREATE POLICY sa_delete_hr_delete ON public.salary_adjustments
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.delete')
);

-- ---------------------------------------------------------------------------
-- Doctor commissions: doctor self-view + HR visibility/edit; hard delete is
-- canonical hr.delete only. Branch isolation remains RESTRICTIVE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage commissions" ON public.doctor_commissions;
DROP POLICY IF EXISTS "View commissions" ON public.doctor_commissions;
DROP POLICY IF EXISTS commissions_insert_hr_edit ON public.doctor_commissions;
DROP POLICY IF EXISTS commissions_update_hr_edit ON public.doctor_commissions;
DROP POLICY IF EXISTS commissions_delete_hr_delete ON public.doctor_commissions;

CREATE POLICY "View commissions" ON public.doctor_commissions
FOR SELECT TO authenticated
USING (
  doctor_id = (SELECT auth.uid())
  OR public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.view')
);

CREATE POLICY commissions_insert_hr_edit ON public.doctor_commissions
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.edit')
);

CREATE POLICY commissions_update_hr_edit ON public.doctor_commissions
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.edit')
);

CREATE POLICY commissions_delete_hr_delete ON public.doctor_commissions
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.delete')
);

-- ---------------------------------------------------------------------------
-- Payroll: HR may create/edit/view, but hr.delete is Admin-only in canonical.
-- Existing pay_admin + HR SELECT/INSERT/UPDATE policies remain valid.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_payroll_delete ON public.payroll;

-- ---------------------------------------------------------------------------
-- Staff targets: Manager's hr.view is read-only; HR/Admin actions follow hr.*.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin/HR/manager full access on staff_targets"
  ON public.staff_targets;
DROP POLICY IF EXISTS staff_targets_role_select ON public.staff_targets;
DROP POLICY IF EXISTS staff_targets_role_insert ON public.staff_targets;
DROP POLICY IF EXISTS staff_targets_role_update ON public.staff_targets;
DROP POLICY IF EXISTS staff_targets_role_delete ON public.staff_targets;

CREATE POLICY staff_targets_role_select ON public.staff_targets
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.view')
);

CREATE POLICY staff_targets_role_insert ON public.staff_targets
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.create')
);

CREATE POLICY staff_targets_role_update ON public.staff_targets
FOR UPDATE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.edit')
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.edit')
);

CREATE POLICY staff_targets_role_delete ON public.staff_targets
FOR DELETE TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'system_owner'::public.app_role)
  OR public.has_permission((SELECT auth.uid()), 'hr.delete')
);
