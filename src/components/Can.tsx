import { ReactNode } from "react";
import { useAuthorization } from "@/lib/authz/useAuthorization";

type Props = {
  module: string;
  action?: string;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Conditionally render children based on the current user's role permissions.
 * Usage: <Can module="invoices" action="create"><Button>...</Button></Can>
 */
export function Can({ module, action = "view", children, fallback = null }: Props) {
  // Batch 2A: route all declarative permission gating through the canonical
  // AuthorizationService. Public API (module + action) is unchanged; the
  // service internally delegates to the legacy permission map so behavior
  // remains byte-identical to prior releases.
  const { authz, loading } = useAuthorization();
  if (loading) return null;
  return authz.can(`${module}.${action}`) ? <>{children}</> : <>{fallback}</>;
}