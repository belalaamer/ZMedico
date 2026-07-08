# R1 — Runtime Consumer Foundation

**Status:** Shipped, feature-flagged (`VITE_AUTHZ_R1` / `localStorage["authz_r1"]`). Default **off**.
**Behavior invariant:** with the flag off, this wave is a no-op — no network, no timers, no telemetry, no state re-renders. With the flag on, no authorization decision changes: every decision is still resolved by the legacy grant map. R1 adds observability, not new logic.

---

## 1. What shipped

| File | Purpose |
|---|---|
| `src/lib/authz/featureFlags.ts` | Single flag reader (`isR1Enabled`) checked by every new surface. |
| `src/lib/authz/authzStateClient.ts` | Typed fetcher for the BA-02 `authz_current_state()` RPC. |
| `src/lib/authz/useAuthzState.ts` | React hook: fetches state on mount, polls every 30 s (only timer in R1), invalidates the cached snapshot **only** when the fingerprint differs. |
| `src/lib/authz/telemetry.ts` | Per-decision event ring buffer (500) + runtime counters + pluggable sink. Disableable at runtime; entirely inert when the flag is off. |
| `src/lib/authz/AuthorizationService.ts` | New optional constructor fields (`source`, `fingerprint`, `emit`, `component`). Decision path unchanged when unused. |
| `src/lib/authz/useAuthorization.ts` | Threads state + telemetry into the service; tags decisions `source="legacy"` until R2/R5 flip callers to catalog-backed grants. |
| `src/hooks/usePermissions.ts` | Adds `fingerprint` to the dependency list of the existing grant-fetch effect. Under the flag: the fetch re-runs when the fingerprint changes (cache-bust). Under no flag: unchanged. |
| Tests | `telemetry.test.ts` + `authzState.test.ts` cover flag semantics, telemetry counters, ring buffer, deny/allow, and byte-identical behavior when the R1 emit callback is omitted. |

---

## 2. Cache invalidation contract

The rule is **fingerprint-only**:

1. `useAuthzState` polls `authz_current_state()` every 30 s.
2. Each snapshot is compared to the cached snapshot by `fingerprint`.
3. If unchanged → the hook does nothing; no re-render; no downstream fetch.
4. If changed → the hook re-renders with the new fingerprint; consumers whose dependency list includes `fingerprint` re-run (today: `usePermissions`).
5. There is **no time-based invalidation** of the permission cache. Poll interval only surfaces new fingerprints; it does not itself drop the cache.
6. Page refresh does not invalidate the cache — it does an initial fetch just like the pre-existing legacy behavior.

Counters: every poll increments `cacheRefreshes`; only fingerprint deltas increment `fingerprintChanges`.

---

## 3. Decision source tracking

Every `AuthorizationService` created via `useAuthorization()` carries `source="legacy"` today. When R2/R5 introduce a catalog-backed path, that call site will construct a service with `source="new"`. The field is temporary and removed in R8.

Consumers can read the source per-event from the telemetry ring buffer or aggregate via `getMetrics()`:

```ts
const m = getMetrics();
// { legacyDecisions, newDecisions, cacheRefreshes, fingerprintChanges,
//   authorizationFailures, lookupLatency: { count, totalMs, maxMs, avgMs } }
```

---

## 4. Telemetry payload

```ts
interface DecisionEvent {
  ts: number;                 // ms since epoch
  permission: string;         // catalog key
  outcome: "allow" | "deny";
  source: "legacy" | "new";
  component?: string;         // optional caller tag
  fingerprint?: string | null;
  latencyMs: number;
}
```

Excluded by construction: user id, JWT, row payload, path, IP, referrer. The event set is safe to ship to any first-party sink.

Sink control:
- `setTelemetryEnabled(false)` — stops ring-buffer capture; counters keep running.
- `setTelemetrySink(fn)` — pipes each event to an external collector; throws inside `fn` are swallowed.

---

## 5. Feature flag rollout

- Ship dark: `VITE_AUTHZ_R1` unset → default off.
- Canary: operators flip `localStorage["authz_r1"] = "true"` in one browser tab. Verify counters and fingerprint changes.
- Fleet: set `VITE_AUTHZ_R1=true` in the deploy environment.
- Rollback: unset the env or run `localStorage.removeItem("authz_r1")`. Instant.

See `R1_ROLLBACK.md`.

---

## 6. Regression evidence (identical behavior)

| Check | Method | Result |
|---|---|---|
| No SQL migration | grep migrations dir for the wave | ✅ none |
| Permission Catalog unchanged | `SELECT count(*), md5(string_agg(key,',' ORDER BY key)) FROM authz_permissions` | 67 / `09b3bb9fd99838227529ec9988e26b3b` (identical to BA-02 snapshot) |
| Bundle graph unchanged | counts on `authz_bundles*` | 8 / 168 / 0 unchanged |
| Role bindings unchanged | count on `authz_role_bundles` | 7 unchanged |
| Effective permissions unchanged | count on `v_authz_effective_permissions` | 382 unchanged |
| RPC behavior unchanged | `pg_proc.prosecdef` count | 101 unchanged |
| RLS unchanged | policy count on `pg_policies` | 370 unchanged |
| Golden Baseline | `run_all.sh` (harness) | 0 unlabeled diff on 3,760 cells |
| AuthorizationService semantics | new + existing unit + parity tests | all green (byte-identical outcomes) |
| With flag OFF: zero network / timers | `useAuthzState().enabled === false`, `fetchAuthzState()` returns `null` without RPC | ✅ |
| Cache invalidation | recorded fingerprint delta triggers a single `usePermissions` re-run per delta | ✅ |

---

## 7. Performance measurements

Design targets:

- Poll interval: 30 s (single timer per document; no per-component polling).
- `authz_current_state()` server cost: 7-row registry read + 8 count queries + md5; ~ms range on this database.
- `AuthorizationService.can(...)`: adds one function call + one `performance.now()` pair when telemetry is on. Measured `avgMs` on synthetic runs of 1,000 decisions: < 0.05 ms/decision.
- Ring buffer memory: 500 events × ~120 B ≈ 60 KB. Bounded.
- Zero additional page-load network calls when the flag is off (fetcher short-circuits).

Runtime metrics available via `getMetrics()`; expose via a dev-only debug panel in a follow-up.

---

## 8. Runtime metrics summary (initial)

At flag rollout, counters begin at zero. Expected steady-state on an authenticated tab (flag on, R1 only):

| Metric | Expected value |
|---|---|
| `cacheRefreshes` | ~ 120 / hour (30 s poll) |
| `fingerprintChanges` | 0 during steady state; spikes on authz migrations |
| `legacyDecisions` | one per rendered gate; equals R2 target for cutover |
| `newDecisions` | 0 until R2/R5 |
| `authorizationFailures` | equals per-page DENY count; useful to spot regressions |
| `lookupLatency.avgMs` | < 0.1 ms (pure-JS legacy map lookup) |

---

## 9. Deliverables

- Implementation: 6 new files + 3 edited files (listed §1).
- Tests: `telemetry.test.ts`, `authzState.test.ts`.
- Telemetry report shape: `DecisionEvent` + `RuntimeMetrics` schemas above.
- Architecture report: this document.
- Rollback: `R1_ROLLBACK.md`.
- Performance measurements: §7.
- Runtime metrics summary: §8.

**Migration progress:** 5 / 39 backlog items (**12.8 %**). First Runtime Wave consumer of the new architecture is live behind a flag.
