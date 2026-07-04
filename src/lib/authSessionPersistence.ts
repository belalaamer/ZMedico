import type { Session } from "@supabase/supabase-js";

const AUTH_STORAGE_SUFFIX = "-auth-token";
const AUTH_DEBUG_PREFIX = "[auth-debug]";

function getBackendRef() {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  if (projectId) return projectId;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function safeParseSession(value: string | null): Session | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Session> | null;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.access_token === "string" &&
      typeof parsed.refresh_token === "string" &&
      typeof parsed.expires_at === "number"
    ) {
      return parsed as Session;
    }
  } catch {
    /* ignore malformed storage */
  }
  return null;
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

export function readPersistedAuthSession() {
  if (typeof window === "undefined") return null;
  const canonical = getCanonicalAuthStorageKey();
  const canonicalSession = canonical ? safeParseSession(window.localStorage.getItem(canonical)) : null;
  if (canonicalSession) return canonicalSession;

  for (const key of listAuthStorageKeys()) {
    const session = safeParseSession(window.localStorage.getItem(key));
    if (session) return session;
  }
  return null;
}

export function hasPersistedAuthSession() {
  if (typeof window === "undefined") return false;
  return Boolean(readPersistedAuthSession());
}

export function getAuthStorageSnapshot() {
  if (typeof window === "undefined") {
    return {
      origin: null,
      canonicalStorageKey: getCanonicalAuthStorageKey(),
      hasCanonicalSession: false,
      storageKeys: [] as string[],
      hasAnyPersistedSession: false,
      userIdPrefix: null as string | null,
    };
  }

  const canonicalStorageKey = getCanonicalAuthStorageKey();
  const canonicalSession = canonicalStorageKey ? safeParseSession(window.localStorage.getItem(canonicalStorageKey)) : null;
  const session = canonicalSession ?? readPersistedAuthSession();

  return {
    origin: window.location.origin,
    canonicalStorageKey,
    hasCanonicalSession: Boolean(canonicalSession),
    storageKeys: listAuthStorageKeys(),
    hasAnyPersistedSession: Boolean(session),
    userIdPrefix: session?.user?.id ? session.user.id.slice(0, 8) : null,
  };
}

export function persistAuthSessionForPreview(session: Session | null, source: string) {
  if (typeof window === "undefined" || !session) return;

  const serialized = JSON.stringify(session);
  const keys = listAuthStorageKeys();
  keys.forEach((key) => {
    if (window.localStorage.getItem(key) !== serialized) {
      window.localStorage.setItem(key, serialized);
    }
    try {
      window.sessionStorage.setItem(key, serialized);
    } catch {
      /* sessionStorage may be blocked */
    }
  });

  const snapshot = getAuthStorageSnapshot();
  console.info(AUTH_DEBUG_PREFIX, "auth session persisted for preview", {
    path: window.location.pathname + window.location.search,
    source,
    ...snapshot,
  });
}

export function clearPersistedAuthSessions() {
  if (typeof window === "undefined") return;
  listAuthStorageKeys().forEach((key) => {
    window.localStorage.removeItem(key);
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });
}