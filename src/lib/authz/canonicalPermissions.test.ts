import { describe, it, expect } from "vitest";
import { reduceCanonicalRows } from "./canonicalPermissions";

describe("Phase B · reduceCanonicalRows", () => {
  it("returns an empty map for no rows", () => {
    expect(reduceCanonicalRows([])).toEqual({});
  });

  it("groups actions by module using the first dot", () => {
    const map = reduceCanonicalRows([
      { permission_key: "patients.view" },
      { permission_key: "patients.create" },
      { permission_key: "invoices.view" },
    ]);
    expect([...map.patients].sort()).toEqual(["create", "view"]);
    expect([...map.invoices]).toEqual(["view"]);
  });

  it("treats multi-dot keys as <module>.<rest>", () => {
    const map = reduceCanonicalRows([
      { permission_key: "settings.pricing.update" },
    ]);
    expect(map.settings.has("pricing.update")).toBe(true);
  });

  it("defaults action to 'view' when key has no dot", () => {
    const map = reduceCanonicalRows([{ permission_key: "dashboard" }]);
    expect(map.dashboard.has("view")).toBe(true);
  });

  it("de-duplicates repeated rows", () => {
    const map = reduceCanonicalRows([
      { permission_key: "hr.view" },
      { permission_key: "hr.view" },
    ]);
    expect(map.hr.size).toBe(1);
  });

  it("skips malformed rows without throwing", () => {
    // @ts-expect-error — intentional bad input
    const map = reduceCanonicalRows([{ permission_key: null }, {}, { permission_key: "hr.view" }]);
    expect(Object.keys(map)).toEqual(["hr"]);
  });
});
