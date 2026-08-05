/**
 * PHI read-access auditing.
 *
 * Calls the Postgres RPC log_phi_access to record every time a clinician
 * opens a screen that contains protected health information.
 *
 * Safety contract:
 *   - Never throws, never rejects (all paths wrapped in try/catch).
 *   - Never surfaces a toast — a logging failure must not interrupt a clinician.
 *   - Fire-and-forget: the returned Promise is intentionally not awaited by
 *     callers so it never delays rendering.
 *   - Skips silently when no authenticated session exists.
 */

import { supabase } from "@/integrations/supabase/client";
import { reportClientError } from "./reportError";

type PhiEntityType =
  | "patient"
  | "medical_record"
  | "physio_case"
  | "prescription"
  | "document"
  | "dental_chart"
  | "treatment_plan"
  | "vitals"
  | "patient_list"
  | "invoice";

type PhiAction = "view" | "search" | "export" | "print";

interface PhiAccessOpts {
  patientId?: string | null;
  action?: PhiAction;
  context?: string;
}

// ── Public API ───────────────────────────────────────────────────────────────
export function logPhiAccess(
  entityType: PhiEntityType,
  entityId: string | null | undefined,
  opts?: PhiAccessOpts
): void {
  // Fire-and-forget — intentionally not awaited.
  void _log(entityType, entityId, opts);
}

async function _log(
  entityType: PhiEntityType,
  entityId: string | null | undefined,
  opts?: PhiAccessOpts
): Promise<void> {
  try {
    // Skip if no authenticated user (RLS rejects anonymous).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    await supabase.rpc("log_phi_access", {
      p_entity_type: entityType,
      p_entity_id: entityId ?? null,
      p_patient_id: opts?.patientId ?? null,
      p_action: opts?.action ?? "view",
      p_context: opts?.context ?? window.location.pathname,
    });
  } catch (err) {
    // Route to reportError so we at least know the RPC is broken, but never
    // propagate — telemetry must never surface to the user.
    try {
      reportClientError({
        kind: "error",
        message: `logPhiAccess failed: ${String(err)}`,
        component: "phiAudit",
      });
    } catch {
      // Swallow everything.
    }
  }
}
