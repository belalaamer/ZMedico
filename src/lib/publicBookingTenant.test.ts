import { describe, expect, it } from "vitest";
import { getPublicBookingLocator } from "./publicBookingTenant";

describe("public booking tenant locator", () => {
  it("uses the tenant query on workers.dev links", () => {
    expect(getPublicBookingLocator("zmedico2.belalaamer.workers.dev", "?tenant=default")).toEqual({
      mode: "tenant-query",
      slug: "default",
    });
  });

  it("does not treat a custom hostname as a tenant query", () => {
    expect(getPublicBookingLocator("clinic.example.com", "?tenant=another-clinic")).toEqual({
      mode: "custom-domain",
      hostname: "clinic.example.com",
    });
  });

  it("returns a safe missing state when a worker link has no tenant", () => {
    expect(getPublicBookingLocator("localhost", "")).toEqual({ mode: "missing-tenant" });
    expect(getPublicBookingLocator("127.0.0.1", "?tenant=%20")).toEqual({ mode: "missing-tenant" });
  });

  it("normalizes custom hostnames without changing the tenant identifier", () => {
    expect(getPublicBookingLocator("  Clinic.Example.COM  ", "")).toEqual({
      mode: "custom-domain",
      hostname: "clinic.example.com",
    });
  });
});
