import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("hot authorization RLS initplan optimization", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925171000_optimize_hot_auth_rls_initplans.sql"),
    "utf8",
  );

  it("optimizes the 11 selected hot policies without changing their guards", () => {
    for (const policy of [
      "rls_hardening_notifications_recipient",
      "notif_select_own",
      "notif_insert_own",
      "notif_update_own",
      "notif_delete_own",
      "rls_hardening_branch_scope",
      "sb_admin_write",
      "sb_select_self_or_admin",
      "roles_admin_write",
      "roles_select_auth",
      "roles_admin_update_delete",
    ]) {
      expect(migration).toContain(`ALTER POLICY ${policy}`);
    }

    expect(migration).toContain("(SELECT auth.uid())");
    expect(migration).toContain("user_has_branch_access");
    expect(migration).toContain("settings.edit");
    expect(migration).toContain("settings.view");
    expect(migration).toContain("'system_owner'");
    expect(migration).toContain("'admin'");
    expect(migration).toContain("'hr'");
  });
});
