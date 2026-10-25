import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { getAuthStorageSnapshot, hasPersistedAuthSession } from "@/lib/authSessionPersistence";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const location = useLocation();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hasStoredToken = hasPersistedAuthSession();
    console.info("[auth-debug] route guard decision", {
      path: location.pathname + location.search,
      loading,
      hasUser: Boolean(user),
      hasStoredToken,
      ...getAuthStorageSnapshot(),
      decision: loading ? "wait" : user ? "allow" : hasStoredToken ? "wait-for-canonical-session" : "redirect-to-auth",
    });
  }, [loading, location.pathname, location.search, user]);

  if (loading || (!user && hasPersistedAuthSession())) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center bg-background"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" aria-hidden="true" />
          <span className="text-sm">{lang === "ar" ? "جارٍ التحقق من الجلسة…" : "Checking your session…"}</span>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  return <>{children}</>;
}