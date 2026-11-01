import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/withTimeout";
import { defaultActionsFor, MODULES } from "@/lib/rolePermissions";
import type { AppRole } from "@/hooks/useUserRole";
import { fetchCanonicalPermissions, type PermMap } from "@/lib/authz/canonicalPermissions";
import { isCanonicalAuthzEnabled } from "@/lib/authz/canonicalFlag";

/**
 * Per-user authorization store shared by every consumer.
 *
 * Route navigation must not re-enter the "Checking permissions…" gate. Each
 * PermissionRoute mount used to create its own usePermissions/useUserRole
 * state, so every new mount started at loading=true and re-ran the same
 * queries. This store makes the first resolution per user authoritative:
 * later mounts, route changes and silent fingerprint revalidations observe
 * the cached snapshot instead of blocking the page tree.
 *
 * Guarantees:
 *  - one in-flight request per (user, concern);
 *  - later mounts for a resolved user read the snapshot synchronously;
 *  - a silent revalidation keeps the last decision visible until it lands;
 *  - late responses only ever write the entry of the user that issued them
 *    (an old identity can never overwrite the current one);
 *  - resetAuthzStore() (sign-out) invalidates in-flight work by epoch.
 */

export type AuthzSnapshot = {
  roles: AppRole[];
  rolesResolved: boolean;
  linked: boolean | null;
  linkedResolved: boolean;
  perms: PermMap;
  permsResolved: boolean;
  permsKey: string | null;
};

type Runtime = {
  rolesPromise: Promise<void> | null;
  linkedPromise: Promise<void> | null;
  permsPromise: Promise<void> | null;
  permsKey: string | null;
  permsGeneration: number;
};

const EMPTY_SNAPSHOT: AuthzSnapshot = {
  roles: [],
  rolesResolved: false,
  linked: null,
  linkedResolved: false,
  perms: {},
  permsResolved: false,
  permsKey: null,
};

const snapshots = new Map<string, AuthzSnapshot>();
const runtimes = new Map<string, Runtime>();
const listeners = new Set<() => void>();
let storeEpoch = 0;

function snapshotFor(userId: string): AuthzSnapshot {
  return snapshots.get(userId) ?? EMPTY_SNAPSHOT;
}

function runtimeFor(userId: string): Runtime {
  let runtime = runtimes.get(userId);
  if (!runtime) {
    runtime = {
      rolesPromise: null,
      linkedPromise: null,
      permsPromise: null,
      permsKey: null,
      permsGeneration: 0,
    };
    runtimes.set(userId, runtime);
  }
  return runtime;
}

function emit() {
  for (const listener of Array.from(listeners)) listener();
}

function update(userId: string, epoch: number, patch: Partial<AuthzSnapshot>) {
  if (epoch !== storeEpoch) return;
  snapshots.set(userId, { ...snapshotFor(userId), ...patch });
  emit();
}

function queryWithTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T | null> {
  return withTimeout<T | null>(promise, { ms: 8000, fallback: null, label });
}

export function subscribeAuthzStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthzSnapshot(userId: string | null): AuthzSnapshot {
  return userId ? snapshotFor(userId) : EMPTY_SNAPSHOT;
}

export function useAuthzSnapshot(userId: string | null): AuthzSnapshot {
  return useSyncExternalStore(
    subscribeAuthzStore,
    () => getAuthzSnapshot(userId),
    () => getAuthzSnapshot(userId),
  );
}

export function ensureRoles(userId: string): Promise<void> {
  const runtime = runtimeFor(userId);
  if (snapshotFor(userId).rolesResolved) return Promise.resolve();
  if (runtime.rolesPromise) return runtime.rolesPromise;
  const epoch = storeEpoch;
  const chain = queryWithTimeout(
    supabase.from("user_roles").select("role").eq("user_id", userId),
    "user_roles.bootstrap",
  )
    .then((response) => {
      if (import.meta.env.DEV) {
        const error = response?.error ?? null;
        if (error) {
          console.warn("[auth-debug] user_roles fetch error", {
            message: error.message,
            code: error.code,
          });
        } else {
          console.info("[auth-debug] user_roles fetch completed", {
            rows: response?.data?.length ?? 0,
          });
        }
      }
      update(userId, epoch, {
        roles: (response?.data ?? []).map((row) => row.role as AppRole),
        rolesResolved: true,
      });
    })
    .catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[auth-debug] user_roles fetch threw", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      update(userId, epoch, { roles: [], rolesResolved: true });
    });
  runtime.rolesPromise = chain;
  const clear = () => {
    if (runtime.rolesPromise === chain) runtime.rolesPromise = null;
  };
  void chain.then(clear, clear);
  return chain;
}

export function ensureLinked(userId: string): Promise<void> {
  const runtime = runtimeFor(userId);
  if (snapshotFor(userId).linkedResolved) return Promise.resolve();
  if (runtime.linkedPromise) return runtime.linkedPromise;
  const epoch = storeEpoch;
  const chain = queryWithTimeout(
    supabase
      .from("staff_profiles_self")
      .select("status")
      .neq("status", "terminated")
      .limit(1)
      .maybeSingle(),
    "staff_profiles_self.bootstrap",
  )
    .then((response) => {
      update(userId, epoch, { linked: !!response?.data, linkedResolved: true });
    })
    .catch(() => {
      update(userId, epoch, { linked: false, linkedResolved: true });
    });
  runtime.linkedPromise = chain;
  const clear = () => {
    if (runtime.linkedPromise === chain) runtime.linkedPromise = null;
  };
  void chain.then(clear, clear);
  return chain;
}

export function authzPermissionsKey(
  roles: AppRole[],
  isAdmin: boolean,
  fingerprint: string | null,
  canonical: boolean,
): string {
  const roleKey = isAdmin ? "admin" : [...roles].sort().join(",");
  return `${canonical ? "canonical" : "legacy"}|${roleKey}|${fingerprint ?? ""}`;
}

export function ensurePermissions(
  userId: string,
  key: string,
  roles: AppRole[],
  isAdmin: boolean,
): Promise<void> {
  const runtime = runtimeFor(userId);
  const snapshot = snapshotFor(userId);
  if (snapshot.permsResolved && snapshot.permsKey === key) return Promise.resolve();
  if (runtime.permsPromise && runtime.permsKey === key) return runtime.permsPromise;

  const epoch = storeEpoch;
  const generation = ++runtime.permsGeneration;
  runtime.permsKey = key;

  if (isAdmin || roles.length === 0) {
    update(userId, epoch, { perms: {}, permsResolved: true, permsKey: key });
    runtime.permsPromise = null;
    return Promise.resolve();
  }

  const canonical = isCanonicalAuthzEnabled();
  const request = canonical ? fetchCanonicalPermissions(userId) : loadLegacyPermissions(roles);

  const chain = request
    .then((map) => {
      if (canonical && import.meta.env.DEV) {
        console.info("[auth-debug] canonical permissions loaded", {
          modules: Object.keys(map).length,
        });
      }
      if (runtime.permsGeneration !== generation) return;
      update(userId, epoch, { perms: map, permsResolved: true, permsKey: key });
    })
    .catch((error) => {
      if (canonical && import.meta.env.DEV) {
        const code = (error as { code?: unknown } | null)?.code;
        console.warn("[auth-debug] canonical permissions unavailable; access remains denied", {
          code: typeof code === "string" ? code : "unconfirmed_permissions",
        });
      }
      if (runtime.permsGeneration !== generation) return;
      // A failed first load denies; a failed silent revalidation keeps the
      // last decision on screen instead of blanking permissions.
      if (!snapshotFor(userId).permsResolved) {
        update(userId, epoch, { perms: {}, permsResolved: true, permsKey: key });
      }
    });
  runtime.permsPromise = chain;
  const clear = () => {
    if (runtime.permsPromise === chain) {
      runtime.permsPromise = null;
      runtime.permsKey = null;
    }
  };
  void chain.then(clear, clear);
  return chain;
}

async function loadLegacyPermissions(roles: AppRole[]): Promise<PermMap> {
  try {
    const response = await queryWithTimeout(
      supabase.from("role_permissions").select("role,module,actions").in("role", roles),
      "role_permissions.bootstrap",
    );
    const rows = response?.data ?? [];
    if (import.meta.env.DEV) {
      console.info("[auth-debug] role_permissions fetch completed", { rows: rows.length });
    }
    return buildLegacyPermissions(roles, rows);
  } catch (error) {
    // The legacy path always granted its catalog defaults when the catalog
    // itself could not be read; keep that fallback here rather than denying.
    if (import.meta.env.DEV) {
      console.warn("[auth-debug] role_permissions fetch threw; using defaults", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return buildLegacyPermissions(roles, []);
  }
}

function buildLegacyPermissions(
  roles: AppRole[],
  rows: { role: string; module: string; actions: string[] }[],
): PermMap {
  const map: PermMap = {};
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(`${row.role}:${row.module}`);
    const actions = map[row.module] ?? new Set<string>();
    for (const action of row.actions ?? []) actions.add(action);
    map[row.module] = actions;
  }
  roles.forEach((role) => {
    MODULES.forEach((module) => {
      if (seen.has(`${role}:${module}`)) return;
      const actions = defaultActionsFor(role, module);
      if (!actions.length) return;
      const set = map[module] ?? new Set<string>();
      actions.forEach((action) => set.add(action));
      map[module] = set;
    });
  });
  return map;
}

export function resetAuthzStore() {
  storeEpoch += 1;
  snapshots.clear();
  runtimes.clear();
  emit();
}
