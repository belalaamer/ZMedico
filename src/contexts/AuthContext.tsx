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
    let hadSession = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
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
    withTimeout(supabase.auth.getSession(), {
      ms: 8000,
      fallback: { data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
      label: "auth.getSession",
    })
      .then(async ({ data: { session: s } }) => {
        setSession(s);
        setUser(s?.user ?? null);
        // Validate that the user behind this session still exists in Auth.
        if (s) {
          hadSession = true;
          try {
            const { data, error } = await supabase.auth.getUser();
            if (error || !data?.user) {
              await forceLocalLogout(true);
            }
          } catch {
            await forceLocalLogout(true);
          }
        }
      })
      .catch(() => {
        setSession(null);
        setUser(null);
      })
      .finally(() => setLoading(false));

    return () => subscription.unsubscribe();
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