import { describe, expect, it } from "vitest";
import { isValidHostname, isValidTenantSlug, normalizeHostname, normalizeTenantSlug } from "./saasOnboarding";

describe("SaaS onboarding validation", () => {
  it("normalizes tenant slugs predictably", () => {
    expect(normalizeTenantSlug(" Al Noor / Clinic ")).toBe("al-noor-clinic");
    expect(isValidTenantSlug("al-noor-clinic")).toBe(true);
    expect(isValidTenantSlug("A slug with spaces")).toBe(false);
  });

  it("accepts customer subdomains and strips protocol/trailing slash", () => {
    expect(normalizeHostname("https://portal.Client.com/")).toBe("portal.client.com");
    expect(isValidHostname("portal.client.com")).toBe(true);
  });

  it("rejects unsafe or incomplete hostnames", () => {
    expect(isValidHostname("localhost")).toBe(false);
    expect(isValidHostname("https://portal.client.com/path")).toBe(false);
    expect(isValidHostname("portal_client.com")).toBe(false);
    expect(isValidHostname("client.com")).toBe(true);
  });
});
