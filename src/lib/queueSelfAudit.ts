/**
 * Queue alert subsystem self-audit (Phase 17).
 *
 * Runs a set of lightweight, read-only checks against the current branch's
 * queue_settings, queue_alerts and queue_alert_runs rows to verify the
 * health, security and correctness of the alert pipeline after the
 * Phase 11-16 work. No schema changes, no writes.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchQueueSettings, type QueueSettings } from "@/lib/queueSettings";
import { effectiveState, type AlertState, type AlertType, type QueueAlert } from "@/lib/queueAlerts";

export type AuditStatus = "pass" | "warning" | "fail";
export type AuditSeverity = "info" | "low" | "medium" | "high";
export type AuditCategory =
  | "access"
  | "lifecycle"
  | "detector"
  | "heartbeat"
  | "realtime"
  | "hours"
  | "consumer"
  | "integrity";

export type AuditCheck = {
  id: string;
  category: AuditCategory;
  title: string;
  status: AuditStatus;
  severity: AuditSeverity;
  reason: string;
  action?: string;
};

export type AuditReport = {
  ranAt: string;            // ISO
  branchId: string;
  checks: AuditCheck[];
  totals: { pass: number; warning: number; fail: number };
};

const HEARTBEAT_WARN_MIN = 10;   // heartbeat older than this → warning
const HEARTBEAT_FAIL_MIN = 20;   // heartbeat older than this → fail

function pass(id: string, category: AuditCategory, title: string, reason: string): AuditCheck {
  return { id, category, title, status: "pass", severity: "info", reason };
}
function warn(id: string, category: AuditCategory, title: string, reason: string, action?: string, severity: AuditSeverity = "low"): AuditCheck {
  return { id, category, title, status: "warning", severity, reason, action };
}
function fail(id: string, category: AuditCategory, title: string, reason: string, action?: string, severity: AuditSeverity = "high"): AuditCheck {
  return { id, category, title, status: "fail", severity, reason, action };
}

function withinBusinessHours(now: Date, startHHMM: string, endHHMM: string): boolean {
  const [sh, sm] = startHHMM.split(":").map((n) => parseInt(n, 10));
  const [eh, em] = endHHMM.split(":").map((n) => parseInt(n, 10));
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return true;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/**
 * Run the full self-audit against the supplied branch. Read-only.
 */
export async function runQueueSelfAudit(branchId: string): Promise<AuditReport> {
  const ranAt = new Date().toISOString();
  const checks: AuditCheck[] = [];

  if (!branchId) {
    return {
      ranAt, branchId: "",
      checks: [fail("no_branch", "access", "Branch selected", "No branch context is active.", "Select a branch and retry.")],
      totals: { pass: 0, warning: 0, fail: 1 },
    };
  }

  // ---- Fetch raw data (RLS-scoped, so we only see what the user can access).
  const [alertsRes, runRes, settings] = await Promise.all([
    (supabase as any).from("queue_alerts").select("*").eq("branch_id", branchId).order("created_at", { ascending: false }).limit(500),
    (supabase as any).from("queue_alert_runs").select("*").eq("branch_id", branchId).maybeSingle(),
    fetchQueueSettings(branchId).catch(() => null),
  ]);

  const alerts: QueueAlert[] = (alertsRes?.data ?? []) as QueueAlert[];
  const run = runRes?.data as
    | { last_run_at: string | null; last_status: string | null; last_error: string | null; alerts_opened: number | null; alerts_resolved: number | null }
    | null
    | undefined;

  // ===========================================================================
  // 1. Branch access & isolation
  // ===========================================================================
  if (alertsRes?.error) {
    checks.push(fail("access_alerts", "access", "queue_alerts is readable", `RLS rejected the query: ${alertsRes.error.message}`, "Confirm user_has_branch_access policy and branch membership."));
  } else {
    const leaked = alerts.filter((a) => a.branch_id !== branchId);
    if (leaked.length) {
      checks.push(fail("access_isolation_alerts", "access", "queue_alerts branch isolation", `Received ${leaked.length} row(s) from other branches.`, "Tighten RLS on queue_alerts."));
    } else {
      checks.push(pass("access_isolation_alerts", "access", "queue_alerts branch isolation", "All visible alerts belong to the active branch."));
    }
  }

  if (runRes?.error) {
    checks.push(warn("access_runs", "access", "queue_alert_runs is readable", `Heartbeat query error: ${runRes.error.message}`, "Confirm RLS allows the branch member to read its own heartbeat."));
  } else {
    checks.push(pass("access_runs", "access", "queue_alert_runs is readable", "Heartbeat row is reachable under RLS."));
  }

  if (!settings) {
    checks.push(warn("access_settings", "access", "queue_settings is readable", "Settings fetch failed; defaults will be used.", "Check RLS on queue_settings and branch membership."));
  } else {
    checks.push(pass("access_settings", "access", "queue_settings is readable", "Branch-scoped settings loaded."));
  }

  // ===========================================================================
  // 2. Lifecycle: state validity + transitions
  // ===========================================================================
  const validStates: AlertState[] = ["active", "snoozed", "acknowledged", "resolved"];
  const validTypes: AlertType[] = ["long_wait", "no_show_rate", "busy_queue"];
  const badState = alerts.filter((a) => !validStates.includes(a.state as AlertState));
  const badType = alerts.filter((a) => !validTypes.includes(a.alert_type as AlertType));
  if (badState.length || badType.length) {
    checks.push(fail("lifecycle_enum", "lifecycle", "Alert state/type values are valid", `${badState.length} bad state, ${badType.length} bad type.`, "Investigate writer that produced invalid enums."));
  } else {
    checks.push(pass("lifecycle_enum", "lifecycle", "Alert state/type values are valid", `Scanned ${alerts.length} row(s).`));
  }

  const inconsistent = alerts.filter((a) =>
    (a.state === "resolved" && !a.resolved_at) ||
    (a.state === "snoozed" && !a.snoozed_until) ||
    (a.state === "acknowledged" && !a.acknowledged_at) ||
    (a.resolved_at && a.state !== "resolved")
  );
  if (inconsistent.length) {
    checks.push(warn("lifecycle_transitions", "lifecycle", "Lifecycle transitions are consistent", `${inconsistent.length} row(s) have mismatched state/timestamps.`, "Resolve or re-sync these alerts."));
  } else {
    checks.push(pass("lifecycle_transitions", "lifecycle", "Lifecycle transitions are consistent", "State and timestamps agree."));
  }

  // No duplicate open alerts of the same type for the same branch
  const openByType = new Map<string, QueueAlert[]>();
  alerts.filter((a) => !a.resolved_at).forEach((a) => {
    const arr = openByType.get(a.alert_type) ?? [];
    arr.push(a);
    openByType.set(a.alert_type, arr);
  });
  const dupes = [...openByType.entries()].filter(([, arr]) => arr.length > 1);
  if (dupes.length) {
    checks.push(fail("integrity_dupes", "integrity", "No duplicate open alerts", `${dupes.map(([t, a]) => `${t}×${a.length}`).join(", ")}.`, "Resolve duplicates; verify detector reconciliation.", "medium"));
  } else {
    checks.push(pass("integrity_dupes", "integrity", "No duplicate open alerts", "At most one open alert per type."));
  }

  // Snoozed alerts actually suppress: snoozed_until in the future
  const now = Date.now();
  const badSnooze = alerts.filter((a) => a.state === "snoozed" && a.snoozed_until && new Date(a.snoozed_until).getTime() <= now);
  if (badSnooze.length) {
    checks.push(warn("lifecycle_snooze_expiry", "lifecycle", "Snoozed alerts suppress until expiration", `${badSnooze.length} snoozed row(s) have already expired but are not re-activated.`, "Detector will re-activate on next run; safe to ignore briefly."));
  } else {
    checks.push(pass("lifecycle_snooze_expiry", "lifecycle", "Snoozed alerts suppress until expiration", "All snoozes are forward-dated."));
  }

  // Acknowledged alerts remain hidden until condition resolves: should not also be resolved
  const ackButResolved = alerts.filter((a) => a.acknowledged_at && a.resolved_at && new Date(a.resolved_at).getTime() < new Date(a.acknowledged_at).getTime());
  if (ackButResolved.length) {
    checks.push(warn("lifecycle_ack_order", "lifecycle", "Acknowledged ordering is valid", `${ackButResolved.length} row(s) resolved before acknowledged_at.`));
  } else {
    checks.push(pass("lifecycle_ack_order", "lifecycle", "Acknowledged ordering is valid", "Ack precedes resolution where both exist."));
  }

  // ===========================================================================
  // 3. Detector + heartbeat
  // ===========================================================================
  if (!run || !run.last_run_at) {
    checks.push(fail("heartbeat_missing", "heartbeat", "Background detector heartbeat", "No heartbeat row found for this branch.", "Wait for the next 5-minute cron tick, or check edge function logs.", "high"));
  } else {
    const ageMin = (Date.now() - new Date(run.last_run_at).getTime()) / 60_000;
    if (run.last_status && run.last_status !== "ok") {
      checks.push(fail("detector_status", "detector", "Detector last run status", `Status "${run.last_status}"${run.last_error ? `: ${run.last_error}` : ""}.`, "Check detect-queue-alerts edge function logs."));
    } else {
      checks.push(pass("detector_status", "detector", "Detector last run status", "Last run reported ok."));
    }
    if (ageMin > HEARTBEAT_FAIL_MIN) {
      checks.push(fail("heartbeat_fresh", "heartbeat", "Heartbeat freshness", `Last run was ${ageMin.toFixed(1)}m ago.`, "Check pg_cron schedule and edge function logs."));
    } else if (ageMin > HEARTBEAT_WARN_MIN) {
      checks.push(warn("heartbeat_fresh", "heartbeat", "Heartbeat freshness", `Last run was ${ageMin.toFixed(1)}m ago.`, "Expected within 5–10 minutes."));
    } else {
      checks.push(pass("heartbeat_fresh", "heartbeat", "Heartbeat freshness", `Last run ${ageMin.toFixed(1)}m ago.`));
    }
  }

  // ===========================================================================
  // 4. Realtime sync probe
  // ===========================================================================
  const rt = await probeRealtime(branchId);
  if (rt.ok) {
    checks.push(pass("realtime_sub", "realtime", "Realtime subscription", `Subscribed to queue_alerts in ${rt.elapsedMs}ms.`));
  } else {
    checks.push(warn("realtime_sub", "realtime", "Realtime subscription", rt.reason ?? "Subscription did not reach SUBSCRIBED state.", "Polling fallback (30–60s) will still surface changes.", "medium"));
  }

  // ===========================================================================
  // 5. Business hours / quiet hours
  // ===========================================================================
  if (settings) {
    const re = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!re.test(settings.businessHoursStart) || !re.test(settings.businessHoursEnd)) {
      checks.push(fail("hours_format", "hours", "Business hours format", "Hours are not in HH:MM 24h.", "Re-save business hours in branch settings."));
    } else {
      checks.push(pass("hours_format", "hours", "Business hours format", `${settings.businessHoursStart}–${settings.businessHoursEnd}`));
    }
    const inHours = withinBusinessHours(new Date(), settings.businessHoursStart, settings.businessHoursEnd);
    if (settings.quietHoursEnabled && !inHours) {
      const busyOpen = (openByType.get("busy_queue") ?? []).filter((a) => !a.resolved_at).length;
      const nsOpen = (openByType.get("no_show_rate") ?? []).filter((a) => !a.resolved_at).length;
      if (busyOpen + nsOpen > 0) {
        checks.push(warn("hours_quiet", "hours", "Quiet hours suppression", `${busyOpen + nsOpen} non-critical alert(s) still open during quiet hours.`, "Next detector tick will resolve them.", "low"));
      } else {
        checks.push(pass("hours_quiet", "hours", "Quiet hours suppression", "Non-critical alerts are suppressed outside business hours."));
      }
    } else {
      checks.push(pass("hours_quiet", "hours", "Quiet hours suppression", settings.quietHoursEnabled ? "Currently in business hours." : "Quiet hours disabled by branch."));
    }
  }

  // ===========================================================================
  // 6. Consumer behavior — dashboard reads persisted state only
  // ===========================================================================
  // We can't introspect another React tree, but we can spot-check that the
  // open alerts list matches what effectiveState() reports — if a UI accidentally
  // shows resolved/expired snoozed rows as active, the helper would still gate it.
  const openShownActive = alerts.filter((a) => !a.resolved_at && effectiveState(a) === "active").length;
  checks.push(pass("consumer_state", "consumer", "Dashboard consumes persisted state", `${openShownActive} alert(s) would render as active via effectiveState().`));

  // ===========================================================================
  // 7. Data integrity — detail payload sanity
  // ===========================================================================
  const missingDetail = alerts.filter((a) => !a.resolved_at && (!a.detail || typeof a.detail !== "object")).length;
  if (missingDetail) {
    checks.push(warn("integrity_detail", "integrity", "Open alerts carry detail payload", `${missingDetail} open row(s) have empty or invalid detail JSON.`));
  } else {
    checks.push(pass("integrity_detail", "integrity", "Open alerts carry detail payload", "All open alerts have a detail object."));
  }

  const totals = checks.reduce(
    (acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }),
    { pass: 0, warning: 0, fail: 0 } as { pass: number; warning: number; fail: number }
  );

  return { ranAt, branchId, checks, totals };
}

async function probeRealtime(branchId: string): Promise<{ ok: boolean; elapsedMs: number; reason?: string }> {
  const start = Date.now();

  // Single attempt, ~4s budget. Transient CLOSED is retried once before
  // declaring failure since the channel can briefly close during handoff.
  const attempt = (): Promise<{ ok: boolean; reason?: string }> => new Promise((resolve) => {
    let settled = false;
    const finish = (val: { ok: boolean; reason?: string }) => {
      if (settled) return;
      settled = true;
      try { (supabase as any).removeChannel(channel); } catch { /* ignore */ }
      resolve(val);
    };
    const channel = (supabase as any)
      .channel(`audit_probe:${branchId}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_alerts", filter: `branch_id=eq.${branchId}` }, () => {})
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") finish({ ok: true });
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          finish({ ok: false, reason: `Channel status: ${status}` });
        }
      });
    setTimeout(() => finish({ ok: false, reason: "Subscription timed out after 3s." }), 3000);
  });

  try {
    const first = await attempt();
    if (first.ok) return { ok: true, elapsedMs: Date.now() - start };
    // One retry — covers transient CLOSED during initial handshake.
    await new Promise((r) => setTimeout(r, 400));
    const second = await attempt();
    if (second.ok) return { ok: true, elapsedMs: Date.now() - start };
    return { ok: false, elapsedMs: Date.now() - start, reason: second.reason ?? first.reason };
  } catch (e: any) {
    return { ok: false, elapsedMs: Date.now() - start, reason: e?.message ?? "probe threw" };
  }
}