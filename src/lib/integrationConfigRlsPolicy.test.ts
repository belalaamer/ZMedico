import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("integration configuration write hardening", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925111527_harden_integration_config_writes.sql"),
    "utf8",
  );

  it("requires canonical integration permission for tenant-level writes", () => {
    expect(migration.match(/settings\.integrations\.manage/g)?.length)
      .toBeGreaterThanOrEqual(5);
    expect(migration).toContain("user_has_tenant_access(tenant_id)");
  });

  it("keeps communication-template writes branch-scoped", () => {
    expect(migration).toContain('"comm_tpl admin write"');
    expect(migration).toContain("user_has_branch_access(branch_id)");
  });

  it("preserves explicit System Owner access", () => {
    expect(migration.match(/'system_owner'::public\.app_role/g)?.length)
      .toBeGreaterThanOrEqual(5);
  });
});
