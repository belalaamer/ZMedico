import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("clinical catalog write hardening", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925111804_harden_clinical_catalog_writes.sql"),
    "utf8",
  );

  it("requires the canonical catalog update permission", () => {
    expect(migration.match(/settings\.catalog\.update/g)?.length)
      .toBeGreaterThanOrEqual(10);
  });

  it("keeps tenant rows tenant-scoped", () => {
    expect(migration.match(/user_has_tenant_access\(tenant_id\)/g)?.length)
      .toBeGreaterThanOrEqual(10);
    expect(migration).toContain("tenant_id IS NOT NULL");
  });

  it("preserves System Owner maintenance of global seed rows", () => {
    expect(migration.match(/'system_owner'::public\.app_role/g)?.length)
      .toBeGreaterThanOrEqual(10);
  });

  it("covers all four clinical catalog tables", () => {
    for (const table of [
      "medical_specialties",
      "medications",
      "diagnoses",
      "procedures",
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
  });
});
