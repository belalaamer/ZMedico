import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { AuthorizationService } from "./AuthorizationService";
import { useAuthzState } from "@/lib/authz/useAuthzState";
import { recordDecision } from "@/lib/authz/telemetry";
import { isR1Enabled } from "@/lib/authz/featureFlags";

/**
 * React hook returning the canonical AuthorizationService for the current user.
 *
 * Wave 1 note: this hook is *available* but not required. Existing code that
 * uses `usePermissions()` / `<Can />` continues to work unchanged.
 *
 * Runtime Wave R1 additions (all opt-in via the R1 feature flag):
 *   - Subscribes to the Authorization State fingerprint so the service
 *     carries it into every decision emitted for telemetry.
 *   - Tags the service with `source="legacy"` — until R2/R5 land, every
 *     decision is still resolved by the legacy grant map.
 *   - Emits per-decision telemetry via recordDecision().
 * When R1 is off, none of the above runs; behavior is byte-identical
 * to pre-R1.
 */
export function useAuthorization(component?: string) {
  const { can, isAdmin, loading } = usePermissions();
  // R2: inject the raw role list so the service can answer transitional
  // `hasRole` / `hasRoleAny` questions without any component touching a
  // role string directly. Behavior remains byte-identical to
  // `isAdmin || roles.includes(...)`.
  const { roles } = useUserRole();
  const { fingerprint, enabled: r1 } = useAuthzState();
  const service = useMemo(
    () =>
      new AuthorizationService({
        legacyCan: can,
        isAdmin,
        roles,
        source: "legacy",
        fingerprint: r1 ? fingerprint : null,
        emit: r1 && isR1Enabled() ? recordDecision : undefined,
        component,
      }),
    // `can` closes over perms; re-derive when identity or fingerprint changes.
    [can, isAdmin, roles, r1, fingerprint, component],
  );
  return { authz: service, loading };
}