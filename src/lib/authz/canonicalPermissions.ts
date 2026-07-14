/**
 * Phase B — Canonical permission reader.
 *
 * Loads the effective permission set for a user from
 * `v_authz_effective_permissions` (bundles → permissions → user via
 * roles) and reduces it into the same `Record<module, Set<action>>`
 * shape produced by the legacy `role_permissions` reader in
 * `usePermissions`.
 *
 * Permission keys in the view use the same `<module>.<action>`
 * grammar as the legacy grant map, so the reducer is a direct
 * `split(".", 1)`. Multi-dot keys (e.g. `settings.pricing.update`)
 * keep the everything after the first dot as the action name, matching
 * how the legacy `<Can permission="settings.pricing.update" />` gate
 * already round-trips through the service today.
 */

import { supabase } from "@/integrations/supabase/client";

export type PermMap = Record<string, Set<string>>;

export function reduceCanonicalRows(
  rows: ReadonlyArray<{ permission_key: string }>,
): PermMap {
  const map: PermMap = {};
  for (const r of rows) {
    const key = r?.permission_key;
    if (!key || typeof key !== "string") continue;
    const idx = key.indexOf(".");
    const mod = idx < 0 ? key : key.slice(0, idx);
    const action = idx < 0 ? "view" : key.slice(idx + 1);
    const s = map[mod] ?? new Set<string>();
    s.add(action);
    map[mod] = s;
  }
  return map;
}

export async function fetchCanonicalPermissions(
  userId: string,
): Promise<PermMap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("v_authz_effective_permissions")
    .select("permission_key")
    .eq("user_id", userId);
  if (error) throw error;
  return reduceCanonicalRows(data ?? []);
}
