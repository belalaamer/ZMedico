import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { withTimeout } from "@/lib/withTimeout";
import { markSignOutReason, takeSignOutReason, type SignOutReason } from "@/lib/authSignOutReason";
import { toast } from "@/hooks/use-toast";
import {
  clearPersistedAuthSessions,
  getAuthStorageSnapshot,
  hasArrivingAuthRedirect,
  hasPersistedAuthSession,
  persistAuthSessionForPreview,
  readPersistedAuthSession,
} from "@/lib/authSessionPersistence";

type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: (notify?: boolean) => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

const AUTH_DEBUG_PREFIX = "[auth-debug]";

// S17: the query string can BE the credential (?code=… from the PKCE handoff, ?token=…
// from a portal invite), and these lines fire on every sign-in and on every session
// failure. Log the route and only whether a query existed.
function authDebugFields() {
  if (typeof window === "undefined") return { path: "", hasQuery: false };
  return { path: window.location.pathname, hasQuery: window.location.search.length > 0 };
}

function authDebug(message: string, details?: Record<string, unknown>) {
  console.info(AUTH_DEBUG_PREFIX, message, {
    ...authDebugFields(),
    ...details,
  });
}

function describeSession(s: Session | null) {
  return {
    hasSession: Boolean(s),
    hasUser: Boolean(s?.user),
    userIdPrefix: s?.user?.id ? s.user.id.slice(0, 8) : null,
    expiresAt: s?.expires_at ?? null,
    hasStoredToken:
      typeof window !== "undefined"
        ? hasPersistedAuthSession()
        : false,
  };
}

function isDeletedUserError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? "");
  return /user.*not.*found|user.*deleted|sub claim/i.test(message);
}

// TOKEN_REFRESHED and repeated SIGNED_IN events carry a new Session object for
// the same person. Replacing the User object on each of those churns every
// consumer derived from useAuth(); keep the previous identity when the id is
// unchanged so background revalidation cannot cascade into a re-gate.
function applyAuthState(
  setSession: Dispatch<SetStateAction<Session | null>>,
  setUser: Dispatch<SetStateAction<User | null>>,
  next: Session | null,
) {
  setSession((prev) => {
    if (prev === next) return prev;
    if (prev && next && prev.access_token === next.access_token && prev.refresh_token === next.refresh_token) return prev;
    return next;
  });
  setUser((prev) => {
    const user = next?.user ?? null;
    if (prev === user) return prev;
    if (prev && user && prev.id === user.id) return prev;
    return user;
  });
}

// Auto-logout after this many ms of user inactivity (no mouse/keyboard/touch).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Clear any app-level cached state tied to the signed-in user.
function clearLocalAppState() {
  try {
    localStorage.removeItem("zmedico.branch");
  } catch {
    /* ignore */
  }
  // Independent best-effort cleanup: a blocked branch preference must not
  // prevent clearing the matching sessionStorage fallback after signout.
  clearPersistedAuthSessions();
}

// S2: one sentence covered two different causes, and the two endings users actually
// complained about (idle timeout, a session ending on its own) produced no message at
// all. Each notice now names the reason and what to do next.
type SessionNotice = "deleted" | "idle" | "lost";

const SESSION_NOTICES: Record<SessionNotice, { ar: string; en: string }> = {
  deleted: {
    ar: "انتهت صلاحية الجلسة أو لم يعد الحساب متاحًا. برجاء تسجيل الدخول مرة أخرى.",
    en: "Your session is no longer valid. Please sign in again.",
  },
  idle: {
    ar: "تم تسجيل خروجك بعد فترة من عدم النشاط. برجاء تسجيل الدخول مرة أخرى.",
    en: "You were signed out after a period of inactivity. Please sign in again.",
  },
  lost: {
    ar: "انتهت الجلسة. برجاء تسجيل الدخول مرة أخرى.",
    en: "Your session ended. Please sign in again.",
  },
};

function notifySessionEnded(notice: SessionNotice) {
  const lang = (typeof window !== "undefined" && localStorage.getItem("zmedico.lang")) || "ar";
  const copy = SESSION_NOTICES[notice];
  try {
    toast({ title: lang === "ar" ? copy.ar : copy.en });
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(() => readPersistedAuthSession());
  const [user, setUser] = useState<User | null>(() => readPersistedAuthSession()?.user ?? null);
  const [loading, setLoading] = useState(() => !readPersistedAuthSession());

  const forceLocalLogout = async (notify: boolean) => {
    // This path owns its own notice, and the provider call below fires SIGNED_OUT in
    // this tab. Recording the reason is what keeps that event from adding a second.
    markSignOutReason("account-closed");
    try { await supabase.auth.signOut(); } catch { /* deleted-user JWT may fail */ }
    clearLocalAppState();
    setSession(null);
    setUser(null);
    setLoading(false);
    if (notify) notifySessionEnded("deleted");
  };

  useEffect(() => {
    let active = true;
    const isArrivingAuthRedirect = hasArrivingAuthRedirect();
    let hadSession = Boolean(readPersistedAuthSession());
    const bootstrappedSession = readPersistedAuthSession();
    if (bootstrappedSession && isArrivingAuthRedirect) {
      // A redirect that carries its own session must win: replaying the previously stored one
      // here races the callback and leaves the browser signed in as the old identity.
      authDebug("canonical storage bootstrap skipped for arriving auth redirect", getAuthStorageSnapshot());
    }
    if (bootstrappedSession && !isArrivingAuthRedirect) {
      authDebug("auth state bootstrapped from canonical storage", getAuthStorageSnapshot());
      void supabase.auth.setSession({
        access_token: bootstrappedSession.access_token,
        refresh_token: bootstrappedSession.refresh_token,
      }).then(({ data, error }) => {
        authDebug("auth.setSession from canonical storage completed", {
          ...describeSession(data.session),
          error: error?.message ?? null,
        });
        persistAuthSessionForPreview(data.session, "canonical-storage-bootstrap");
      });
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      authDebug("auth state change", { event, ...describeSession(s) });

      if (event === "INITIAL_SESSION") {
        persistAuthSessionForPreview(s, "initial-session-event");
        applyAuthState(setSession, setUser, s);
        if (s) hadSession = true;
        setLoading(false);
        return;
      }

      if (event === "SIGNED_OUT" || (event as string) === "USER_DELETED") {
        clearLocalAppState();
        setSession(null);
        setUser(null);
        setLoading(false);
        const reason = takeSignOutReason();
        if ((event as string) === "USER_DELETED") {
          notifySessionEnded("deleted");
        } else if (reason === "idle") {
          notifySessionEnded("idle");
        } else if (!reason && hadSession) {
          // S2: a refresh token rejected mid-day, or a second tab signing out, landed
          // the desk on /auth with no message at all. `hadSession` is what makes this
          // an ending rather than an anonymous first load.
          notifySessionEnded("lost");
        }
        hadSession = false;
        return;
      }
      persistAuthSessionForPreview(s, `auth-event:${event}`);
      applyAuthState(setSession, setUser, s);
      setLoading(false);
      if (s) hadSession = true;
    });

    authDebug("auth state initialization started", getAuthStorageSnapshot());
    withTimeout(supabase.auth.getSession(), {
      ms: 8000,
      fallback: { data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
      label: "auth.getSession",
    })
      .then(async ({ data: { session: s }, error }) => {
        if (!active) return;
        if (isArrivingAuthRedirect) {
          authDebug("getSession bootstrap skipped for arriving auth redirect", describeSession(s));
          return;
        }
        authDebug("auth.getSession completed", { ...describeSession(s), ...getAuthStorageSnapshot(), error: error?.message ?? null });
        persistAuthSessionForPreview(s, "get-session-bootstrap");
        applyAuthState(setSession, setUser, s);
        // Validate that the user behind this session still exists in Auth.
        if (s) {
          hadSession = true;
          try {
            const { data, error } = await supabase.auth.getUser();
            authDebug("auth.getUser validation completed", {
              hasUser: Boolean(data?.user),
              error: error?.message ?? null,
            });
            if (error || !data?.user) {
              if (isDeletedUserError(error)) {
                await forceLocalLogout(true);
              } else {
                console.warn(AUTH_DEBUG_PREFIX, "auth.getUser validation failed; keeping stored session for auth retry", {
                  ...authDebugFields(),
                  error: error?.message ?? "missing user",
                });
              }
            }
          } catch {
            console.warn(AUTH_DEBUG_PREFIX, "auth.getUser validation threw; keeping stored session for auth retry", {
              ...authDebugFields(),
            });
          }
        }
      })
      .catch(() => {
        if (!active) return;
        authDebug("auth.getSession failed", { hasSession: false });
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        authDebug("auth state initialization finished");
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async (notify = true, reason: SignOutReason = "user") => {
    markSignOutReason(reason);
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore — deleted-user JWT can reject signOut */
    }
    clearLocalAppState();
    setSession(null);
    setUser(null);
    if (notify) toast({ title: t("signedOut") });
  };

  // Idle auto-logout: signs the user out after IDLE_TIMEOUT_MS without activity.
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      // S2: `notify` was false, so the desk vanished mid-session with no explanation
      // of any kind. The reason now reaches the SIGNED_OUT handler, which owns the copy.
      timer = setTimeout(() => { void signOut(false, "idle"); }, IDLE_TIMEOUT_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true } as AddEventListenerOptions));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [user]);

  return <AuthContext.Provider value={{ user, session, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
