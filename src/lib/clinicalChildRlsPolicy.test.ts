import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("clinical child RLS canonical alignment", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925153500_align_clinical_child_rls.sql"),
    "utf8",
  );

  it("removes legacy manager/reception/accountant clinical grants", () => {
    for (const role of ["manager", "receptionist", "accountant", "staff"]) {
      expect(migration).not.toContain(`'${role}'::public.app_role`);
    }
  });

  it("uses medical-record permissions for medical child tables", () => {
    for (const permission of [
      "medical_records.view",
      "medical_records.create",
      "medical_records.edit",
      "medical_records.delete",
    ]) {
      expect(migration).toContain(permission);
    }
    expect(migration).toContain("DROP POLICY IF EXISTS nurse_history_insert");
    expect(migration).toContain("DROP POLICY IF EXISTS nurse_history_update");
  });

  it("uses dedicated vitals permissions while preserving nurse capability", () => {
    for (const permission of [
      "vitals.view",
      "vitals.create",
      "vitals.edit",
      "vitals.delete",
    ]) {
      expect(migration).toContain(permission);
    }
    expect(migration).toContain("DROP POLICY IF EXISTS nurse_vitals_insert");
    expect(migration).toContain("DROP POLICY IF EXISTS nurse_vitals_update");
  });

  it("aligns treatment plan and session operations with canonical permissions", () => {
    for (const permission of [
      "treatment_plans.view",
      "treatment_plans.create",
      "treatment_plans.edit",
      "treatment_plans.delete",
    ]) {
      expect(migration).toContain(permission);
    }
    expect(migration).toContain("tp.doctor_id = (SELECT auth.uid())");
  });

  it("keeps patient document uploads attributable to the authenticated uploader", () => {
    expect(migration).toContain("uploaded_by = (SELECT auth.uid())");
  });
});
