// Phase 15: Background queue-alert detector.
//
// For each active branch, fetch today's appointments + queue_settings, compute
// the same three alert conditions used by the dashboard (long_wait, busy_queue,
// no_show_rate), and reconcile queue_alerts so alerts exist independent of any
// open dashboard session. Heartbeat written to queue_alert_runs.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type AlertType = "long_wait" | "no_show_rate" | "busy_queue";
type Condition = { type: AlertType; active: boolean; detail: Record<string, unknown> };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function withinBusinessHours(hhmmStart: string, hhmmEnd: string, now = new Date()): boolean {
  const parse = (s: string): number | null => {
    const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(s ?? "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = parse(hhmmStart);
  const end = parse(hhmmEnd);
  if (start == null || end == null) return true; // safe default
  const cur = now.getHours() * 60 + now.getMinutes();
  // Handle overnight windows (e.g. 22:00 → 06:00)
  return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

function computeConditions(rows: any[], settings: any): Condition[] {
  const longWaitMin = Number(settings?.long_wait_minutes ?? 30);
  const noShowAt    = Number(settings?.no_show_rate_threshold ?? 25);
  const busyAt      = Number(settings?.busy_queue_threshold ?? 8);
  const quietHours  = settings?.quiet_hours_enabled !== false; // default on
  const bhStart     = settings?.business_hours_start ?? "08:00";
  const bhEnd       = settings?.business_hours_end ?? "18:00";
  const inHours     = withinBusinessHours(bhStart, bhEnd);
  // Quiet hours suppress non-actionable alerts (busy queue, no-show rate).
  // long_wait stays on always because a patient already waiting in the lobby
  // is actionable regardless of clock time.
  const suppressNonCritical = quietHours && !inHours;
  const now = Date.now();

  let waiting = 0, noShow = 0;
  let longestWaitMs = 0;
  let longestName: string | null = null;

  for (const r of rows) {
    if (r.status === "scheduled" || r.status === "confirmed") waiting++;
    if (r.status === "no_show") noShow++;
    if (r.checked_in_at && !r.started_at && (r.status === "scheduled" || r.status === "confirmed")) {
      const w = now - new Date(r.checked_in_at).getTime();
      if (w > longestWaitMs) {
        longestWaitMs = w;
        const p = r.patients;
        longestName = p ? `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim() : null;
      }
    }
  }

  const total = rows.length;
  const longestWaitMinutes = Math.floor(longestWaitMs / 60000);
  const noShowRate = total ? Math.round((noShow / total) * 100) : 0;

  return [
    {
      type: "long_wait",
      active: longestWaitMinutes >= longWaitMin && longestWaitMs > 0,
      detail: { longestWaitMin: longestWaitMinutes, threshold: longWaitMin, patient: longestName, inHours },
    },
    {
      type: "no_show_rate",
      active: !suppressNonCritical && noShowRate >= noShowAt && total >= 4,
      detail: { noShowRate, threshold: noShowAt, total, inHours },
    },
    {
      type: "busy_queue",
      active: !suppressNonCritical && waiting >= busyAt,
      detail: { waiting, threshold: busyAt, inHours },
    },
  ];
}

async function processBranch(admin: any, branchId: string) {
  const tStart = startOfDay(new Date()).toISOString();
  const tEnd = endOfDay(new Date()).toISOString();

  const [{ data: rows }, { data: settings }] = await Promise.all([
    admin
      .from("appointments")
      .select("id,status,scheduled_at,checked_in_at,started_at,patients(first_name_en,last_name_en)")
      .eq("branch_id", branchId)
      .gte("scheduled_at", tStart)
      .lte("scheduled_at", tEnd),
    admin
      .from("queue_settings")
      .select("long_wait_minutes,no_show_rate_threshold,busy_queue_threshold,business_hours_start,business_hours_end,quiet_hours_enabled")
      .eq("branch_id", branchId)
      .maybeSingle(),
  ]);

  const conditions = computeConditions(rows ?? [], settings ?? {});

  // Existing open (non-resolved) rows for this branch.
  const { data: openRows } = await admin
    .from("queue_alerts")
    .select("*")
    .eq("branch_id", branchId)
    .is("resolved_at", null);
  const byType = new Map<AlertType, any>();
  (openRows ?? []).forEach((a: any) => byType.set(a.alert_type, a));

  const inserts: any[] = [];
  const updates: Array<{ id: string; patch: any }> = [];
  const resolutions: string[] = [];

  for (const c of conditions) {
    const existing = byType.get(c.type);
    if (c.active) {
      if (!existing) {
        inserts.push({ branch_id: branchId, alert_type: c.type, state: "active", detail: c.detail });
      } else if (JSON.stringify(existing.detail ?? {}) !== JSON.stringify(c.detail ?? {})) {
        updates.push({ id: existing.id, patch: { detail: c.detail } });
      }
    } else if (existing) {
      resolutions.push(existing.id);
    }
  }

  if (inserts.length) await admin.from("queue_alerts").insert(inserts);
  for (const u of updates) await admin.from("queue_alerts").update(u.patch).eq("id", u.id);
  if (resolutions.length) {
    await admin
      .from("queue_alerts")
      .update({ state: "resolved", resolved_at: new Date().toISOString() })
      .in("id", resolutions);
  }

  return { opened: inserts.length, resolved: resolutions.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { data: branches, error: bErr } = await admin
      .from("branches")
      .select("id, is_active")
      .eq("is_active", true);
    if (bErr) throw bErr;

    const results: Array<{ branch_id: string; opened: number; resolved: number; status: string; error?: string }> = [];
    for (const b of branches ?? []) {
      try {
        const { opened, resolved } = await processBranch(admin, b.id);
        await admin.from("queue_alert_runs").upsert({
          branch_id: b.id,
          last_run_at: new Date().toISOString(),
          last_status: "ok",
          last_error: null,
          alerts_opened: opened,
          alerts_resolved: resolved,
        });
        results.push({ branch_id: b.id, opened, resolved, status: "ok" });
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        await admin.from("queue_alert_runs").upsert({
          branch_id: b.id,
          last_run_at: new Date().toISOString(),
          last_status: "error",
          last_error: msg.slice(0, 500),
          alerts_opened: 0,
          alerts_resolved: 0,
        });
        results.push({ branch_id: b.id, opened: 0, resolved: 0, status: "error", error: msg });
      }
    }

    return new Response(JSON.stringify({ ok: true, branches: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});