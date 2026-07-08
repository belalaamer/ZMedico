import { describe, it, expect, beforeEach } from "vitest";
import {
  recordDecision,
  recordCacheRefresh,
  recordFingerprintChange,
  getMetrics,
  getRecentDecisions,
  setTelemetryEnabled,
  _resetTelemetryForTests,
} from "./telemetry";
import { setR1Override } from "./featureFlags";

describe("R1 telemetry", () => {
  beforeEach(() => {
    _resetTelemetryForTests();
    setR1Override(true);
  });

  it("is inert when the R1 flag is off", () => {
    setR1Override(false);
    recordDecision({
      ts: Date.now(), permission: "x.y", outcome: "allow", source: "legacy", latencyMs: 1,
    });
    recordCacheRefresh();
    recordFingerprintChange();
    const m = getMetrics();
    expect(m.legacyDecisions).toBe(0);
    expect(m.cacheRefreshes).toBe(0);
    expect(m.fingerprintChanges).toBe(0);
    expect(getRecentDecisions().length).toBe(0);
  });

  it("counts legacy vs new decisions and denies", () => {
    recordDecision({ ts: 1, permission: "a.b", outcome: "allow", source: "legacy", latencyMs: 2 });
    recordDecision({ ts: 2, permission: "a.b", outcome: "deny",  source: "legacy", latencyMs: 3 });
    recordDecision({ ts: 3, permission: "a.b", outcome: "allow", source: "new",    latencyMs: 4 });
    const m = getMetrics();
    expect(m.legacyDecisions).toBe(2);
    expect(m.newDecisions).toBe(1);
    expect(m.authorizationFailures).toBe(1);
    expect(m.lookupLatency.count).toBe(3);
    expect(m.lookupLatency.maxMs).toBe(4);
    expect(m.lookupLatency.avgMs).toBeCloseTo(3);
  });

  it("respects setTelemetryEnabled(false) for event capture but still counts", () => {
    setTelemetryEnabled(false);
    recordDecision({ ts: 1, permission: "a.b", outcome: "allow", source: "legacy", latencyMs: 1 });
    expect(getRecentDecisions().length).toBe(0);
    expect(getMetrics().legacyDecisions).toBe(1);
  });
});
