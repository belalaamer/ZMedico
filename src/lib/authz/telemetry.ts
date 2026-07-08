/**
 * Runtime Wave R1 — Authorization decision telemetry + migration metrics.
 *
 * DESIGN
 *   - Zero PII. Zero row data. Zero JWT contents.
 *   - In-memory ring buffer (default 500 events) + counters.
 *   - Disableable at any time via setTelemetryEnabled(false).
 *   - Gated by the R1 feature flag: no-ops entirely when R1 is off.
 *   - Zero third-party dependency; pluggable sink via setTelemetrySink().
 */

import { isR1Enabled } from "./featureFlags";

export type DecisionSource = "legacy" | "new";
export type DecisionOutcome = "allow" | "deny";

export interface DecisionEvent {
  ts: number;                 // ms since epoch
  permission: string;         // catalog key ("<module>.<action>")
  outcome: DecisionOutcome;
  source: DecisionSource;
  component?: string;         // optional caller tag
  fingerprint?: string;       // authz state fingerprint at decision time
  latencyMs: number;          // wall time of the decision function
}

export interface RuntimeMetrics {
  legacyDecisions: number;
  newDecisions: number;
  cacheRefreshes: number;
  fingerprintChanges: number;
  authorizationFailures: number; // count of DENY outcomes
  lookupLatency: {
    count: number;
    totalMs: number;
    maxMs: number;
    avgMs: number;
  };
}

type Sink = (event: DecisionEvent) => void;

const RING_CAPACITY = 500;
const ring: DecisionEvent[] = [];
let ringHead = 0;

let telemetryEnabled = true;
let sink: Sink | null = null;

const metrics: RuntimeMetrics = {
  legacyDecisions: 0,
  newDecisions: 0,
  cacheRefreshes: 0,
  fingerprintChanges: 0,
  authorizationFailures: 0,
  lookupLatency: { count: 0, totalMs: 0, maxMs: 0, avgMs: 0 },
};

export function setTelemetryEnabled(v: boolean): void {
  telemetryEnabled = v;
}

export function setTelemetrySink(fn: Sink | null): void {
  sink = fn;
}

export function recordDecision(evt: DecisionEvent): void {
  if (!isR1Enabled()) return;
  // Counters run regardless of the ring/sink so metrics stay accurate
  // even when the operator disables event capture.
  if (evt.source === "legacy") metrics.legacyDecisions += 1;
  else metrics.newDecisions += 1;
  if (evt.outcome === "deny") metrics.authorizationFailures += 1;

  const lat = metrics.lookupLatency;
  lat.count += 1;
  lat.totalMs += evt.latencyMs;
  if (evt.latencyMs > lat.maxMs) lat.maxMs = evt.latencyMs;
  lat.avgMs = lat.totalMs / lat.count;

  if (!telemetryEnabled) return;
  if (ring.length < RING_CAPACITY) ring.push(evt);
  else {
    ring[ringHead] = evt;
    ringHead = (ringHead + 1) % RING_CAPACITY;
  }
  try { sink?.(evt); } catch { /* sink must never throw into callers */ }
}

export function recordCacheRefresh(): void {
  if (!isR1Enabled()) return;
  metrics.cacheRefreshes += 1;
}

export function recordFingerprintChange(): void {
  if (!isR1Enabled()) return;
  metrics.fingerprintChanges += 1;
}

export function getMetrics(): RuntimeMetrics {
  // Read-only snapshot (deep clone to prevent external mutation).
  return {
    ...metrics,
    lookupLatency: { ...metrics.lookupLatency },
  };
}

export function getRecentDecisions(): readonly DecisionEvent[] {
  if (ring.length < RING_CAPACITY) return ring.slice();
  return ring.slice(ringHead).concat(ring.slice(0, ringHead));
}

/** Test-only helpers. Not called by production code. */
export function _resetTelemetryForTests(): void {
  ring.length = 0;
  ringHead = 0;
  telemetryEnabled = true;
  sink = null;
  metrics.legacyDecisions = 0;
  metrics.newDecisions = 0;
  metrics.cacheRefreshes = 0;
  metrics.fingerprintChanges = 0;
  metrics.authorizationFailures = 0;
  metrics.lookupLatency = { count: 0, totalMs: 0, maxMs: 0, avgMs: 0 };
}
