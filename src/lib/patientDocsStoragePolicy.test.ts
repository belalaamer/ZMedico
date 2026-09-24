import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("patient document storage policy", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260924195000_enable_secure_patient_docs_storage.sql"),
    "utf8",
  );

  it("keeps patient documents private and bounded server-side", () => {
    expect(migration).toContain("public = false");
    expect(migration).toContain("file_size_limit = 20971520");
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "application/dicom",
    ]) {
      expect(migration).toContain(mime);
    }
  });

  it("maps object paths to a real active patient before allowing access", () => {
    expect(migration).toContain("split_part(storage.objects.name, '/', 1)");
    expect(migration).toContain("p.deleted_at IS NULL");
    expect(migration).toContain("public.user_has_branch_access(p.branch_id)");
  });

  it("uses clinical action permissions for storage operations", () => {
    expect(migration).toContain("medical_records.view");
    expect(migration).toContain("medical_records.create");
    expect(migration).toContain("medical_records.edit");
    expect(migration).toContain("medical_records.delete");
  });

  it("checks branch scope on both old and new paths during updates", () => {
    const updateStart = migration.indexOf("CREATE POLICY patient_docs_storage_update");
    expect(updateStart).toBeGreaterThanOrEqual(0);
    const update = migration.slice(updateStart, migration.indexOf("CREATE POLICY patient_docs_storage_delete"));
    expect(update.match(/user_has_branch_access\(p\.branch_id\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
