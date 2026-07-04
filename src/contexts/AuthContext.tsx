import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
import { toast } from "@/hooks/use-toast";

type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

const AUTH_DEBUG_PREFIX = "[auth-debug]";

function authDebug(message: string, details?: Record<string, unknown>) {
  console.info(AUTH_DEBUG_PREFIX, message, {
    path: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
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
        ? Object.keys(window.localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
        : false,
  };
}

function isDeletedUserError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? "");
  return /user.*not.*found|user.*deleted|sub claim/i.test(message);
}

// Auto-logout after this many ms of user inactivity (no mouse/keyboard/touch).
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Clear any app-level cached state tied to the signed-in user.
function clearLocalAppState() {
  try {
    localStorage.removeItem("zmedico.branch");
    // Best-effort: drop any cached supabase auth tokens if signOut failed.
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        localStorage.removeItem(k);
      }
    });
  } catch {
    /* ignore */
  }
}

function notifySessionInvalid() {
  const lang = (typeof window !== "undefined" && localStorage.getItem("zmedico.lang")) || "ar";
  const msg =
    lang === "ar"
      ? "انتهت صلاحية الجلسة أو لم يعد الحساب متاحًا. برجاء تسجيل الدخول مرة أخرى."
      : "Your session is no longer valid. Please sign in again.";
  try {
    toast({ title: msg });
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const forceLocalLogout = async (notify: boolean) => {
    try { await supabase.auth.signOut(); } catch { /* deleted-user JWT may fail */ }
    clearLocalAppState();
    setSession(null);
    setUser(null);
    setLoading(false);
    if (notify) notifySessionInvalid();
  };

  useEffect(() => {
    let active = true;
    let hadSession = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      authDebug("auth state change", { event, ...describeSession(s) });

      if (event === "INITIAL_SESSION") {
        setSession(s);
        setUser(s?.user ?? null);
        if (s) hadSession = true;
        return;
      }

      if (event === "SIGNED_OUT" || (event as string) === "USER_DELETED") {
        clearLocalAppState();
        setSession(null);
        setUser(null);
        setLoading(false);
        if ((event as string) === "USER_DELETED" || hadSession) notifySessionInvalid();
        hadSession = false;
        return;
      }
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s) hadSession = true;
    });

    authDebug("auth state initialization started");
    withTimeout(supabase.auth.getSession(), {
      ms: 8000,
      fallback: { data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
      label: "auth.getSession",
    })
      .then(async ({ data: { session: s }, error }) => {
        if (!active) return;
        authDebug("auth.getSession completed", { ...describeSession(s), error: error?.message ?? null });
        setSession(s);
        setUser(s?.user ?? null);
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
                  path: window.location.pathname + window.location.search,
                  error: error?.message ?? "missing user",
                });
              }
            }
          } catch {
            console.warn(AUTH_DEBUG_PREFIX, "auth.getUser validation threw; keeping stored session for auth retry", {
              path: window.location.pathname + window.location.search,
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

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore — deleted-user JWT can reject signOut */
    }
    clearLocalAppState();
    setSession(null);
    setUser(null);
  };

  // Idle auto-logout: signs the user out after IDLE_TIMEOUT_MS without activity.
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void signOut(); }, IDLE_TIMEOUT_MS);
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