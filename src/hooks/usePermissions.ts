import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthzState } from "@/lib/authz/useAuthzState";
import { isCanonicalAuthzEnabled } from "@/lib/authz/canonicalFlag";
import {
  authzPermissionsKey,
  ensureLinked,
  ensurePermissions,
  useAuthzSnapshot,
} from "@/lib/authz/sharedAuthzStore";

export function usePermissions() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { roles, isAdmin, loading: rolesLoading } = useUserRole();
  // R1: fingerprint-driven cache invalidation. When R1 is off the fingerprint
  // is null and the key below is stable, preserving legacy behavior.
  const { fingerprint } = useAuthzState();
  const snapshot = useAuthzSnapshot(userId);
  const rolesKey = roles.join(",");

  // Access gate: a user must be linked to an active staff_profile to have
  // module access. Admins bypass to prevent bootstrap lockout. The query reads
  // the column-restricted staff_profiles_self view (the base table's
  // self-select policy was dropped in H1-01-S to close a sensitive-column
  // exposure).
  useEffect(() => {
    if (userId) void ensureLinked(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || rolesLoading) return;
    const key = authzPermissionsKey(roles, isAdmin, fingerprint, isCanonicalAuthzEnabled());
    void ensurePermissions(userId, key, roles, isAdmin);
  }, [userId, rolesLoading, rolesKey, roles, isAdmin, fingerprint]);

  const can = (module: string, action: string = "view") => {
    if (isAdmin) return true;
    if (snapshot.linked === false) return false;
    return snapshot.perms[module]?.has(action) ?? false;
  };

  const loading =
    Boolean(userId) &&
    Boolean(
      rolesLoading ||
        (!isAdmin && !snapshot.linkedResolved) ||
        (!isAdmin && roles.length > 0 && !snapshot.permsResolved),
    );

  return { can, isAdmin, loading };
}
