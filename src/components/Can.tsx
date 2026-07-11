import { ReactNode } from "react";
import { useAuthorization } from "@/lib/authz/useAuthorization";

type LegacyProps = {
  module: string;
  action?: string;
  permission?: never;
  children: ReactNode;
  fallback?: ReactNode;
};

type CanonicalProps = {
  /** Canonical permission key (e.g. "patients.create"). Preferred form for
   *  completed vertical slices — the invariant test forbids the legacy
   *  `module=` form inside owned paths, so this is what migrated call
   *  sites use. Behavior is byte-identical: internally the service still
   *  delegates to the legacy grant map. */
  permission: string;
  module?: never;
  action?: never;
  children: ReactNode;
  fallback?: ReactNode;
};

type Props = LegacyProps | CanonicalProps;

/**
 * Conditionally render children based on the current user's authorization.
 *
 * Canonical form (used by completed vertical slices):
 *   <Can permission="patients.create"><Button>...</Button></Can>
 *
 * Legacy form (still supported for slices that have not yet cut over):
 *   <Can module="invoices" action="create"><Button>...</Button></Can>
 */
export function Can(props: Props) {
  const { children, fallback = null } = props;
  // Batch 2A: route all declarative permission gating through the canonical
  // AuthorizationService. Public API (module + action) is unchanged; the
  // service internally delegates to the legacy permission map so behavior
  // remains byte-identical to prior releases.
  const { authz, loading } = useAuthorization();
  if (loading) return null;
  const key =
    "permission" in props && props.permission
      ? props.permission
      : `${(props as LegacyProps).module}.${(props as LegacyProps).action ?? "view"}`;
  return authz.can(key) ? <>{children}</> : <>{fallback}</>;
}