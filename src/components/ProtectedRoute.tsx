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
      decision: loading ? "wait" : user ? "allow" : "redirect-to-auth",
    });
  }, [loading, location.pathname, location.search, user]);

  // AuthProvider hydrates a valid persisted session into `user` before
  // completing its bootstrap. Once loading is false, a storage token without
  // a user is stale/malformed state and must not keep a protected route on an
  // infinite spinner.
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="size-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  return <>{children}</>;
}
