import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthStorageSnapshot, hasPersistedAuthSession } from "@/lib/authSessionPersistence";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
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
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="size-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  return <>{children}</>;
}