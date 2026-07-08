/**
 * Runtime Wave R1 — Feature flag reader.
 *
 * The entire R1 surface (state consumer, cache-bust, telemetry,
 * metrics, source tracking) sits behind ONE boolean. Instant rollback
 * = flip the flag to false; nothing in R1 runs and the legacy path is
 * used everywhere.
 *
 * Sources checked, in order:
 *   1. localStorage["authz_r1"]  ("true" / "false") — per-tab override
 *   2. VITE_AUTHZ_R1 env         ("true" / "false") — build-time
 *   3. default: false
 *
 * NB: reading the flag is O(1) and safe on the server / in tests
 * (falls back cleanly when window/import.meta are unavailable).
 */

const LS_KEY = "authz_r1";

function readLocalStorage(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function readEnv(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any)?.env;
    return env?.VITE_AUTHZ_R1;
  } catch {
    return undefined;
  }
}

export function isR1Enabled(): boolean {
  const ls = readLocalStorage();
  if (ls === "true") return true;
  if (ls === "false") return false;
  const env = readEnv();
  return env === "true";
}

/** Test / debug helper. Not called by production code. */
export function setR1Override(value: boolean | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(LS_KEY);
    else window.localStorage.setItem(LS_KEY, value ? "true" : "false");
  } catch {
    /* noop */
  }
}
