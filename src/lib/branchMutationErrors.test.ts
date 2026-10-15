import { describe, expect, it } from "vitest";
import { branchMutationFailure } from "./branchMutationErrors";

describe("branch mutation feedback", () => {
  it.each(["40001", "40P01", "55P03"])("explains concurrent changes for %s", (code) => {
    const result = branchMutationFailure({ code, message: "private SQL diagnostic" }, "en", "archive");
    expect(result.title).toBe("Another branch update is in progress");
    expect(result.description).toContain("before retrying");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each(["archive", "delete"] as const)("explains the final-branch constraint for %s", (operation) => {
    expect(branchMutationFailure({ code: "23514" }, "en", operation).title).toContain("final");
    expect(branchMutationFailure({ code: "23514" }, "ar", operation).title).toContain("آخر");
  });
  it.each(["42501", "P0002"])("hides diagnostics for %s", (code) => {
    const result = branchMutationFailure({ code, message: "sensitive data" }, "ar", "delete");
    expect(result.variant).toBe("destructive");
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
  it.each([null, undefined, new Error("private network stack"), { message: "private database details" }])("does not assume an unknown transport outcome", (error) => {
    expect(branchMutationFailure(error, "en", "delete").description).toContain("verify the outcome");
    expect(JSON.stringify(branchMutationFailure(error, "ar", "archive"))).not.toContain("private");
  });
});
