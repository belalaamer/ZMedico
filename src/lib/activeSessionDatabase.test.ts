import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261011160004_assert_active_edge_caller_session.sql", "utf8");
describe("phase-one active Edge caller assertion contract", () => {
  it("refuses to replace pre-existing private or public objects", () => {
    expect(sql).toContain("to_regnamespace('zmedico_security') is not null");
    expect(sql).toContain("to_regprocedure('public.assert_active_session()') is not null");
    expect(sql).not.toMatch(/create or replace/i);
  });
  it("keeps privileged Auth lookup private and the public assertion invoker-only", () => {
    expect(sql).toMatch(/create function zmedico_security\.session_is_active\(\)[\s\S]*security definer set search_path = ''/);
    expect(sql).toMatch(/create function public\.assert_active_session\(\)[\s\S]*security invoker set search_path = ''/);
  });
  it("requires matching actual role, trusted issuer and expiry", () => {
    expect(sql).toContain("current_setting('role', true) = 'authenticated'");
    expect(sql).toContain("jwt->>'role' = 'authenticated'");
    expect(sql).toContain("https://rqcmnfzfytyyicelvifk.supabase.co/auth/v1");
    expect(sql).toContain("extract(epoch from statement_timestamp())");
  });
  it("guards each identifier cast, not only its enclosing condition", () => {
    expect(sql).toMatch(/s\.id = case when jwt->>'session_id'[\s\S]*then \(jwt->>'session_id'\)::uuid else null end/);
    expect(sql).toMatch(/u\.id = case when jwt->>'sub'[\s\S]*then auth\.uid\(\) else null end/);
  });
  it("checks authoritative account and owned session state without editable metadata", () => {
    for (const predicate of ["s.user_id = u.id", "u.deleted_at is null", "u.is_anonymous", "u.banned_until", "s.not_after"]) expect(sql).toContain(predicate);
    expect(sql).not.toMatch(/user_metadata|raw_user_meta_data/);
  });
  it("fails closed without returning user or session details", () => {
    expect(sql).toContain("not coalesce(zmedico_security.session_is_active(), false)");
    expect(sql).toContain("using errcode='42501'");
    expect(sql).toMatch(/returns void language plpgsql/);
  });
  it("grants only authenticated RPC access without widening business permissions", () => {
    expect(sql).toContain("revoke all on function public.assert_active_session() from public, anon, authenticated, service_role");
    expect(sql).toContain("grant execute on function public.assert_active_session() to authenticated");
    expect(sql).not.toMatch(/alter\s+(?:role|table)|create\s+policy|db_pre_request|\b(?:insert into|update public\.|delete from)\b/i);
  });
});
