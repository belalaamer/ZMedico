import { describe, it, expect, beforeEach, vi } from "vitest";
import { setR1Override, isR1Enabled } from "./featureFlags";
import { AuthorizationService } from "./AuthorizationService";
import {
  _resetTelemetryForTests,
  recordDecision,
  getMetrics,
  getRecentDecisions,
} from "./telemetry";

describe("R1 feature flag", () => {
  beforeEach(() => setR1Override(null));
  it("defaults to disabled", () => {
    expect(isR1Enabled()).toBe(false);
  });
  it("respects the localStorage override", () => {
    setR1Override(true);
    expect(isR1Enabled()).toBe(true);
    setR1Override(false);
    expect(isR1Enabled()).toBe(false);
  });
});

describe("AuthorizationService decision-source tagging", () => {
  beforeEach(() => {
    _resetTelemetryForTests();
    setR1Override(true);
  });
  it("emits telemetry with source and fingerprint when configured", () => {
    const emit = vi.fn((e) => recordDecision(e));
    const svc = new AuthorizationService({
      legacyCan: (m, a) => m === "invoices" && a === "view",
      isAdmin: false,
      source: "legacy",
      fingerprint: "abc123",
      component: "TestPage",
      emit,
    });
    expect(svc.can("invoices.view")).toBe(true);
    expect(svc.can("invoices.delete")).toBe(false);
    expect(emit).toHaveBeenCalledTimes(2);
    const events = getRecentDecisions();
    expect(events[0].permission).toBe("invoices.view");
    expect(events[0].outcome).toBe("allow");
    expect(events[0].source).toBe("legacy");
    expect(events[0].fingerprint).toBe("abc123");
    expect(events[1].outcome).toBe("deny");
    const m = getMetrics();
    expect(m.legacyDecisions).toBe(2);
    expect(m.authorizationFailures).toBe(1);
  });
  it("keeps decisions byte-identical to pre-R1 when emit is omitted", () => {
    const svc = new AuthorizationService({
      legacyCan: (m, a) => m === "x" && a === "view",
      isAdmin: false,
    });
    expect(svc.can("x.view")).toBe(true);
    expect(svc.can("x.edit")).toBe(false);
    expect(svc.canAll("x.view")).toBe(true);
    expect(svc.canAny("x.edit", "x.view")).toBe(true);
    expect(getRecentDecisions().length).toBe(0);
  });
});
