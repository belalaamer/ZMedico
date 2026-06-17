/**
 * Branch operational alerts (Phase 13).
 *
 * Lightweight persistence around the existing dashboard/queue alert
 * conditions (long wait, busy queue, high no-show rate). Conditions are
 * still computed client-side from appointments; this module just remembers
 * each occurrence so staff can review history and snooze/acknowledge
 * without losing the context.
 *
 * Lifecycle:
 *   - `active`      → condition is currently true, no user action taken
 *   - `snoozed`     → user muted it until `snoozed_until`
 *   - `acknowledged`→ user marked it seen, but condition still true
 *   - `resolved`    → condition is no longer true (auto-set by sync)
 */
import { supabase } from "@/integrations/supabase/client";

export type AlertType = "long_wait" | "no_show_rate" | "busy_queue";
export type AlertState = "active" | "snoozed" | "acknowledged" | "resolved";

export type QueueAlert = {
  id: string;
  branch_id: string;
  alert_type: AlertType;
  state: AlertState;
  detail: Record<string, any>;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  snoozed_until: string | null;
  snoozed_by: string | null;
  resolved_at: string | null;
};

export type AlertCondition = {
  type: AlertType;
  active: boolean;
  detail?: Record<string, any>;
};

/** Effective display state, considering snooze expiry. */
export function effectiveState(a: QueueAlert, now = Date.now()): AlertState {
  if (a.resolved_at) return "resolved";
  if (a.snoozed_until && new Date(a.snoozed_until).getTime() > now) return "snoozed";
  if (a.acknowledged_at) return "acknowledged";
  return "active";
}

export async function listRecentAlerts(branchId: string, limit = 25): Promise<QueueAlert[]> {
  const { data, error } = await (supabase as any)
    .from("queue_alerts")
    .select("*")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as QueueAlert[];
}

export async function listOpenAlerts(branchId: string): Promise<QueueAlert[]> {
  const { data, error } = await (supabase as any)
    .from("queue_alerts")
    .select("*")
    .eq("branch_id", branchId)
    .is("resolved_at", null);
  if (error) return [];
  return (data ?? []) as QueueAlert[];
}

/**
 * Reconcile branch alerts against the current set of conditions.
 * - Opens a new row for any active condition without one.
 * - Auto-resolves any open row whose condition has cleared.
 * - Refreshes detail for ongoing rows.
 * Returns the open (non-resolved) alerts after sync.
 */
export async function syncBranchAlerts(branchId: string, conditions: AlertCondition[]): Promise<QueueAlert[]> {
  if (!branchId) return [];
  const open = await listOpenAlerts(branchId);
  const byType = new Map<AlertType, QueueAlert>();
  open.forEach((a) => byType.set(a.alert_type, a));

  const inserts: any[] = [];
  const updates: Array<{ id: string; patch: any }> = [];
  const resolutions: string[] = [];

  for (const c of conditions) {
    const existing = byType.get(c.type);
    if (c.active) {
      if (!existing) {
        inserts.push({ branch_id: branchId, alert_type: c.type, state: "active", detail: c.detail ?? {} });
      } else if (JSON.stringify(existing.detail ?? {}) !== JSON.stringify(c.detail ?? {})) {
        updates.push({ id: existing.id, patch: { detail: c.detail ?? {} } });
      }
    } else if (existing) {
      resolutions.push(existing.id);
    }
  }
  // Any open type not mentioned in conditions is left as-is.

  await Promise.all([
    inserts.length
      ? (supabase as any).from("queue_alerts").insert(inserts)
      : Promise.resolve(),
    ...updates.map((u) => (supabase as any).from("queue_alerts").update(u.patch).eq("id", u.id)),
    resolutions.length
      ? (supabase as any).from("queue_alerts").update({ state: "resolved", resolved_at: new Date().toISOString() }).in("id", resolutions)
      : Promise.resolve(),
  ]);

  return listOpenAlerts(branchId);
}

export async function snoozeAlert(id: string, untilIso: string, userId: string | null) {
  const { error } = await (supabase as any)
    .from("queue_alerts")
    .update({ state: "snoozed", snoozed_until: untilIso, snoozed_by: userId })
    .eq("id", id);
  return { ok: !error, error: error?.message };
}

export async function acknowledgeAlert(id: string, userId: string | null) {
  const { error } = await (supabase as any)
    .from("queue_alerts")
    .update({ state: "acknowledged", acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
    .eq("id", id);
  return { ok: !error, error: error?.message };
}

export async function unsnoozeAlert(id: string) {
  const { error } = await (supabase as any)
    .from("queue_alerts")
    .update({ state: "active", snoozed_until: null, snoozed_by: null })
    .eq("id", id);
  return { ok: !error, error: error?.message };
}

export async function resolveAlertNow(id: string) {
  const { error } = await (supabase as any)
    .from("queue_alerts")
    .update({ state: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);
  return { ok: !error, error: error?.message };
}

/** Common snooze presets. */
export function snoozePresets(now = new Date()): Array<{ key: string; labelEn: string; labelAr: string; iso: string }> {
  const eod = new Date(now); eod.setHours(23, 59, 59, 999);
  const plus = (mins: number) => new Date(now.getTime() + mins * 60_000).toISOString();
  return [
    { key: "1h", labelEn: "1 hour", labelAr: "ساعة", iso: plus(60) },
    { key: "4h", labelEn: "4 hours", labelAr: "4 ساعات", iso: plus(240) },
    { key: "eod", labelEn: "End of day", labelAr: "نهاية اليوم", iso: eod.toISOString() },
  ];
}
