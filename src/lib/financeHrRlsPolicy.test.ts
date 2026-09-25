import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("finance / HR RLS canonical alignment", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925160000_align_finance_hr_rls.sql"),
    "utf8",
  );

  it("removes broad role-based coupon and staff-target policies", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS coupons_manage_billing_admin");
    expect(migration).toContain('DROP POLICY IF EXISTS "Admin/HR/manager full access on staff_targets"');
    for (const permission of [
      "coupons.view","coupons.create","coupons.edit","coupons.delete",
      "hr.view","hr.create","hr.edit","hr.delete",
    ]) expect(migration).toContain(permission);
  });

  it("makes coupon redemptions append-only from the browser", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Coupon redemptions by privileged roles"');
    expect(migration).toContain("coupon_redemptions_select_billing");
    expect(migration).toContain("coupon_redemptions_insert_apply");
    const redemption = migration.slice(migration.indexOf("-- Coupon redemption ledger"));
    expect(redemption).not.toMatch(/CREATE POLICY coupon_redemptions_.*FOR UPDATE/);
    expect(redemption).not.toMatch(/CREATE POLICY coupon_redemptions_.*FOR DELETE/);
  });

  it("removes HR payroll hard-delete and uses linked-user self reads for salary adjustments", () => {
    expect(migration).toContain("DROP POLICY IF EXISTS hr_payroll_delete");
    expect(migration).toContain("sp.linked_user_id = (SELECT auth.uid())");
  });

  it("preserves doctor own commission view while gating management to HR permissions", () => {
    expect(migration).toContain("doctor_id = (SELECT auth.uid())");
    expect(migration).toContain("commissions_insert_hr_edit");
    expect(migration).toContain("commissions_update_hr_edit");
    expect(migration).toContain("commissions_delete_hr_delete");
  });
});
