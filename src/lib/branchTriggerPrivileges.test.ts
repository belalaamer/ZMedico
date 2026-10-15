import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const migration = readFileSync("supabase/migrations/20261015102812_revoke_branch_trigger_direct_execution.sql", "utf8");
it("limits client revocation to the two internal branch trigger functions", () => {
  expect(migration).toContain("public.tg_guard_last_tenant_branch() FROM PUBLIC, anon, authenticated, service_role");
  expect(migration).toContain("public.tg_guard_last_active_tenant_branch() FROM PUBLIC, anon, authenticated, service_role");
  expect(migration).not.toContain("admin_archive_branch");
  expect(migration).not.toContain("admin_force_delete_branch");
});
it("guards the reviewed function identities before tightening privileges", () => {
  expect(migration).toContain("e940cde707d81e8d9e073d0679866103");
  expect(migration).toContain("5b27e689c22f492c507af50b59a86c00");
  expect(migration).not.toMatch(/(?:UPDATE|DELETE FROM|DISABLE TRIGGER|DISABLE ROW LEVEL SECURITY) /i);
});
