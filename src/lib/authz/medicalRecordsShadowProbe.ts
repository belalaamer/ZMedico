import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Medical Records vertical slice — Shadow Probe.
 *
 * Mirrors `settingsShadowProbe` / `patientsShadowProbe`: fires once per
 * user/path in-memory, records legacy vs new decisions for every
 * canonical medical_records key via `authz_record_shadow_decision`.
 * Telemetry-only — cannot alter authorization outcomes.
 */

const SLICE = "medical_records";
const REQUEST_SOURCE = "UI";
const APP_VERSION: string =
  ((import.meta as any)?.env?.VITE_APP_VERSION as string | undefined) ??
  ((import.meta as any)?.env?.VITE_COMMIT_SHA as string | undefined) ??
  "dev";

// New-model key → legacy (module, action). Medical Records keys align
// 1:1 with legacy `medical_records` module actions; no intentional
// expansions are expected.
export const MEDICAL_RECORDS_KEY_LEGACY_MAP: Readonly<
  Record<string, { module: string; action: string }>
> = Object.freeze({
  "medical_records.view":   { module: "medical_records", action: "view" },
  "medical_records.create": { module: "medical_records", action: "create" },
  "medical_records.edit":   { module: "medical_records", action: "edit" },
  "medical_records.delete": { module: "medical_records", action: "delete" },
  "medical_records.export": { module: "medical_records", action: "export" },
});

export const MEDICAL_RECORDS_SHADOW_KEYS = Object.freeze(
  Object.keys(MEDICAL_RECORDS_KEY_LEGACY_MAP),
);

const FIRED = new Set<string>();

export function useMedicalRecordsShadowProbe(pathHint?: string) {
  const { user } = useAuth();
  const { authz, loading: authzLoading } = useAuthorization("MedicalRecordsShadowProbe");
  const { can, loading: permsLoading } = usePermissions();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!user?.id) return;
    if (authzLoading || permsLoading) return;

    const dedupKey = `${user.id}::${pathHint ?? "medical_records"}`;
    if (FIRED.has(dedupKey)) return;
    FIRED.add(dedupKey);
    started.current = true;

    const run = async () => {
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      let newDecisions: Record<string, boolean> = {};
      try {
        const { data, error } = await (supabase as any).rpc(
          "authz_has_permissions",
          { _keys: MEDICAL_RECORDS_SHADOW_KEYS as unknown as string[] },
        );
        if (error) throw error;
        for (const row of data ?? []) {
          newDecisions[row.permission_key] = !!row.allowed;
        }
      } catch (err) {
        console.debug("[shadow:medical_records] batch resolver failed", err);
        return;
      }

      const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
      const context = {
        path: pathHint ?? null,
        client_ms: Math.max(0, t1 - t0),
        ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
      };

      for (const key of MEDICAL_RECORDS_SHADOW_KEYS) {
        const legacyMap = MEDICAL_RECORDS_KEY_LEGACY_MAP[key];
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
            console.debug("[shadow:medical_records] record failed", { key, err });
          });
      }

      console.info("[shadow:medical_records] probe fired", {
        keys: MEDICAL_RECORDS_SHADOW_KEYS.length,
        latency_ms: Math.round(t1 - t0),
      });

      void authz;
    };

    Promise.resolve().then(run);
  }, [user?.id, authzLoading, permsLoading, can, authz, pathHint]);
}

/** Test-only: clear the session dedup set. */
export function __resetMedicalRecordsShadowProbeForTests() {
  FIRED.clear();
}