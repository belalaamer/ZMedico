import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PHI audit hardening migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260924193000_harden_phi_access_audit.sql"),
    "utf8",
  );

  it("removes direct authenticated audit inserts", () => {
    expect(migration).toContain("REVOKE INSERT ON TABLE public.phi_access_log FROM authenticated");
    expect(migration).toContain("DROP POLICY IF EXISTS phi_log_insert_self");
  });

  it("authorizes the audit event against canonical permissions", () => {
    for (const permission of [
      "patients.view",
      "medical_records.view",
      "vitals.view",
      "treatment_plans.view",
      "invoices.view",
    ]) {
      expect(migration).toContain(permission);
    }
    expect(migration).toContain("public.has_permission(v_actor, v_permission)");
  });

  it("derives patient identity from the actual entity and enforces branch scope", () => {
    for (const table of [
      "medical_records",
      "physio_cases",
      "prescriptions",
      "patient_documents",
      "dental_chart",
      "treatment_plans",
      "vital_signs",
      "invoices",
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toContain("p_patient_id <> v_patient");
    expect(migration).toContain("public.user_has_branch_access(v_branch)");
  });

  it("preserves the non-blocking clinical logging contract", () => {
    expect(migration).toContain("EXCEPTION WHEN OTHERS");
    expect(migration).toContain("'phi_audit_failure'");
  });
});
