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
  /**
   * Compatibility only — the raw list of legacy role names for the current
   * user (from `useUserRole`). Consumed by the transitional `hasRole` /
   * `hasRoleAny` adapters below so no component has to touch role strings
   * directly. Will be removed once every gate has a permission-key.
   */
  roles?: readonly string[];
  /**
   * R1 additions (opt-in; all no-ops when omitted).
   *   - source: whether this instance is delegating to legacy or new grants.
   *   - fingerprint: current authz state fingerprint for telemetry.
   *   - emit: telemetry sink invoked once per decision.
   *   - component: caller tag included in telemetry events.
   */
  source?: "legacy" | "new";
  fingerprint?: string | null;
  emit?: (evt: {
    ts: number;
    permission: string;
    outcome: "allow" | "deny";
    source: "legacy" | "new";
    fingerprint?: string | null;
    component?: string;
    latencyMs: number;
  }) => void;
  component?: string;
}

export function parsePermissionKey(key: PermissionKey): { module: string; action: string } {
  const idx = key.indexOf(".");
  if (idx < 0) return { module: key, action: "view" };
  return { module: key.slice(0, idx), action: key.slice(idx + 1) };
}

export class AuthorizationService {
  private readonly legacyCan: LegacyCan;
  private readonly isAdmin: boolean;
  private readonly roles: readonly string[];
  private readonly source: "legacy" | "new";
  private readonly fingerprint: string | null;
  private readonly emit?: AuthorizationServiceOptions["emit"];
  private readonly component?: string;

  constructor(opts: AuthorizationServiceOptions) {
    this.legacyCan = opts.legacyCan;
    this.isAdmin = Boolean(opts.isAdmin);
    this.roles = opts.roles ?? [];
    this.source = opts.source ?? "legacy";
    this.fingerprint = opts.fingerprint ?? null;
    this.emit = opts.emit;
    this.component = opts.component;
  }

  /** Returns true iff the current user holds `permission`. */
  can(permission: PermissionKey): boolean {
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    let outcome: "allow" | "deny";
    if (this.isAdmin) {
      outcome = "allow";
    } else {
      const { module, action } = parsePermissionKey(permission);
      outcome = this.legacyCan(module, action) ? "allow" : "deny";
    }
    if (this.emit) {
      const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        this.emit({
          ts: Date.now(),
          permission,
          outcome,
          source: this.source,
          fingerprint: this.fingerprint,
          component: this.component,
          latencyMs: Math.max(0, ended - started),
        });
      } catch { /* telemetry must never affect the decision */ }
    }
    return outcome === "allow";
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

  /**
   * Transitional role-identity adapters — routed through the service so
   * that no page/component/hook has to grep for role strings. Admin
   * always satisfies (matches historical `isAdmin || roles.includes(x)`
   * semantics used across the codebase). Prefer a permission key
   * (`can("x.y")`) whenever one exists in the catalog. These will be
   * removed by R8 (Legacy Removal).
   */
  hasRole(role: string): boolean {
    if (this.isAdmin) return true;
    return this.roles.includes(role);
  }

  hasRoleAny(...roles: string[]): boolean {
    if (this.isAdmin) return true;
    if (roles.length === 0) return false;
    return roles.some((r) => this.roles.includes(r));
  }

  /**
   * Strict role membership — does NOT admin-override. Use only where
   * the historical behavior explicitly excluded admins (e.g. doctor-only
   * report scoping). Transitional; also removed by R8.
   */
  holdsAnyRole(...roles: string[]): boolean {
    if (roles.length === 0) return false;
    return roles.some((r) => this.roles.includes(r));
  }
}

/**
 * Compatibility adapter — build the future-style service from today's
 * legacy hook return value. Keeps existing call sites untouched.
 */
export function createAuthorizationServiceFromLegacy(input: {
  can: LegacyCan;
  isAdmin: boolean;
  roles?: readonly string[];
}): AuthorizationService {
  return new AuthorizationService({ legacyCan: input.can, isAdmin: input.isAdmin, roles: input.roles });
}