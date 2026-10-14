import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261012062832_enforce_staff_position_merge_audit.sql", "utf8");

describe("staff position merge audit migration", () => {
  it("is pinned to the reviewed live definition", () => {
    expect(migration).toContain("c9d9cb493044a7272140063592e7d118");
    expect(migration).toContain("definition drifted; review before applying");
  });

  it("replaces the obsolete metadata write with the canonical audit columns", () => {
    expect(migration).toContain("entity_id, old_values, new_values");
    expect(migration).toContain("''source_id'', source_id");
    expect(migration).toContain("''target_id'', target_id");
    expect(migration).toContain("''reassigned_count'', _reassigned");
  });

  it("removes the exception handler that swallowed audit failures", () => {
    expect(migration).toContain("exception when others then");
    expect(migration).toContain("Expected one swallowed staff-position audit block");
    const replacement = migration.match(/v_new text := E'([\s\S]*?)';\n+begin/)?.[1] ?? "";
    expect(replacement).not.toContain("exception when others");
  });
});
