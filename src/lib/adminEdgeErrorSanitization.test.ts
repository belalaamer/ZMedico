import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sources = [
  "admin-create-user",
  "admin-delete-user",
  "admin-reset-password",
].map((name) => readFileSync(`supabase/functions/${name}/index.ts`, "utf8"));

describe("administrative Edge error responses", () => {
  it("does not return database, Auth provider or exception messages", () => {
    for (const source of sources) {
      expect(source).not.toMatch(/error:\s*(?:`[^`]*\$\{[^}]*\.message|[^,}\n]*\.message)/);
      expect(source).not.toContain("(e as Error).message");
    }
  });

  it("retains stable operation-specific failure messages", () => {
    expect(sources[0]).toContain('error: "Unable to create user"');
    expect(sources[1]).toContain('error: "Unable to delete user"');
    expect(sources[2]).toContain('error: "Unable to reset password"');
  });

  it("accepts only bounded POST requests", () => {
    for (const source of sources) {
      expect(source).toContain('if (req.method !== "POST")');
      expect(source).toContain('MAX_BODY_BYTES = 8 * 1024');
      expect(source).toContain('Request body is too large');
      expect(source).toContain('typeof parsed !== "object" || Array.isArray(parsed)');
    }
  });
});
