/**
 * Runtime Wave R1 — Authorization State consumer hook.
 *
 * Contract:
 *   - Fetches authz_current_state() on mount when the R1 flag is on.
 *   - Polls the resolver on a low-frequency interval (default 30s) to
 *     detect fingerprint changes. This is the ONLY timer in R1.
 *   - The permission cache is NOT invalidated on the interval — it is
 *     invalidated only when the observed fingerprint differs from the
 *     cached fingerprint. See useAuthzFingerprintEffect below.
 *   - When the flag is off, the hook returns a stable null-state and
 *     never issues a network call.
 *
 * The hook returns:
 *   { state, fingerprint, generatedAt, stateId, refresh }
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchAuthzState, type AuthzStateSnapshot } from "./authzStateClient";
import { isR1Enabled } from "./featureFlags";
import { recordCacheRefresh, recordFingerprintChange } from "./telemetry";

const POLL_MS_DEFAULT = 30_000;

interface CachedState {
  state: AuthzStateSnapshot | null;
  fingerprint: string | null;
  generatedAt: string | null;
  stateId: string | null;
}

const EMPTY: CachedState = {
  state: null,
  fingerprint: null,
  generatedAt: null,
  stateId: null,
};

export function useAuthzState(pollMs: number = POLL_MS_DEFAULT) {
  const [cache, setCache] = useState<CachedState>(EMPTY);
  const enabled = isR1Enabled();
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const applySnapshot = useCallback((snap: AuthzStateSnapshot | null) => {
    if (!snap) return;
    const prev = cacheRef.current.fingerprint;
    recordCacheRefresh();
    if (prev !== null && prev !== snap.fingerprint) {
      recordFingerprintChange();
    }
    if (prev === snap.fingerprint) return; // no change; skip re-render
    setCache({
      state: snap,
      fingerprint: snap.fingerprint,
      generatedAt: snap.generated_at,
      stateId: snap.authorization_state_id,
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const snap = await fetchAuthzState();
    applySnapshot(snap);
  }, [enabled, applySnapshot]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const snap = await fetchAuthzState();
      if (!cancelled) applySnapshot(snap);
    })();
    const id = window.setInterval(() => { void refresh(); }, pollMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [enabled, pollMs, applySnapshot, refresh]);

  return { ...cache, refresh, enabled };
}
