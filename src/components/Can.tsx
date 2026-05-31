import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

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
  const { can, loading } = usePermissions();
  if (loading) return null;
  return can(module, action) ? <>{children}</> : <>{fallback}</>;
}