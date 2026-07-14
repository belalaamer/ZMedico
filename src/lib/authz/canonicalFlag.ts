/**
 * Phase B — Canonical Authorization runtime flag.
 *
 * Single switch that flips `usePermissions()` between:
 *   - false (default): legacy path — reads `role_permissions` +
 *     `DEFAULT_PERMISSIONS` fallback. Byte-identical to Sprint 5.
 *   - true: canonical path — reads `v_authz_effective_permissions`
 *     (bundles → permissions), which is the V8 authorization stack.
 *
 * Sources checked, in order:
 *   1. localStorage["authz_canonical"]  ("true" | "false") — per-tab
 *   2. VITE_AUTHZ_CANONICAL env         ("true" | "false") — build-time
 *   3. default: false
 *
 * Rollback = flip the flag to `false`. No code change required.
 */

const LS_KEY = "authz_canonical";

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
    return env?.VITE_AUTHZ_CANONICAL;
  } catch {
    return undefined;
  }
}

export function isCanonicalAuthzEnabled(): boolean {
  const ls = readLocalStorage();
  if (ls === "true") return true;
  if (ls === "false") return false;
  const env = readEnv();
  return env === "true";
}

/** Test / debug helper. Not called by production code. */
export function setCanonicalAuthzOverride(value: boolean | null): void {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(LS_KEY);
    else window.localStorage.setItem(LS_KEY, value ? "true" : "false");
  } catch {
    /* noop */
  }
}
