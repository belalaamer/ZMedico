/**
 * Queue policy settings.
 *
 * Phase 6: backed by the `public.queue_settings` table (one row per branch),
 * with localStorage kept ONLY as an instant-render cache so first paint is
 * not blocked on a network round-trip. Writes go to the server first; on
 * success we mirror to the local cache, on failure we still cache locally
 * so the user keeps a working UI.
 */
import { supabase } from "@/integrations/supabase/client";

export type QueueSettings = {
  longWaitMinutes: number;          // banner / tint threshold
  defaultMyQueue: boolean;          // auto-select "My queue" for clinicians on load
  showNoShowsInDefault: boolean;    // include no_show rows in the default "active" view
  // Phase 12: branch-configurable alert thresholds + display toggles
  noShowRateThreshold: number;      // percent (0-100); alert when today's no-show% >= this
  busyQueueThreshold: number;       // waiting count (1-200); alert when waiting >= this
  alertsOnDashboard: boolean;       // show alert banner on Branch Dashboard
  alertsOnQueue: boolean;           // show alert banner on Queue page
};

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  longWaitMinutes: 30,
  defaultMyQueue: true,
  showNoShowsInDefault: false,
  noShowRateThreshold: 25,
  busyQueueThreshold: 8,
  alertsOnDashboard: true,
  alertsOnQueue: true,
};

const keyFor = (branchId: string | null | undefined) =>
  `zmedico.queueSettings.${branchId ?? "global"}`;

function normalize(parsed: any): QueueSettings {
  return {
    longWaitMinutes: Number.isFinite(parsed?.longWaitMinutes) && parsed.longWaitMinutes > 0
      ? Math.min(240, Math.max(5, Math.floor(parsed.longWaitMinutes)))
      : DEFAULT_QUEUE_SETTINGS.longWaitMinutes,
    defaultMyQueue: typeof parsed?.defaultMyQueue === "boolean" ? parsed.defaultMyQueue : DEFAULT_QUEUE_SETTINGS.defaultMyQueue,
    showNoShowsInDefault: typeof parsed?.showNoShowsInDefault === "boolean" ? parsed.showNoShowsInDefault : DEFAULT_QUEUE_SETTINGS.showNoShowsInDefault,
    noShowRateThreshold: Number.isFinite(parsed?.noShowRateThreshold)
      ? Math.min(100, Math.max(0, Math.floor(parsed.noShowRateThreshold)))
      : DEFAULT_QUEUE_SETTINGS.noShowRateThreshold,
    busyQueueThreshold: Number.isFinite(parsed?.busyQueueThreshold) && parsed.busyQueueThreshold > 0
      ? Math.min(200, Math.max(1, Math.floor(parsed.busyQueueThreshold)))
      : DEFAULT_QUEUE_SETTINGS.busyQueueThreshold,
    alertsOnDashboard: typeof parsed?.alertsOnDashboard === "boolean" ? parsed.alertsOnDashboard : DEFAULT_QUEUE_SETTINGS.alertsOnDashboard,
    alertsOnQueue: typeof parsed?.alertsOnQueue === "boolean" ? parsed.alertsOnQueue : DEFAULT_QUEUE_SETTINGS.alertsOnQueue,
  };
}

/** Synchronous local cache read — safe for first paint. */
export function getQueueSettings(branchId?: string | null): QueueSettings {
  if (typeof window === "undefined") return DEFAULT_QUEUE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(keyFor(branchId));
    if (!raw) return DEFAULT_QUEUE_SETTINGS;
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_QUEUE_SETTINGS;
  }
}

/** Write to local cache only (used as fallback). */
function cacheQueueSettings(branchId: string | null | undefined, value: QueueSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(branchId), JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("queue-settings-changed", { detail: { branchId } }));
  } catch { /* ignore */ }
}

/** Fetch persisted settings from the server. Falls back to local cache + defaults. */
export async function fetchQueueSettings(branchId: string | null | undefined): Promise<QueueSettings> {
  if (!branchId) return getQueueSettings(branchId);
  try {
    const { data, error } = await (supabase as any)
      .from("queue_settings")
      .select("long_wait_minutes,default_my_queue,show_no_shows_in_default,no_show_rate_threshold,busy_queue_threshold,alerts_on_dashboard,alerts_on_queue")
      .eq("branch_id", branchId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return getQueueSettings(branchId);
    const value = normalize({
      longWaitMinutes: data.long_wait_minutes,
      defaultMyQueue: data.default_my_queue,
      showNoShowsInDefault: data.show_no_shows_in_default,
      noShowRateThreshold: data.no_show_rate_threshold,
      busyQueueThreshold: data.busy_queue_threshold,
      alertsOnDashboard: data.alerts_on_dashboard,
      alertsOnQueue: data.alerts_on_queue,
    });
    cacheQueueSettings(branchId, value);
    return value;
  } catch {
    return getQueueSettings(branchId);
  }
}

/** Persist settings to the server (upsert by branch_id). Mirrors to local cache. */
export async function saveQueueSettings(branchId: string | null | undefined, value: QueueSettings): Promise<{ ok: boolean; error?: string }> {
  cacheQueueSettings(branchId, value); // optimistic cache
  if (!branchId) return { ok: true };  // no branch selected → cache only
  const payload = {
    branch_id: branchId,
    long_wait_minutes: value.longWaitMinutes,
    default_my_queue: value.defaultMyQueue,
    show_no_shows_in_default: value.showNoShowsInDefault,
    no_show_rate_threshold: value.noShowRateThreshold,
    busy_queue_threshold: value.busyQueueThreshold,
    alerts_on_dashboard: value.alertsOnDashboard,
    alerts_on_queue: value.alertsOnQueue,
  };
  const { error } = await (supabase as any)
    .from("queue_settings")
    .upsert(payload, { onConflict: "branch_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}