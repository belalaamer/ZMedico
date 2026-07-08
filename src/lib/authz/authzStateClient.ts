/**
 * Runtime Wave R1 — Authorization State client.
 *
 * Wraps the BA-02 canonical resolver `authz_current_state()` behind a
 * typed fetch. Callers should NOT invoke supabase.rpc directly.
 *
 * The client is gated by the R1 feature flag: when disabled the
 * fetcher returns null and no network call is made. This keeps the
 * legacy path free of new network traffic when R1 is off.
 */

import { supabase } from "@/integrations/supabase/client";
import { isR1Enabled } from "./featureFlags";

export interface AuthzStateSnapshot {
  authorization_state_id: string;
  generated_at: string;
  fingerprint: string;
  completeness: boolean;
  integrity_status: "ok" | "warn" | "fail";
  compatibility_status: "compatible" | "issues_detected";
  compatibility_issues: Array<{ code: string; severity: string; message: string }>;
  active_versions: Record<string, { semver: string; checksum: string | null; activated_at: string }>;
  counts: Record<string, number>;
}

export async function fetchAuthzState(): Promise<AuthzStateSnapshot | null> {
  if (!isR1Enabled()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("authz_current_state");
  if (error) {
    console.warn("[authz-r1] authz_current_state fetch failed", { error: error?.message });
    return null;
  }
  return (data ?? null) as AuthzStateSnapshot | null;
}
