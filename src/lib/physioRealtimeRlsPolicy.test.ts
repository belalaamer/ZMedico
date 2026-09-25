import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("physio realtime RLS hardening", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925151000_harden_physio_realtime_rls.sql"),
    "utf8",
  );

  it("adds restrictive branch isolation to both realtime child tables", () => {
    for (const table of ["physio_sessions", "physio_reassessments"]) {
      expect(migration).toContain(`${table}_branch_isolation`);
      expect(migration).toContain(`ON public.${table}`);
    }
    expect(migration.match(/AS RESTRICTIVE/g)?.length).toBe(2);
    expect(migration.match(/user_has_branch_access_via_physio_case\(case_id\)/g)?.length)
      .toBeGreaterThanOrEqual(4);
  });

  it("uses canonical medical-record permission for SELECT", () => {
    expect(migration.match(/'medical_records\.view'/g)?.length).toBe(2);
    expect(migration).not.toContain("'manager'::public.app_role");
  });

  it("preserves explicit system-owner global access", () => {
    expect(migration.match(/'system_owner'::public\.app_role/g)?.length)
      .toBeGreaterThanOrEqual(4);
  });
});
