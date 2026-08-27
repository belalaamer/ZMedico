import { describe, expect, it } from "vitest";
import { DEFAULT_ENABLED_MODULES, moduleKeyForPath, type ClinicModuleKey } from "@/lib/clinicModules";
import {
  defaultModulesForPlan,
  filterModulesByPlan,
  isModuleEnabledForEntitlement,
  planAllowsModule,
  shouldBlockRouteForEntitlement,
} from "@/lib/subscriptionEntitlements";

describe("subscription entitlements", () => {
  it("allows legacy plans with no explicit feature map", () => {
    expect(planAllowsModule("physio", {})).toBe(true);
    expect(isModuleEnabledForEntitlement("physio", ["physio"], {})).toBe(true);
  });

  it("denies an explicitly disabled plan feature even when tenant settings enable it", () => {
    const enabledByTenant: ClinicModuleKey[] = ["dashboard", "patients", "physio", "inventory"];
    const planFeatures = { physio: false, inventory: false };

    expect(isModuleEnabledForEntitlement("physio", enabledByTenant, planFeatures)).toBe(false);
    expect(isModuleEnabledForEntitlement("inventory", enabledByTenant, planFeatures)).toBe(false);
    expect(isModuleEnabledForEntitlement("patients", enabledByTenant, planFeatures)).toBe(true);
  });

  it("denies a module not enabled by tenant settings even when the plan allows it", () => {
    expect(isModuleEnabledForEntitlement("physio", ["dashboard", "patients"], { physio: true })).toBe(false);
  });

  it("filters the fallback module list by explicit plan restrictions", () => {
    const filtered = filterModulesByPlan(DEFAULT_ENABLED_MODULES, {
      physio: false,
      inventory: false,
      hr: false,
      marketing: false,
    });

    expect(filtered).not.toContain("physio");
    expect(filtered).not.toContain("inventory");
    expect(filtered).not.toContain("hr");
    expect(filtered).not.toContain("marketing");
    expect(filtered).toContain("dashboard");
    expect(filtered).toContain("patients");
    expect(filtered).toContain("appointments");
  });

  it("does not treat unrelated feature names as module grants", () => {
    expect(planAllowsModule("physio", { max_cases: true })).toBe(true);
    expect(planAllowsModule("physio", { physio: false, another_feature: true })).toBe(false);
  });

  it("keeps the core enabled and maps plan-gated modules consistently", () => {
    const basic = defaultModulesForPlan({ reports: false, inventory: false, hr: false });
    const professional = defaultModulesForPlan({ reports: true, inventory: true, hr: true, marketing: false });
    const enterprise = defaultModulesForPlan({ reports: true, inventory: true, hr: true, marketing: true });

    expect(basic).toEqual(expect.arrayContaining(["dashboard", "patients", "appointments", "medical", "invoices", "communication"]));
    expect(basic).not.toContain("reports");
    expect(basic).not.toContain("inventory");
    expect(basic).not.toContain("hr");
    expect(professional).toEqual(expect.arrayContaining(["reports", "inventory", "hr"]));
    expect(professional).not.toContain("marketing");
    expect(enterprise).toContain("marketing");
    expect(enterprise).not.toContain("physio");
  });

  it("does not allow a disabled plan-gated module even when a tenant payload requests it", () => {
    expect(planAllowsModule("reports", { reports: false })).toBe(false);
    expect(planAllowsModule("inventory", { inventory: false })).toBe(false);
    expect(planAllowsModule("reports", { reports: true })).toBe(true);
  });
});

describe("PermissionRoute subscription gate", () => {
  it("blocks a disabled module while a branch is selected, regardless of caller role", () => {
    const disabled = shouldBlockRouteForEntitlement("physio", "branch-1", () => false);
    expect(disabled).toBe(true);
  });

  it("does not block before branch context is selected", () => {
    expect(shouldBlockRouteForEntitlement("physio", null, () => false)).toBe(false);
    expect(shouldBlockRouteForEntitlement("physio", undefined, () => false)).toBe(false);
  });

  it("does not block enabled modules or paths without a module entitlement", () => {
    expect(shouldBlockRouteForEntitlement("physio", "branch-1", () => true)).toBe(false);
    expect(shouldBlockRouteForEntitlement(null, "branch-1", () => false)).toBe(false);
  });
});

describe("module route entitlement mapping", () => {
  const cases: Array<[string, ClinicModuleKey]> = [
    ["/physio/cases", "physio"],
    ["/inventory/products", "inventory"],
    ["/hr/staff", "hr"],
    ["/leads", "marketing"],
    ["/settings/communication", "communication"],
    ["/medical/records", "medical"],
    ["/patients", "patients"],
    ["/calendar", "appointments"],
    ["/queue", "appointments"],
    ["/appointments/new", "appointments"],
    ["/reminders", "appointments"],
    ["/invoices", "invoices"],
    ["/payments", "invoices"],
    ["/treasury", "invoices"],
    ["/expenses", "invoices"],
    ["/coupons", "invoices"],
    ["/reports/financial", "reports"],
  ];

  it.each(cases)("maps %s to %s", (path, expected) => {
    expect(moduleKeyForPath(path)).toBe(expected);
  });

  it("leaves unmapped public and platform paths outside tenant module gating", () => {
    expect(moduleKeyForPath("/book?tenant=default")).toBe(null);
    expect(moduleKeyForPath("/platform")).toBe(null);
    expect(moduleKeyForPath("/settings/profile")).toBe(null);
  });
});
