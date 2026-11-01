import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ensureRoles, useAuthzSnapshot } from "@/lib/authz/sharedAuthzStore";

export type AppRole = "system_owner" | "admin" | "manager" | "doctor" | "receptionist" | "hr" | "accountant" | "staff" | string;

// Reads the shared per-user authorization store instead of owning a private
// query. A second mount for the same user must not re-enter the loading gate.
export function useUserRole() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const snapshot = useAuthzSnapshot(userId);

  useEffect(() => {
    if (userId) void ensureRoles(userId);
  }, [userId]);

  const roles = snapshot.roles;
  const isSystemOwner = roles.includes("system_owner");
  // System owners have god-mode and implicitly satisfy every admin gate.
  const isAdmin = isSystemOwner || roles.includes("admin");
  return { roles, isAdmin, isSystemOwner, loading: Boolean(userId) && !snapshot.rolesResolved };
}
