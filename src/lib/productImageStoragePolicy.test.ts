import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("product image storage hardening", () => {
  const page = readFileSync(
    resolve(process.cwd(), "src/pages/inventory/Products.tsx"),
    "utf8",
  );
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925140500_harden_product_image_storage.sql"),
    "utf8",
  );
  const legacyCompat = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260925163000_product_image_legacy_owner_compat.sql"),
    "utf8",
  );

  it("stores uploads under the current tenant prefix", () => {
    expect(page).toContain('const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;');
    expect(page).toContain('storage.from("product-images").upload(path');
  });

  it("enforces server-side size and MIME limits", () => {
    expect(migration).toContain("file_size_limit = 5242880");
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(migration).toContain(`'${mime}'`);
    }
  });

  it("requires inventory permission and tenant ownership for writes", () => {
    expect(migration).toContain("'inventory.create'");
    expect(migration).toContain("'inventory.edit'");
    expect(migration).toContain("'inventory.delete'");
    expect(migration).toContain("user_has_tenant_access");
    expect(migration).toContain("split_part(name, '/', 1)");
  });

  it("keeps the deployed root uploader owner-scoped until frontend cutover", () => {
    expect(legacyCompat).toContain("position('/' in name) = 0");
    expect(legacyCompat).toContain("owner_id = (SELECT auth.uid()::text)");
    expect(legacyCompat).toContain("'inventory.create'");
    expect(legacyCompat).toContain("'inventory.delete'");
    expect(legacyCompat).not.toContain("FOR SELECT");
    expect(legacyCompat).not.toContain("TO anon");
  });

  it("does not grant object listing or anonymous upload access", () => {
    expect(migration).not.toContain("FOR SELECT");
    expect(migration).not.toContain("TO anon");
  });
});
