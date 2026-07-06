import { describe, it, expect } from "vitest";
import { AuthorizationService } from "./AuthorizationService";

/**
 * Sprint 1 · Batch 2A — AuthorizationService public API contract tests.
 *
 * These tests pin the observable behavior of `can()`, `canAny()`, and
 * `canAll()`. The internal implementation is expected to change in later
 * waves (permission catalog, scope resolution) but these contracts must
 * remain byte-identical so declarative wrappers (<Can>, <CanExport>) keep
 * rendering the same decisions across every migration.
 */

function svc(map: Record<string, string[]>, isAdmin = false) {
  return new AuthorizationService({
    legacyCan: (m, a = "view") => (map[m] ?? []).includes(a),
    isAdmin,
  });
}

describe("contract · can()", () => {
  it("grants when the permission exists", () => {
    expect(svc({ invoices: ["view"] }).can("invoices.view")).toBe(true);
  });
  it("denies when the module is unknown", () => {
    expect(svc({}).can("nope.view")).toBe(false);
  });
  it("denies when the action is missing", () => {
    expect(svc({ invoices: ["view"] }).can("invoices.delete")).toBe(false);
  });
  it("defaults to the 'view' action when key has no dot", () => {
    expect(svc({ dashboard: ["view"] }).can("dashboard")).toBe(true);
    expect(svc({ dashboard: [] }).can("dashboard")).toBe(false);
  });
  it("admin bypasses every check", () => {
    expect(svc({}, true).can("anything.anywhere")).toBe(true);
  });
});

describe("contract · canAny()", () => {
  const s = svc({ invoices: ["view"], patients: ["create"] });
  it("true when at least one matches", () => {
    expect(s.canAny("invoices.view", "hr.view")).toBe(true);
    expect(s.canAny("hr.view", "patients.create")).toBe(true);
  });
  it("false when none match", () => {
    expect(s.canAny("hr.view", "settings.edit")).toBe(false);
  });
  it("false on empty list (nothing to grant)", () => {
    expect(s.canAny()).toBe(false);
  });
  it("admin bypasses even empty list", () => {
    expect(svc({}, true).canAny()).toBe(true);
  });
});

describe("contract · canAll()", () => {
  const s = svc({ invoices: ["view", "create"], patients: ["view"] });
  it("true when every permission is present", () => {
    expect(s.canAll("invoices.view", "invoices.create", "patients.view")).toBe(true);
  });
  it("false when any permission is missing", () => {
    expect(s.canAll("invoices.view", "patients.delete")).toBe(false);
  });
  it("vacuously true on empty list", () => {
    expect(s.canAll()).toBe(true);
  });
  it("admin bypasses every check", () => {
    expect(svc({}, true).canAll("a.x", "b.y", "c.z")).toBe(true);
  });
});

describe("contract · isSuperAdmin()", () => {
  it("true only for admin construction", () => {
    expect(svc({}, true).isSuperAdmin()).toBe(true);
    expect(svc({ invoices: ["view"] }).isSuperAdmin()).toBe(false);
  });
});