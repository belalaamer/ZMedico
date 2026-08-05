/**
 * Canonical Authorization runtime flag.
 *
 * Single switch that flips `usePermissions()` between:
 *   - legacy path — reads `role_permissions` + `DEFAULT_PERMISSIONS` fallback.
 *   - canonical path — reads `v_authz_effective_permissions`
 *     (bundles → permissions), which is the V8 authorization stack.
 *
 * SOURCE OF TRUTH IN PRODUCTION: the build-time `VITE_AUTHZ_CANONICAL` variable,
 * and nothing else.
 *
 * The localStorage override used to apply in every environment. That let any
 * signed-in user open devtools and switch the whole permission-resolution engine
 * for their own session. Row-level security still decided what data they could
 * actually read, so this was never a route to someone else's records — but the
 * two engines are not guaranteed to agree, and whichever one grants MORE decides
 * what the interface offers. A user could switch to the more generous engine and
 * be shown controls the other engine would have hidden. A client-controlled
 * security switch is the wrong shape regardless of how much damage it currently
 * enables, so in a production build the override is ignored entirely.
 *
 * It is still honoured in a development build, where it is genuinely useful for
 * comparing the two engines side by side.
 *
 * Rollback in production = rebuild with VITE_AUTHZ_CANONICAL="false" and
 * redeploy. That is deliberate: an authorization change should leave a trace in
 * the deployment history rather than being flipped invisibly per browser.
 */

const LS_KEY = "authz_canonical";

function isDevBuild(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (import.meta as any)?.env?.DEV === true;
  } catch {
    return false;
  }
}

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
  const fromEnv = readEnv() === "true";

  // Production: the build decides. The browser gets no say.
  if (!isDevBuild()) return fromEnv;

  // Development: allow a per-tab override for comparing the two engines.
  const ls = readLocalStorage();
  if (ls === "true") return true;
  if (ls === "false") return false;
  return fromEnv;
}

/** Development helper for comparing the two engines. No effect in a production build. */
export function setCanonicalAuthzOverride(value: boolean | null): void {
  try {
    if (typeof window === "undefined") return;
    if (!isDevBuild()) return;
    if (value === null) window.localStorage.removeItem(LS_KEY);
    else window.localStorage.setItem(LS_KEY, value ? "true" : "false");
  } catch {
    /* noop */
  }
}
