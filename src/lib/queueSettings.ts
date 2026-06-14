/**
 * Queue policy settings — minimal first step.
 *
 * NOTE: persistent server-side storage is intentionally avoided here to keep
 * Phase 5 schema-free. Settings are stored in localStorage per browser, scoped
 * by branch where relevant. A future migration can move these to a
 * `queue_settings` table without changing the consuming components.
 */
export type QueueSettings = {
  longWaitMinutes: number;          // banner / tint threshold
  defaultMyQueue: boolean;          // auto-select "My queue" for clinicians on load
  showNoShowsInDefault: boolean;    // include no_show rows in the default "active" view
};

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  longWaitMinutes: 30,
  defaultMyQueue: true,
  showNoShowsInDefault: false,
};

const keyFor = (branchId: string | null | undefined) =>
  `zmedico.queueSettings.${branchId ?? "global"}`;

export function getQueueSettings(branchId?: string | null): QueueSettings {
  if (typeof window === "undefined") return DEFAULT_QUEUE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(keyFor(branchId));
    if (!raw) return DEFAULT_QUEUE_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      longWaitMinutes: Number.isFinite(parsed?.longWaitMinutes) && parsed.longWaitMinutes > 0
        ? Math.min(240, Math.floor(parsed.longWaitMinutes))
        : DEFAULT_QUEUE_SETTINGS.longWaitMinutes,
      defaultMyQueue: typeof parsed?.defaultMyQueue === "boolean" ? parsed.defaultMyQueue : DEFAULT_QUEUE_SETTINGS.defaultMyQueue,
      showNoShowsInDefault: typeof parsed?.showNoShowsInDefault === "boolean" ? parsed.showNoShowsInDefault : DEFAULT_QUEUE_SETTINGS.showNoShowsInDefault,
    };
  } catch {
    return DEFAULT_QUEUE_SETTINGS;
  }
}

export function setQueueSettings(branchId: string | null | undefined, value: QueueSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(branchId), JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("queue-settings-changed", { detail: { branchId } }));
  } catch {
    /* ignore */
  }
}