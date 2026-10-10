import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Shared factory for authorization Shadow Probes.
 *
 * Every vertical slice (settings/patients/medical_records/hr/invoices)
 * previously duplicated the same ~110-line probe. This factory extracts
 * the common logic; per-slice files now just declare their slice name
 * and key→legacy map. Authorization remains independent of the probes;
 * failures are diagnosed without exposing raw error details:
 *   - Fires once per (user, path) in-memory
 *   - Reads new-model decisions from `authz_has_permissions`
 *   - Fire-and-forgets `authz_record_shadow_decision` per key
 *   - Never influences authorization outcomes
 */

const APP_VERSION: string =
  ((import.meta as any)?.env?.VITE_APP_VERSION as string | undefined) ??
  ((import.meta as any)?.env?.VITE_COMMIT_SHA as string | undefined) ??
  "dev";

export type LegacyMap = Readonly<Record<string, { module: string; action: string }>>;

export interface ShadowProbeConfig {
  slice: string;
  keyLegacyMap: LegacyMap;
  requestSource?: string;
  probeName: string;
}

export interface ShadowProbe {
  useProbe: (pathHint?: string) => void;
  resetForTests: () => void;
  keys: readonly string[];
}

function diagnosticCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    && typeof err.code === "string" && /^[A-Z0-9_]{1,32}$/.test(err.code)
    ? err.code : "TRANSPORT_ERROR";
}

export function createShadowProbe(config: ShadowProbeConfig): ShadowProbe {
  const { slice, keyLegacyMap, probeName } = config;
  const requestSource = config.requestSource ?? "UI";
  const keys = Object.freeze(Object.keys(keyLegacyMap));
  const FIRED = new Set<string>();
  const logTag = `[shadow:${slice}]`;

  function useProbe(pathHint?: string) {
    const { user } = useAuth();
    const { authz, loading: authzLoading } = useAuthorization(probeName);
    const { can, loading: permsLoading } = usePermissions();
    const started = useRef(false);

    useEffect(() => {
      if (started.current) return;
      if (!user?.id) return;
      if (authzLoading || permsLoading) return;

      const dedupKey = `${user.id}::${pathHint ?? slice}`;
      if (FIRED.has(dedupKey)) return;
      FIRED.add(dedupKey);
      started.current = true;

      const run = async () => {
        const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const newDecisions: Record<string, boolean> = {};
        try {
          const { data, error } = await (supabase as any).rpc(
            "authz_has_permissions",
            { _keys: keys as unknown as string[] },
          );
          if (error) throw error;
          for (const row of data ?? []) {
            newDecisions[row.permission_key] = !!row.allowed;
          }
        } catch (err) {
          console.debug(`${logTag} batch resolver failed`, { code: diagnosticCode(err) });
          return;
        }

        const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const context = {
          path: pathHint ?? null,
          client_ms: Math.max(0, t1 - t0),
          ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
        };

        for (const key of keys) {
          const legacyMap = keyLegacyMap[key];
          const legacy = can(legacyMap.module, legacyMap.action);
          const nu = newDecisions[key] ?? false;
          Promise.resolve().then(() => (supabase as any)
            .rpc("authz_record_shadow_decision", {
              _slice: slice,
              _permission_key: key,
              _decision_legacy: legacy,
              _decision_new: nu,
              _app_version: APP_VERSION,
              _request_source: requestSource,
              _context: context,
            }))
            .then(({ error }) => {
              if (error) throw error;
            })
            .catch((err: unknown) => {
              console.debug(`${logTag} record failed`, { key, code: diagnosticCode(err) });
            });
        }

        console.info(`${logTag} probe fired`, {
          keys: keys.length,
          latency_ms: Math.round(t1 - t0),
        });

        void authz;
      };

      Promise.resolve().then(run);
    }, [user?.id, authzLoading, permsLoading, can, authz, pathHint]);
  }

  return {
    useProbe,
    resetForTests: () => FIRED.clear(),
    keys,
  };
}
