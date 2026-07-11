import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Invoices / Finance vertical slice — Shadow Probe.
 *
 * Mirrors settings/patients/medical_records/hr probes: fires once per
 * user/path in-memory, records legacy vs new decisions for every
 * canonical `invoices.*` key via `authz_record_shadow_decision`.
 * Telemetry-only — cannot alter authorization outcomes.
 */

const SLICE = "invoices";
const REQUEST_SOURCE = "UI";
const APP_VERSION: string =
  ((import.meta as any)?.env?.VITE_APP_VERSION as string | undefined) ??
  ((import.meta as any)?.env?.VITE_COMMIT_SHA as string | undefined) ??
  "dev";

export const INVOICES_KEY_LEGACY_MAP: Readonly<
  Record<string, { module: string; action: string }>
> = Object.freeze({
  "invoices.view":   { module: "invoices", action: "view" },
  "invoices.create": { module: "invoices", action: "create" },
  "invoices.edit":   { module: "invoices", action: "edit" },
  "invoices.delete": { module: "invoices", action: "delete" },
  "invoices.export": { module: "invoices", action: "export" },
});

export const INVOICES_SHADOW_KEYS = Object.freeze(
  Object.keys(INVOICES_KEY_LEGACY_MAP),
);

const FIRED = new Set<string>();

export function useInvoicesShadowProbe(pathHint?: string) {
  const { user } = useAuth();
  const { authz, loading: authzLoading } = useAuthorization("InvoicesShadowProbe");
  const { can, loading: permsLoading } = usePermissions();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!user?.id) return;
    if (authzLoading || permsLoading) return;

    const dedupKey = `${user.id}::${pathHint ?? "invoices"}`;
    if (FIRED.has(dedupKey)) return;
    FIRED.add(dedupKey);
    started.current = true;

    const run = async () => {
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      let newDecisions: Record<string, boolean> = {};
      try {
        const { data, error } = await (supabase as any).rpc(
          "authz_has_permissions",
          { _keys: INVOICES_SHADOW_KEYS as unknown as string[] },
        );
        if (error) throw error;
        for (const row of data ?? []) {
          newDecisions[row.permission_key] = !!row.allowed;
        }
      } catch (err) {
        console.debug("[shadow:invoices] batch resolver failed", err);
        return;
      }

      const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
      const context = {
        path: pathHint ?? null,
        client_ms: Math.max(0, t1 - t0),
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      };

      for (const key of INVOICES_SHADOW_KEYS) {
        const legacyMap = INVOICES_KEY_LEGACY_MAP[key];
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
            console.debug("[shadow:invoices] record failed", { key, err });
          });
      }

      console.info("[shadow:invoices] probe fired", {
        keys: INVOICES_SHADOW_KEYS.length,
        latency_ms: Math.round(t1 - t0),
      });

      void authz;
    };

    Promise.resolve().then(run);
  }, [user?.id, authzLoading, permsLoading, can, authz, pathHint]);
}

/** Test-only: clear the session dedup set. */
export function __resetInvoicesShadowProbeForTests() {
  FIRED.clear();
}