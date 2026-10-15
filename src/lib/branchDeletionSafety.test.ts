import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261012072647_disable_populated_branch_force_delete.sql",
  "utf8",
);
const branchPage = readFileSync("src/pages/branches/Branches.tsx", "utf8");
const errorMessages = readFileSync("src/lib/branchMutationErrors.ts", "utf8");

describe("branch deletion safety", () => {
  it("retires the incomplete destructive RPC and preserves explicit authorization", () => {
    expect(migration).toContain("Permanent deletion of a populated branch is disabled");
    expect(migration).toContain("public.has_role(auth.uid(), 'system_owner'");
    expect(migration).not.toContain("FOREACH tbl IN ARRAY");
  });

  it("enforces the final tenant branch invariant in the database", () => {
    expect(migration).toContain("tg_guard_last_tenant_branch");
    expect(migration).toContain("WHERE tenant_id = OLD.tenant_id");
    expect(migration).toContain("ERRCODE = '23514'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("FOR UPDATE NOWAIT");
    expect(migration).toContain("id <> OLD.id");
  });

  it("offers archival rather than permanent deletion for populated branches", () => {
    expect(branchPage).toContain("Archive the branch to hide it while preserving its records.");
    expect(branchPage).not.toContain("Force Delete");
    expect(branchPage).not.toContain("forceDeleteBranch");
    expect(errorMessages).toContain("The final active branch cannot be archived");
    expect(errorMessages).toContain("The branch could not be archived. Try again.");
  });

  it("also blocks ordinary CASCADE and SET NULL deletion paths", () => {
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("fk.confrelid = 'public.branches'::regclass");
    expect(migration).toContain("INTO v_has_references USING OLD.id");
    expect(migration).toContain("public.audit_logs WHERE branch_id = OLD.id");
    expect(migration).toContain("current_setting('transaction_isolation') <> 'read committed'");
    expect(migration).toContain("Branch has linked records; archive it instead");
  });
});
