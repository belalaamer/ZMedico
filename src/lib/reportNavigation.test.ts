import { describe, expect, it } from "vitest";
import { visibleReportNavigation } from "./reportNavigation";

describe("report navigation authorization", () => {
  it("returns no report links when the role has no report permission", () => {
    expect(visibleReportNavigation(() => false)).toEqual([]);
  });

  it("keeps only the report destinations granted to the current role", () => {
    const allowed = new Set([
      "reports_finance.view",
      "reports_inventory.view",
      "reports_operational.view",
    ]);

    expect(visibleReportNavigation((permission) => allowed.has(permission)).map((item) => item.key)).toEqual([
      "financial",
      "operational",
      "inventory",
    ]);
  });

  it("maps clinical report access to medical and doctor-performance destinations", () => {
    const allowed = new Set(["reports_medical.view"]);

    expect(visibleReportNavigation((permission) => allowed.has(permission)).map((item) => item.key)).toEqual([
      "medical",
      "commissions",
      "doctorPerformance",
    ]);
  });
});
