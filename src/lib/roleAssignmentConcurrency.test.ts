import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261016153429_serialize_live_user_role_assignments.sql"), "utf8");

describe("ZMED-258 canonical role mutation boundary", () => {
  it("rejects drift before replacing the canonical function", () => {
    expect(sql).toContain("84b09a776c838d5f2cf55648ab7f2adb");
    expect(sql).toContain("4a77243167edf154de0192c7105f8bde");
    expect(sql.indexOf("$preflight$;")).toBeLessThan(sql.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(sql).toContain("SET LOCAL lock_timeout = '2s'");
  });

  it("requires a real live authenticated session before taking the role lock", () => {
    expect(sql).toContain("current_setting('role', true) IS DISTINCT FROM 'authenticated'");
    expect(sql.indexOf("NOT zmedico_security.session_is_active()"))
      .toBeLessThan(sql.indexOf("PERFORM pg_catalog.pg_advisory_xact_lock(20781001, 1)"));
    expect(sql).not.toContain("PERFORM public.assert_active_session()");
  });

  it("serializes before actor-role checks, target-role reads and owner counting", () => {
    const lock = sql.indexOf("PERFORM pg_catalog.pg_advisory_xact_lock(20781001, 1)");
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(sql.indexOf("IF v_actor IS NULL OR NOT public.has_role"));
    expect(lock).toBeLessThan(sql.indexOf("SELECT role::text INTO v_prev_role"));
    expect(lock).toBeLessThan(sql.indexOf("SELECT count(*)::integer INTO v_owner_count"));
  });

  it("preserves owner protection even for an existing multi-role identity", () => {
    expect(sql).toContain("ORDER BY (role = 'system_owner'::public.app_role) DESC, role::text");
    expect(sql).toContain("the last System Owner cannot be demoted or cleared");
    expect(sql).toContain("only the System Owner may modify another System Owner");
  });

  it("retains canonical auditing and does not rewrite roles during deployment", () => {
    expect(sql).toContain("INSERT INTO public.audit_logs");
    expect(sql).toContain("SET search_path TO ''");
    expect(sql).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/grant\s+.*\s+on\s+(?:table\s+)?public\.user_roles/i);
  });
});
