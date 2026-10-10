import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync("supabase/migrations/20261010185137_guard_direct_staff_wallet_mutations.sql", "utf8");

it("requires an exact reviewed wallet body, including optional funding and reversal guards", () => {
  for (const hash of ["ce34cf6d3df9b58c89694f52509dac6e", "c432fe02b9a614fdf63da8725a4fa466", "3f8872447a76d3fd4db578d0269125b5", "70e1ab64f5f41e629213e8a4a8b432ce"]) expect(source).toContain(hash);
  expect(source).toContain("Exact authenticated wallet entry changed");
  expect(source).toContain("Direct-call guard insertion failed");
});

it("rejects ordinary direct callers independently of wallet type or client reference", () => {
  expect(source).toContain("pg_catalog.pg_trigger_depth() = 0 AND NOT (");
  expect(source).toContain("public.has_role(_uid,'admin'::public.app_role)");
  expect(source).toContain("public.has_role(_uid,'system_owner'::public.app_role)");
  expect(source).toContain("USING ERRCODE = '42501'");
  expect(source).not.toMatch(/auth\.jwt|user_metadata|request\.headers|_reference_type\s*=|_tx_type\s*=/i);
});

it("preserves the remaining body and exact execution metadata without data repair or new grants", () => {
  expect(source).toContain("replace(original,entry,entry ||");
  for (const field of ["p.proacl IS DISTINCT FROM original_acl", "p.proowner IS DISTINCT FROM original_owner", "p.prosecdef IS DISTINCT FROM original_definer", "p.proconfig IS DISTINCT FROM original_config"]) expect(source).toContain(field);
  expect(source).not.toMatch(/\b(?:grant\s+execute|revoke\s+all|alter\s+table|disable\s+(?:trigger|row\s+level\s+security)|insert\s+into\s+public\.|update\s+public\.|delete\s+from\s+public\.)\b/i);
});
