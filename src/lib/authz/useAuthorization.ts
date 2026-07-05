import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { AuthorizationService } from "./AuthorizationService";

/**
 * React hook returning the canonical AuthorizationService for the current user.
 *
 * Wave 1 note: this hook is *available* but not required. Existing code that
 * uses `usePermissions()` / `<Can />` continues to work unchanged.
 */
export function useAuthorization() {
  const { can, isAdmin, loading } = usePermissions();
  const service = useMemo(
    () => new AuthorizationService({ legacyCan: can, isAdmin }),
    // `can` closes over perms; re-derive when identity changes.
    [can, isAdmin],
  );
  return { authz: service, loading, isAdmin };
}