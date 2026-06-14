// Shared helper for appointment status transitions.
// Centralizes queue-timestamp semantics so Calendar and Queue stay consistent.
//
// Rules:
//  - confirmed     → stamps checked_in_at (preserves existing value)
//  - in_progress   → stamps started_at AND checked_in_at (preserves existing)
//  - scheduled     → CLEARS checked_in_at and started_at (reopen / rewind)
//  - cancelled / no_show → CLEARS started_at; preserves checked_in_at
//                          (patient physically arrived; keep that fact)
//  - completed / departed → no timestamp changes
//
// Note: `priority` is currently treated as binary (0 = normal, >0 = urgent).
// The numeric column is kept so future tiers can be added without a schema change.

export type ApptStatus =
  | "scheduled" | "confirmed" | "in_progress"
  | "completed" | "cancelled" | "no_show" | "departed";

export type StatusStampInput = {
  checked_in_at?: string | null;
  started_at?: string | null;
};

export function buildStatusPatch(
  next: ApptStatus,
  current: StatusStampInput,
  now: string = new Date().toISOString()
): Record<string, any> {
  const patch: Record<string, any> = { status: next };
  switch (next) {
    case "confirmed":
      patch.checked_in_at = current.checked_in_at ?? now;
      break;
    case "in_progress":
      patch.checked_in_at = current.checked_in_at ?? now;
      patch.started_at    = current.started_at    ?? now;
      break;
    case "scheduled":
      // Reopening / rewinding clears stale queue timing.
      patch.checked_in_at = null;
      patch.started_at = null;
      break;
    case "cancelled":
    case "no_show":
      // Drop the in-session timer; keep arrival fact if any.
      patch.started_at = null;
      break;
    case "completed":
    case "departed":
    default:
      // no timestamp changes
      break;
  }
  return patch;
}