import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const source = readFileSync("supabase/migrations/20261009231039_guard_authenticated_default_treasury_lookup.sql", "utf8");
it("pins the existing helper and authorizes role and branch before lookup", () => {
  expect(source).toContain("7997e5b68169c179817b122ffa27fb38");
  expect(source).toContain("v_actor uuid:=auth.uid()");
  expect(source.indexOf("Financial permission required")).toBeLessThan(source.indexOf("select t.id into v_treasury"));
  expect(source.indexOf("public.user_has_branch_access(_branch_id)")).toBeLessThan(source.indexOf("select t.id into v_treasury"));
});
it("does not trust definer current_user or editable metadata and denies anonymous execution", () => {
  expect(source).toContain("v_claim_role='service_role' and v_sql_role='service_role'");
  expect(source).toContain("session_user in ('postgres','supabase_admin')");
  expect(source).not.toMatch(/current_user\s*=/i);
  expect(source).not.toMatch(/auth\.jwt\(\)\s*->\s*'user_metadata'/i);
  expect(source).toContain("from public,anon;");
});
it("returns only a valid scalar default identity without financial table grants or writes", () => {
  expect(source).toContain("returns uuid");
  expect(source).toContain("t.is_active and t.deleted_at is null");
  expect(source).toContain("order by t.created_at,t.id limit 1");
  expect(source).not.toMatch(/grant\s+(select|insert|update|delete).*on\s+public\.(treasury|payments)\b/i);
  expect(source).not.toMatch(/\b(update\s+public\.|insert\s+into\s+public\.|delete\s+from\s+public\.|disable\s+row\s+level\s+security)/i);
});
