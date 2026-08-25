import { describe, expect, it } from "vitest";
import { shouldShowPlatformReturnLink } from "./platformNavigation";

describe("shouldShowPlatformReturnLink", () => {
  it("shows the link for a system owner on workspace routes", () => {
    expect(shouldShowPlatformReturnLink(true, "/workspace")).toBe(true);
    expect(shouldShowPlatformReturnLink(true, "/patients")).toBe(true);
  });

  it("hides the link for non-system-owner roles", () => {
    expect(shouldShowPlatformReturnLink(false, "/workspace")).toBe(false);
    expect(shouldShowPlatformReturnLink(false, "/patients")).toBe(false);
  });

  it("hides the link on platform routes", () => {
    expect(shouldShowPlatformReturnLink(true, "/platform")).toBe(false);
    expect(shouldShowPlatformReturnLink(true, "/platform/tenants")).toBe(false);
  });
});
