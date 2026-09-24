import { describe, expect, it } from "vitest";
import { ACTIONS, DEFAULT_PERMISSIONS, MODULES, ROLES, defaultActionsFor, moduleForPath } from "./rolePermissions";

describe("role-based permission matrix", () => {
  it("keeps the supported role catalog explicit", () => {
    expect(ROLES).toEqual(["admin", "manager", "doctor", "nurse", "receptionist", "accountant", "hr"]);
  });

  it("allows delete only to the clinic admin role", () => {
    for (const role of ROLES) {
      for (const module of MODULES) {
        const actions = defaultActionsFor(role, module);
        if (role === "admin") expect(actions).toContain("delete");
        else expect(actions).not.toContain("delete");
      }
    }
  });

  it("keeps strict segregation for clinical, finance, front-desk, and HR roles", () => {
    expect(defaultActionsFor("doctor", "medical_records")).toEqual(["view", "create", "edit"]);
    expect(defaultActionsFor("doctor", "invoices")).toEqual([]);
    expect(defaultActionsFor("doctor", "treasury")).toEqual([]);
    expect(defaultActionsFor("doctor", "reports_medical")).toEqual(["view"]);

    expect(defaultActionsFor("nurse", "vitals")).toEqual(["view", "create", "edit"]);
    expect(defaultActionsFor("nurse", "reports")).toEqual([]);
    expect(defaultActionsFor("nurse", "medical_records")).toEqual(["view"]);

    expect(defaultActionsFor("receptionist", "patients")).toEqual(["view", "create", "edit"]);
    expect(defaultActionsFor("receptionist", "invoices")).toEqual(["view", "create"]);
    expect(defaultActionsFor("receptionist", "treasury")).toEqual([]);
    expect(defaultActionsFor("receptionist", "reports")).toEqual([]);

    expect(defaultActionsFor("accountant", "invoices")).toEqual(["view", "create", "edit", "export"]);
    expect(defaultActionsFor("accountant", "treasury")).toEqual(["view", "create", "edit", "export"]);
    expect(defaultActionsFor("accountant", "medical_records")).toEqual([]);
    expect(defaultActionsFor("accountant", "reports_medical")).toEqual([]);

    expect(defaultActionsFor("hr", "hr")).toEqual(["view", "create", "edit", "export"]);
    expect(defaultActionsFor("hr", "reports_hr")).toEqual(["view", "export"]);
    expect(defaultActionsFor("hr", "patients")).toEqual([]);
    expect(defaultActionsFor("hr", "treasury")).toEqual([]);
  });

  it("keeps manager read-only over clinical and finance data while allowing operations oversight", () => {
    expect(defaultActionsFor("manager", "appointments")).toEqual(["view", "create", "edit", "export"]);
    expect(defaultActionsFor("manager", "medical_records")).toEqual(["view"]);
    expect(defaultActionsFor("manager", "invoices")).toEqual(["view", "export"]);
    expect(defaultActionsFor("manager", "treasury")).toEqual(["view", "export"]);
    expect(defaultActionsFor("manager", "reports_hr")).toEqual([]);
    expect(defaultActionsFor("manager", "settings")).toEqual(["view"]);
  });

  it("maps every sensitive route family to the intended permission module", () => {
    const cases: Array<[string, string]> = [
      ["/patients", "patients"],
      ["/patients/11111111-1111-1111-1111-111111111111/dental", "medical_records"],
      ["/calendar", "appointments"],
      ["/queue", "appointments"],
      ["/medical/records", "medical_records"],
      ["/invoices", "invoices"],
      ["/payments", "invoices"],
      ["/treasury", "treasury"],
      ["/inventory", "inventory"],
      ["/hr/staff", "hr"],
      ["/reports/financial", "reports_finance"],
      ["/reports/medical", "reports_medical"],
      ["/reports/hr", "reports_hr"],
      ["/settings/users", "settings"],
    ];
    for (const [path, module] of cases) expect(moduleForPath(path)).toBe(module);
  });

  it("keeps admin complete over the clinic module catalog", () => {
    for (const module of MODULES) expect(DEFAULT_PERMISSIONS.admin[module]).toEqual([...ACTIONS]);
  });
});
