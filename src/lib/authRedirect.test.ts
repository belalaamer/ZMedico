import { describe, expect, it } from "vitest";
import { defaultAuthenticatedPath, resolvePostAuthRedirect } from "./authRedirect";

describe("post-auth redirect", () => {
  it("sends System Owner to the platform console", () => {
    expect(defaultAuthenticatedPath(["system_owner"])).toBe("/platform");
    expect(resolvePostAuthRedirect("/", ["system_owner"])).toBe("/platform");
  });

  it("sends clinic roles to the workspace", () => {
    expect(defaultAuthenticatedPath(["admin"])).toBe("/workspace");
    expect(resolvePostAuthRedirect("/", ["manager"])).toBe("/workspace");
  });

  it("preserves an intentional deep link", () => {
    expect(resolvePostAuthRedirect("/platform?audit=role-based", ["system_owner"])).toBe("/platform?audit=role-based");
    expect(resolvePostAuthRedirect("/appointments/123", ["admin"])).toBe("/appointments/123");
  });

  it("does not route an auth page back to the public landing page", () => {
    expect(resolvePostAuthRedirect("/auth", ["system_owner"])).toBe("/platform");
    expect(resolvePostAuthRedirect("/auth?next=/", ["admin"])).toBe("/workspace");
  });
});
