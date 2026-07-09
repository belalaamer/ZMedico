import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Settings vertical slice — Shadow Probe.
 *
 * Fires once per SettingsLayout mount (per user session, deduplicated
 * in-memory). For each new Settings permission key it:
 *
 *   1. Computes the *legacy* decision that the frontend uses TODAY
 *      (`usePermissions.can("settings", <legacy_action>)`).
 *   2. Asks the *new* model via the `authz_has_permissions` RPC.
 *   3. Fire-and-forgets one `authz_record_shadow_decision` RPC per key
 *      with both decisions, plus a context payload for later slicing.
 *
 * The probe never returns a decision, never renders anything, never
 * throws into React. It cannot alter authorization outcomes under any
 * code path (see `settingsShadowProbe.noninfluence.test.ts`).
 */

const SLICE = "settings";
const REQUEST_SOURCE = "UI";
// App/build version — surfaced via Vite env at build time. Falls back to
// 'dev' when not set. Kept short; never contains PHI.
const APP_VERSION: string =
  ((import.meta as any)?.env?.VITE_APP_VERSION as string | undefined) ??
  ((import.meta as any)?.env?.VITE_COMMIT_SHA as string | undefined) ??
  "dev";

// New-model key → legacy (module, action) equivalence used to compute the
// pre-migration decision. Legacy defaults grant `settings` ops only to
// admin (edit/create/delete/export) or manager (view). See rolePermissions.ts.
export const SETTINGS_KEY_LEGACY_MAP: Readonly<
  Record<string, { module: string; action: string }>
> = Object.freeze({
  "settings.org.update":          { module: "settings", action: "edit" },
  "settings.branch.update":       { module: "settings", action: "edit" },
  "settings.pricing.update":      { module: "settings", action: "edit" },
  "settings.catalog.update":      { module: "settings", action: "edit" },
  "settings.integrations.manage": { module: "settings", action: "edit" },
});

export const SETTINGS_SHADOW_KEYS = Object.freeze(
  Object.keys(SETTINGS_KEY_LEGACY_MAP),
);

// Session-scoped dedup: same (user, path) fires at most once per SPA session.
const FIRED = new Set<string>();

export function useSettingsShadowProbe(pathHint?: string) {
  const { user } = useAuth();
  const { authz, loading: authzLoading } = useAuthorization("SettingsShadowProbe");
  const { can, loading: permsLoading } = usePermissions();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!user?.id) return;
    if (authzLoading || permsLoading) return;

    const dedupKey = `${user.id}::${pathHint ?? "settings"}`;
    if (FIRED.has(dedupKey)) return;
    FIRED.add(dedupKey);
    started.current = true;

    const run = async () => {
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      // 1) Ask the new model in one round-trip.
      let newDecisions: Record<string, boolean> = {};
      try {
        const { data, error } = await (supabase as any).rpc(
          "authz_has_permissions",
          { _keys: SETTINGS_SHADOW_KEYS as unknown as string[] },
        );
        if (error) throw error;
        for (const row of data ?? []) {
          newDecisions[row.permission_key] = !!row.allowed;
        }
      } catch (err) {
        // Shadow probe must never affect UX. Swallow and abort silently.
        console.debug("[shadow:settings] batch resolver failed", err);
        return;
      }

      // 2) Fire one recorder call per key. Fire-and-forget; no await chain.
      const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
      const context = {
        path: pathHint ?? null,
        client_ms: Math.max(0, t1 - t0),
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      };

      for (const key of SETTINGS_SHADOW_KEYS) {
        const legacyMap = SETTINGS_KEY_LEGACY_MAP[key];
        const legacy = can(legacyMap.module, legacyMap.action);
        const nu = newDecisions[key] ?? false;
        (supabase as any)
          .rpc("authz_record_shadow_decision", {
            _slice: SLICE,
            _permission_key: key,
            _decision_legacy: legacy,
            _decision_new: nu,
            _app_version: APP_VERSION,
            _request_source: REQUEST_SOURCE,
            _context: context,
          })
          .then(() => {})
          .catch((err: unknown) => {
            console.debug("[shadow:settings] record failed", { key, err });
          });
      }

      // 3) One admin-visible telemetry line — no PHI, no user id.
      console.info("[shadow:settings] probe fired", {
        keys: SETTINGS_SHADOW_KEYS.length,
        latency_ms: Math.round(t1 - t0),
      });

      // Read `authz` so the linter doesn't strip it; unused otherwise.
      void authz;
    };

    // Detach from the render tick.
    Promise.resolve().then(run);
  }, [user?.id, authzLoading, permsLoading, can, authz, pathHint]);
}

/** Test-only: clear the session dedup set. */
export function __resetSettingsShadowProbeForTests() {
  FIRED.clear();
}
