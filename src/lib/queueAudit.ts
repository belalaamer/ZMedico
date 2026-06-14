import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight, fire-and-forget audit logger for queue / appointment actions.
 *
 * Reuses the existing `public.audit_logs` table (entity_type, entity_id,
 * action, old_values, new_values, user_id, branch_id). We never store full
 * patient PHI in the diff — only the operationally relevant fields
 * (status, doctor_id, room, priority, is_walk_in) so the log stays minimal
 * and safe for future review.
 */
export type QueueAuditAction =
  | "status_change"
  | "doctor_reassigned"
  | "room_assigned"
  | "walk_in_created"
  | "consultation_opened";

const SAFE_KEYS = ["status", "doctor_id", "room", "priority", "is_walk_in", "checked_in_at", "started_at"] as const;

function pickSafe(obj?: Record<string, any> | null) {
  if (!obj) return null;
  const out: Record<string, any> = {};
  for (const k of SAFE_KEYS) if (k in obj) out[k] = (obj as any)[k];
  return Object.keys(out).length ? out : null;
}

export async function logQueueAudit(params: {
  action: QueueAuditAction;
  appointmentId: string;
  branchId?: string | null;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      entity_type: "appointment",
      entity_id: params.appointmentId,
      action: params.action,
      user_id: auth?.user?.id ?? null,
      branch_id: params.branchId ?? null,
      old_values: pickSafe(params.oldValues),
      new_values: pickSafe(params.newValues),
    } as any);
  } catch {
    // Audit must never block the user-facing action.
  }
}