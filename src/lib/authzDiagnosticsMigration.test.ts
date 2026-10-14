import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261012063831_repair_authz_diagnostic_state_and_trace.sql", "utf8");

describe("authorization diagnostics migration", () => {
  it("pins both live diagnostic definitions", () => {
    expect(migration).toContain("14b4ad86c5c7756932f9c7b15af2436f");
    expect(migration).toContain("e5a3e23e255995228d6e9625511c0fdb");
    expect(migration.match(/definition drifted; review before applying/g)).toHaveLength(2);
  });

  it("uses the current permission deprecation column", () => {
    expect(migration).toContain("deprecated_at IS NOT NULL");
    expect(migration).toContain("deprecated IS TRUE");
  });

  it("removes the invalid direct semver-to-integer assignment", () => {
    expect(migration).toContain("Expected one invalid catalog major assignment");
    expect(migration).toContain("catalog major is parsed by the regexp assignment below");
  });

  it("uses a recursive parent-to-child bundle traversal", () => {
    expect(migration).toContain("WITH RECURSIVE held AS");
    expect(migration).toContain("i.parent_bundle_key = r.reached");
    expect(migration).toContain("i.child_bundle_key");
    expect(migration).not.toContain("i.implied_bundle_key" + "\n        JOIN public");
  });
});
