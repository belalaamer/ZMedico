import type { Session } from "@supabase/supabase-js";

const AUTH_STORAGE_SUFFIX = "-auth-token";

function getBackendRef() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

export function getCanonicalAuthStorageKey() {
  const ref = getBackendRef();
  return ref ? `sb-${ref}${AUTH_STORAGE_SUFFIX}` : null;
}

export function listAuthStorageKeys() {
  if (typeof window === "undefined") return [];
  const canonical = getCanonicalAuthStorageKey();
  const keys = new Set<string>();
  if (canonical) keys.add(canonical);
  Object.keys(window.localStorage).forEach((key) => {
    if (key.startsWith("sb-") && key.endsWith(AUTH_STORAGE_SUFFIX)) keys.add(key);
  });
  return Array.from(keys);
}

export function hasPersistedAuthSession() {
  if (typeof window === "undefined") return false;
  return listAuthStorageKeys().some((key) => Boolean(window.localStorage.getItem(key)));
}

export function persistAuthSessionForPreview(session: Session | null, source: string) {
  if (typeof window === "undefined" || !session) return;

  const serialized = JSON.stringify(session);
  const keys = listAuthStorageKeys();
  keys.forEach((key) => {
    if (window.localStorage.getItem(key) !== serialized) {
      window.localStorage.setItem(key, serialized);
    }
  });

  console.info("[auth-debug] auth session persisted for preview", {
    path: window.location.pathname + window.location.search,
    origin: window.location.origin,
    source,
    canonicalStorageKey: getCanonicalAuthStorageKey(),
    storageKeys: keys,
    hasSession: true,
    userIdPrefix: session.user?.id ? session.user.id.slice(0, 8) : null,
  });
}

export function clearPersistedAuthSessions() {
  if (typeof window === "undefined") return;
  listAuthStorageKeys().forEach((key) => window.localStorage.removeItem(key));
}