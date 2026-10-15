import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261015090330_scope_clinic_logo_lookup.sql", "utf8");

describe("released clinic logo scope migration", () => {
  it("rejects unreviewed definition drift", () => {
    expect(migration).toContain("017611086e64f4c98d62bf336c236956");
    expect(migration).toContain("review drift before applying");
  });
  it("requires a branch and enforces membership or owner access", () => {
    expect(migration).toContain("Branch is required for clinic logo lookup");
    expect(migration).toContain("public.user_has_branch_access(_branch_id)");
    expect(migration).toContain("'system_owner'::public.app_role");
    expect(migration).not.toContain("_branch_id IS NULL OR branch_id");
  });
  it("retains restricted execution and jointly authenticated service role", () => {
    expect(migration).toContain("v_claim_role = 'service_role' AND v_sql_role = 'service_role'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.get_clinic_logo(uuid) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_clinic_logo(uuid) TO authenticated, service_role");
  });
});
