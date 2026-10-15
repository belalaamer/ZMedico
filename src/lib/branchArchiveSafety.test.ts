import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261012074159_guard_last_active_branch_archive.sql",
  "utf8",
);

describe("branch archival safety", () => {
  it("preserves branch-scoped admin authorization", () => {
    expect(migration).toContain("public.user_has_branch_access(_branch_id)");
    expect(migration).toContain("ERRCODE = '42501'");
  });

  it("serializes and rejects removal of the final active branch", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("id <> OLD.id");
    expect(migration).toContain("Cannot archive or delete the last active branch for a tenant");
    expect(migration).toContain("BEFORE UPDATE OF is_active OR DELETE");
    expect(migration).toContain("FROM public.tenants");
    expect(migration).toContain("IF NOT COALESCE(v_tenant_active, false)");
  });

  it("records a successful archive and keeps repeated calls idempotent", () => {
    expect(migration).toContain("'branch.archive'");
    expect(migration).toContain("'already_archived', true");
    expect(migration).toContain("'already_archived', false");
    expect(migration).toContain("WHERE id = _branch_id\n   FOR UPDATE;");
  });

  it("locks a surviving row rather than trusting a stale snapshot count", () => {
    expect(migration).toContain("INTO v_surviving_branch");
    expect(migration).toContain("FOR UPDATE NOWAIT");
    expect(migration).toContain("ORDER BY id");
    expect(migration).not.toContain("SELECT count(*)\n      INTO v_other_active");
  });
});
