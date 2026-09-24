import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("sensitive RLS alignment migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260924154500_align_sensitive_rls_with_canonical_permissions.sql"),
    "utf8",
  );

  it("uses canonical catalog permission for tenant catalog writes", () => {
    expect(migration).toContain("settings.catalog.update");
    expect(migration).toContain("medical_specialties_insert_scoped");
    expect(migration).toContain("medications_insert_scoped");
    expect(migration).toContain("diagnoses_insert_scoped");
  });

  it("removes stale manager role checks from clinical child policies", () => {
    for (const policy of [
      "hist_select_clinical",
      "dent_select_clinical",
      "rx_select_clinical",
      "rxi_select_clinical",
      "rdx_select_clinical",
      "rproc_select_clinical",
      "physio_sessions_select",
      "physio_reassessments_select",
    ]) {
      const start = migration.indexOf(`CREATE POLICY ${policy}`);
      expect(start, policy).toBeGreaterThanOrEqual(0);
      const fragment = migration.slice(start, start + 500);
      expect(fragment, policy).toContain("medical_records.view");
      expect(fragment, policy).not.toContain("'manager'");
    }
  });

  it("aligns treatment plan children with treatment_plans permissions", () => {
    expect(migration).toContain("'treatment_plans.view'");
    expect(migration).toContain("'treatment_plans.edit'");
    expect(migration).toContain("'treatment_plans.delete'");
    expect(migration).toContain("user_has_branch_access_via_treatment_plan");
  });

  it("prevents manager coupon writes and HR payroll hard-delete drift", () => {
    expect(migration).toContain("coupons.create");
    expect(migration).toContain("coupons.edit");
    expect(migration).toContain("coupons.delete");
    expect(migration).toContain("DROP POLICY IF EXISTS hr_payroll_delete");
    expect(migration).toContain("staff_targets_role_delete");
    expect(migration).toContain("coupon_redemptions_insert_apply");
    expect(migration).toContain("invoices.coupon.apply");
    expect(migration).toContain("sa_insert_hr_edit");
    expect(migration).toContain("sa_delete_hr_delete");
    expect(migration).toContain("commissions_update_hr_edit");
    expect(migration).toContain("commissions_delete_hr_delete");
    expect(migration).toContain("patient_docs_storage_select");
    expect(migration).toContain("patient_docs_storage_insert");
    expect(migration).toContain("patient_docs_storage_delete");
  });

  it("requires canonical integration permission for tenant integration writes", () => {
    expect(migration).toContain("settings.integrations.manage");
    expect(migration).toContain("ai_tenant_settings_write_scoped");
    expect(migration).toContain("channel_accounts_write_scoped");
  });
});
