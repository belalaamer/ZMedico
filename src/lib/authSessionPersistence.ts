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
  return canonical ? [canonical] : [];
}

function readStoredSession(storageName: "localStorage" | "sessionStorage", key: string) {
  try {
    return safeParseSession(window[storageName].getItem(key));
  } catch {
    return null;
  }
}

export function readPersistedAuthSession() {
  if (typeof window === "undefined") return null;
  const canonical = getCanonicalAuthStorageKey();
  if (!canonical) return null;
  return readStoredSession("localStorage", canonical) ?? readStoredSession("sessionStorage", canonical);
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
  const canonicalSession = canonicalStorageKey ? readStoredSession("localStorage", canonicalStorageKey) : null;
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
    try {
      if (window.localStorage.getItem(key) !== serialized) {
        window.localStorage.setItem(key, serialized);
      }
    } catch {
      /* Browser storage is optional; the SDK session remains authoritative. */
    }
    try {
      window.sessionStorage.setItem(key, serialized);
    } catch {
      /* sessionStorage may be blocked */
    }
  });

  if (import.meta.env.DEV) {
    console.info(AUTH_DEBUG_PREFIX, "auth session persistence attempted", {
      source,
      hasPersistedSession: hasPersistedAuthSession(),
    });
  }
}

export function clearPersistedAuthSessions() {
  if (typeof window === "undefined") return;
  listAuthStorageKeys().forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* Still attempt the independent sessionStorage cleanup below. */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });
}
