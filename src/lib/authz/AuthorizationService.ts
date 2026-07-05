/**
 * AuthorizationService — Wave 1 (Authorization Foundation).
 *
 * Public API mirrors the future architecture (permission-key based:
 *   `<group>.<resource>.<action>` in the catalog, and the legacy
 *   `<module>.<action>` today which is a subset of the catalog).
 *
 * INTERNALLY it delegates to the legacy per-module permission map
 * (`usePermissions().can`) so behavior is byte-identical to today.
 * No caller is expected to switch off `usePermissions()` yet — this
 * service exists so we can migrate call sites one by one in later waves.
 */

export type PermissionKey = string; // "<module>.<action>" e.g. "invoices.create"

export interface LegacyCan {
  (module: string, action?: string): boolean;
}

export interface AuthorizationServiceOptions {
  /** Legacy per-module check (from `usePermissions`). */
  legacyCan: LegacyCan;
  /** True when the current user is a global admin. Admin passes everything. */
  isAdmin?: boolean;
}

export function parsePermissionKey(key: PermissionKey): { module: string; action: string } {
  const idx = key.indexOf(".");
  if (idx < 0) return { module: key, action: "view" };
  return { module: key.slice(0, idx), action: key.slice(idx + 1) };
}

export class AuthorizationService {
  private readonly legacyCan: LegacyCan;
  private readonly isAdmin: boolean;

  constructor(opts: AuthorizationServiceOptions) {
    this.legacyCan = opts.legacyCan;
    this.isAdmin = Boolean(opts.isAdmin);
  }

  /** Returns true iff the current user holds `permission`. */
  can(permission: PermissionKey): boolean {
    if (this.isAdmin) return true;
    const { module, action } = parsePermissionKey(permission);
    return this.legacyCan(module, action);
  }

  /** Returns true iff the user holds at least one of the permissions. */
  canAny(...permissions: PermissionKey[]): boolean {
    if (this.isAdmin) return true;
    return permissions.some((p) => this.can(p));
  }

  /** Returns true iff the user holds every one of the permissions. */
  canAll(...permissions: PermissionKey[]): boolean {
    if (this.isAdmin) return true;
    if (permissions.length === 0) return true;
    return permissions.every((p) => this.can(p));
  }

  /**
   * Identity predicate — true iff the current user belongs to the admin
   * bundle (legacy `app_role = 'admin'`). Callers must prefer permission
   * keys (`can("x.view")`) whenever a permission exists; this getter is
   * only for the handful of admin-bundle-only surfaces (e.g. `/branches`)
   * that do not yet have a dedicated permission key in the catalog.
   *
   * Routing this through the service keeps the migration free of
   * hardcoded `roles.includes("admin")` / `role === "admin"` checks and
   * gives us a single point to swap for a real permission later.
   */
  isSuperAdmin(): boolean {
    return this.isAdmin;
  }
}

/**
 * Compatibility adapter — build the future-style service from today's
 * legacy hook return value. Keeps existing call sites untouched.
 */
export function createAuthorizationServiceFromLegacy(input: {
  can: LegacyCan;
  isAdmin: boolean;
}): AuthorizationService {
  return new AuthorizationService({ legacyCan: input.can, isAdmin: input.isAdmin });
}