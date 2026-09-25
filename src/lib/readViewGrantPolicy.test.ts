import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("read-view grant hardening", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925144500_revoke_view_write_grants.sql"),
    "utf8",
  );

  const views = [
    "staff_profiles_self",
    "payroll_self",
    "staff_profiles_directory",
    "safe_notification_settings",
  ];

  it("revokes browser write privileges from every read projection", () => {
    for (const view of views) {
      expect(migration).toContain(`ON public.${view}`);
    }
    expect(migration.match(/REVOKE INSERT, UPDATE, DELETE/g)?.length).toBe(4);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("preserves authenticated read access", () => {
    for (const view of views) {
      expect(migration).toContain(
        `GRANT SELECT ON public.${view} TO authenticated, service_role`,
      );
    }
  });
});
